#!/command/with-contenv sh
set -eu

echo "[inkora-hermes] Starting gateway with container environment loaded"

for name in API_SERVER_KEY GOOGLE_API_KEY HERMES_TOOL_API_KEY; do
  case "$name" in
    API_SERVER_KEY) value="${API_SERVER_KEY:-}" ;;
    GOOGLE_API_KEY) value="${GOOGLE_API_KEY:-}" ;;
    HERMES_TOOL_API_KEY) value="${HERMES_TOOL_API_KEY:-}" ;;
  esac
  if [ -n "$value" ]; then
    echo "[inkora-hermes] $name is configured"
  else
    echo "[inkora-hermes] ERROR: $name is missing"
    exit 1
  fi
done

config="${HERMES_HOME:-/opt/data}/config.yaml"
if [ ! -r "$config" ]; then
  echo "[inkora-hermes] ERROR: Hermes config is missing at $config"
  exit 1
fi

echo "[inkora-hermes] Config is present; launching gateway"
exec hermes gateway run --no-supervise -v
