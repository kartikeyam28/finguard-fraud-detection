# Stage 1: Python ML Pipeline
FROM python:3.10-slim AS python-builder

# Install system dependencies (SQLite)
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/python
COPY python/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy python source
COPY python/ .
COPY sql/ ../sql/

# Need Kaggle credentials to run data pipeline
# These will need to be provided as build args or secrets if running during build
# For this project, we assume outputs are generated locally and committed/copied,
# or we run it at startup. Given Kaggle auth requirements, it's safer to just
# copy pre-generated outputs, OR run the pipeline IF outputs don't exist.
# Let's assume the user runs the pipeline locally and we just copy the outputs.
# Alternatively, if we want the Docker container to build it:
# RUN python data_pipeline.py && python model_training.py ... (requires KAGGLE_USERNAME/KEY)

# For now, let's just make sure the environment is ready.
# In a real CI/CD, we'd pass Kaggle secrets to build the DB here.
# Since this is a demo, we'll assume the `python/outputs` directory is populated
# before building, OR we run a startup script.

# Stage 2: Node.js Backend & React Frontend
FROM node:20-slim AS node-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ .
RUN npm run build

# Stage 3: Final Production Image
FROM node:20-slim
WORKDIR /app

# Copy Python environment (optional, if we needed to run Python at runtime)
# We designed the architecture to NOT need Python at runtime (pre-computed scores).

# Install sqlite3 for the Node.js better-sqlite3 package
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy server code
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --production
COPY server/ .

# Copy built frontend
COPY --from=node-builder /app/client/dist /app/client/dist

# Copy Python outputs (SQLite DB, segments JSON, metrics JSON)
# We assume these were generated locally before docker build
COPY python/outputs /app/python/outputs
COPY python/policy_docs /app/python/policy_docs

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "index.js"]
