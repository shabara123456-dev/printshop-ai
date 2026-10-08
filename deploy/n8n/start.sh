#!/bin/sh
set -eu

export N8N_HOST="${RENDER_EXTERNAL_HOSTNAME:-localhost}"
export N8N_PORT="${PORT:-5678}"
export N8N_PROTOCOL="https"
if [ -n "${RENDER_EXTERNAL_HOSTNAME:-}" ]; then
  export WEBHOOK_URL="https://${RENDER_EXTERNAL_HOSTNAME}/"
  export N8N_EDITOR_BASE_URL="https://${RENDER_EXTERNAL_HOSTNAME}/"
else
  export WEBHOOK_URL="http://localhost:${N8N_PORT}/"
  export N8N_EDITOR_BASE_URL="http://localhost:${N8N_PORT}/"
fi

exec n8n start
