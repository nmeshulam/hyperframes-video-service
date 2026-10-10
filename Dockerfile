FROM node:22-bookworm-slim

# Install system dependencies:
# - chromium & fonts for headless browser rendering
# - ffmpeg for audio/video muxing
# - python3, python3-pip, python3-venv for rembg AI segmentation
# - curl & git for tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
    curl \
    git \
    unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Configure Chromium and HyperFrames for container environment
ENV NODE_ENV=production \
    PORT=8080 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    HYPERFRAMES_WORKER_COUNT=3 \
    U2NET_HOME=/app/.u2net \
    PYTHONUNBUFFERED=1

# Install Python background-removal AI dependencies in dedicated virtualenv
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir \
    "rembg[cpu]>=2.0.50" \
    "onnxruntime>=1.16.0" \
    "pillow>=10.0.0" \
    "numpy>=1.24.0"

# Pre-download the 'silueta' ONNX model into layer cache (0 runtime download latency)
COPY scripts/download_models.py ./scripts/download_models.py
RUN python3 ./scripts/download_models.py

# Install Node.js dependencies and HyperFrames CLI globally
COPY package.json package-lock.json* tsconfig.json ./
RUN npm install --include=dev && npm install -g typescript hyperframes@0.8.143 && npx hyperframes browser ensure

# Copy application source & assets
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY assets/ ./assets/

# Seed latest HyperFrames skills into agent directories
RUN mkdir -p /root/.claude/skills /root/.agents/skills && \
    cp -r ./assets/skills/* /root/.claude/skills/ && \
    cp -r ./assets/skills/* /root/.agents/skills/

# Compile TypeScript
RUN npx tsc

# Create temporary job and render directories
RUN mkdir -p /tmp/hyperframes-jobs /app/renders

EXPOSE 8080

CMD ["node", "dist/server.js"]
