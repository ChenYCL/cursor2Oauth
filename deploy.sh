#!/usr/bin/env bash
set -euo pipefail

IMAGE="ghcr.io/chenycl/cursor2oauth"
PORT="${PORT:-8010}"
API_KEY="${API_KEY:-}"

echo "============================================"
echo "  Cursor2OAuth - One-Click Deploy"
echo "============================================"
echo ""

check_docker() {
  if ! command -v docker &>/dev/null; then
    echo "Docker not found. Installing..."
    curl -fsSL https://get.docker.com | bash
    sudo usermod -aG docker "$USER"
    echo "Please log out and back in, then re-run this script."
    exit 0
  fi
}

check_login() {
  if [ ! -f "$HOME/.cursor/cli-config.json" ]; then
    echo "Cursor CLI not logged in."
    echo "Run: agent login"
    echo "Then re-run this script."
    exit 1
  fi
  echo "Cursor CLI: logged in"
}

deploy_docker() {
  echo "Building Docker image..."
  docker build -t cursor2oauth:latest .

  echo ""
  echo "Starting container..."
  docker rm -f cursor2oauth 2>/dev/null || true

  docker run -d \
    --name cursor2oauth \
    --restart unless-stopped \
    -p "$PORT:8010" \
    -e PORT=8010 \
    -e HOST=0.0.0.0 \
    -e XDG_CONFIG_HOME=/root/.cursor/xdg-config \
    ${API_KEY:+-e API_KEY="$API_KEY"} \
    ${CURSOR_API_KEY:+-e CURSOR_API_KEY="$CURSOR_API_KEY"} \
    -v "$HOME/.cursor:/root/.cursor" \
    cursor2oauth:latest

  echo ""
  echo "Container started!"
  echo "  API: http://localhost:$PORT"
  echo "  OpenAI: http://localhost:$PORT/v1/chat/completions"
  echo "  Anthropic: http://localhost:$PORT/v1/messages"
  echo "  Models: http://localhost:$PORT/v1/models"
  echo ""
  echo "Check logs: docker logs -f cursor2oauth"
}

deploy_compose() {
  echo "Starting with docker-compose..."
  export API_KEY
  docker compose up -d --build

  echo ""
  echo "Started!"
  echo "  API: http://localhost:$PORT"
}

echo "Choose deploy method:"
echo "  1) Docker (recommended)"
echo "  2) docker-compose"
echo "  3) npm (direct)"
read -rp "Choice [1]: " choice
choice="${choice:-1}"

case "$choice" in
  1) check_docker; check_login; deploy_docker ;;
  2) check_docker; check_login; deploy_compose ;;
  3)
    npm install --production
    exec node server.js
    ;;
esac