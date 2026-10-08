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

workflow_dir=/home/node/.n8n/inkora-workflows
marker=/home/node/.n8n/.inkora-workflows-imported
if [ -d /opt/inkora/workflows ] && [ ! -f "$marker" ]; then
  mkdir -p "$workflow_dir" /home/node/.n8n/tmp
  for source in /opt/inkora/workflows/*.json; do
    [ -f "$source" ] || continue
    filename=$(basename "$source")
    sed "s|http://host.docker.internal:3000|${INKORA_API_BASE_URL:-https://printshop-ai.shabara123456.workers.dev}|g" "$source" > "/home/node/.n8n/tmp/$filename"
    node -e 'const fs=require("node:fs");const src=process.argv[1], dst=process.argv[2];const parsed=JSON.parse(fs.readFileSync(src,"utf8"));const workflows=Array.isArray(parsed)?parsed:[parsed];for (const [i,w] of workflows.entries()) fs.writeFileSync(`${dst}/${i}-${w.id||"workflow"}.json`, JSON.stringify(w));' "/home/node/.n8n/tmp/$filename" "$workflow_dir"
  done
  if ls "$workflow_dir"/*.json >/dev/null 2>&1; then
    n8n import:workflow --separate --input="$workflow_dir"
    touch "$marker"
  fi
  rm -rf /home/node/.n8n/tmp
fi

exec n8n start
