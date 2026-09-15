import { useState, useRef, useEffect } from "react";

export default function Assistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.content,
          conversationHistory: messages,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error}`, citations: [] },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response,
            citations: data.citations || [],
            toolsUsed: data.toolsUsed,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message}`, citations: [] },
      ]);
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold">Investigation Assistant</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Ask about policies, customer history, or flagged transactions
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-gray-400 text-center mt-10">
            <p>Try asking:</p>
            <div className="mt-3 space-y-2">
              {[
                "What is the procedure for investigating a flagged transaction?",
                "Show me customer C-0001's recent transactions",
                "What are the SAR filing requirements?",
                "What is the escalation matrix for a critical alert?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="block mx-auto text-xs text-gray-500 border border-gray-200 px-3 py-1.5 hover:border-black hover:text-black"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] text-sm ${
                msg.role === "user"
                  ? "bg-black text-white px-4 py-2"
                  : "bg-white border border-gray-200 px-4 py-3"
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              {msg.citations?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Sources</p>
                  <div className="flex flex-wrap gap-1">
                    {msg.citations.map((c, j) => (
                      <span
                        key={j}
                        className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5"
                      >
                        {c.source}: {c.section}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {msg.toolsUsed && (
                <p className="text-xs text-gray-400 mt-1">Used tool calling</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 px-4 py-3 text-sm text-gray-500">
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-4 border-t border-gray-200 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about policies, customers, or transactions..."
            className="flex-1 border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-black"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-black text-white text-sm font-medium disabled:opacity-30 hover:bg-gray-800"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
