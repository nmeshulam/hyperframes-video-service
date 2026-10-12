#!/usr/bin/env bash
set -e

CONTAINER_NAME="hyperframes-video-service"
IMAGE_NAME="hyperframes-video-service:local"
PORT="${PORT:-8080}"

echo "========================================================"
echo "🚀 Building & Launching HyperFrames Service in Podman..."
echo "========================================================"

# Sync host clock to podman machine to prevent TLS CERT_NOT_YET_VALID errors
podman machine ssh "sudo date -s '$(date -u +"%Y-%m-%d %H:%M:%S")'" 2>/dev/null || true

# 1. Stop and remove existing container if running
if podman ps -a --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}\$"; then
  echo "🛑 Stopping existing container '${CONTAINER_NAME}'..."
  podman stop "${CONTAINER_NAME}" || true
  podman rm "${CONTAINER_NAME}" || true
fi

# 2. Build the Podman container
echo "📦 Building Podman image '${IMAGE_NAME}'..."
podman build -t "${IMAGE_NAME}" .

# 3. Determine environment file
ENV_FILE=""
if [ -f ".env" ]; then
  ENV_FILE="--env-file .env"
elif [ -f "../New-video-generator/.env" ]; then
  ENV_FILE="--env-file ../New-video-generator/.env"
fi

# 4. Check for Google Cloud Credentials
GCP_MOUNT=""
if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ] && [ -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  GCP_MOUNT="-v ${GOOGLE_APPLICATION_CREDENTIALS}:/key.json:ro -e GOOGLE_APPLICATION_CREDENTIALS=/key.json"
elif [ -f "$HOME/.config/gcloud/application_default_credentials.json" ]; then
  GCP_MOUNT="-v $HOME/.config/gcloud:/root/.config/gcloud:ro"
fi

# 5. Run the container
echo "▶️ Starting container '${CONTAINER_NAME}' on port ${PORT}..."
podman run -d \
  -v "$(pwd)/assets:/app/assets:ro" \
  -v "$(pwd)/renders:/app/renders" \
  -v "$(pwd)/cache:/app/cache" \
  --name "${CONTAINER_NAME}" \
  -p "${PORT}:8080" \
  ${ENV_FILE} \
  ${GCP_MOUNT} \
  "${IMAGE_NAME}"

# 6. Verify health
echo "⏳ Waiting for service to become ready..."
sleep 3
for i in {1..10}; do
  if curl -s "http://127.0.0.1:${PORT}/health" | grep -q "ok"; then
    echo "✅ HyperFrames Video Service is UP and running on http://127.0.0.1:${PORT}!"
    echo "   Test with: curl http://127.0.0.1:${PORT}/health"
    echo "   Logs with: podman logs -f ${CONTAINER_NAME}"
    exit 0
  fi
  sleep 1
done

echo "⚠️ Container started, check logs: podman logs ${CONTAINER_NAME}"
