"""
FinGuard Vectorstore Builder
Embeds policy documents into ChromaDB for RAG retrieval.
"""

import os
from pathlib import Path

import chromadb
from chromadb.utils import embedding_functions

POLICY_DIR = Path(__file__).parent / "policy_docs"
OUTPUT_DIR = Path(__file__).parent / "outputs"
CHROMA_DIR = OUTPUT_DIR / "chromadb"

CHUNK_SIZE = 500  # words
CHUNK_OVERLAP = 50  # words


def chunk_text(text: str, source: str) -> list[dict]:
    """Split text into overlapping chunks."""
    words = text.split()
    chunks = []
    start = 0

    while start < len(words):
        end = min(start + CHUNK_SIZE, len(words))
        chunk_text = " ".join(words[start:end])

        # Extract section heading if available
        lines = chunk_text.split("\n")
        section = ""
        for line in lines:
            if line.startswith("#"):
                section = line.strip("# ").strip()
                break

        chunks.append({
            "text": chunk_text,
            "source": source,
            "section": section,
            "chunk_index": len(chunks),
        })

        if end >= len(words):
            break
        start += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


def main():
    print("=" * 60)
    print("FinGuard Vectorstore Builder")
    print("=" * 60)

    # Collect and chunk all policy docs
    all_chunks = []
    policy_files = sorted(POLICY_DIR.glob("*.md"))

    if not policy_files:
        print(f"No policy docs found in {POLICY_DIR}")
        return

    for policy_file in policy_files:
        print(f"  Processing: {policy_file.name}")
        text = policy_file.read_text()
        source_name = policy_file.stem.replace("_", " ").title()
        chunks = chunk_text(text, source_name)
        all_chunks.extend(chunks)
        print(f"    -> {len(chunks)} chunks")

    print(f"\nTotal chunks: {len(all_chunks)}")

    # Initialize ChromaDB
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))

    # Use default embedding function (all-MiniLM-L6-v2)
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name="all-MiniLM-L6-v2"
    )

    # Delete collection if it exists (rebuild)
    try:
        client.delete_collection("policy_docs")
    except Exception:
        pass

    collection = client.create_collection(
        name="policy_docs",
        embedding_function=ef,
        metadata={"description": "Fraud investigation and AML policy documents"},
    )

    # Add chunks to collection
    ids = [f"chunk_{i}" for i in range(len(all_chunks))]
    documents = [c["text"] for c in all_chunks]
    metadatas = [
        {"source": c["source"], "section": c["section"], "chunk_index": c["chunk_index"]}
        for c in all_chunks
    ]

    collection.add(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
    )

    print(f"\nStored {len(all_chunks)} chunks in ChromaDB at {CHROMA_DIR}")
    print(f"Collection: {collection.name}, count: {collection.count()}")

    # Test query
    test_results = collection.query(
        query_texts=["What is the procedure for investigating a flagged transaction?"],
        n_results=3,
    )
    print(f"\nTest query results:")
    for i, (doc, meta) in enumerate(zip(test_results["documents"][0], test_results["metadatas"][0])):
        print(f"  [{i+1}] Source: {meta['source']}, Section: {meta['section']}")
        print(f"      {doc[:100]}...")


if __name__ == "__main__":
    main()
