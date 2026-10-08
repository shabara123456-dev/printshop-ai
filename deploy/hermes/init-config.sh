#!/command/with-contenv sh
set -eu

data_home="${HERMES_HOME:-/opt/data}"
mkdir -p "$data_home"
config="$data_home/config.yaml"
marker="$data_home/.inkora-config-initialized"
if [ ! -f "$marker" ]; then
cat > "$config" <<'YAML'
model:
  default: gemini-3.5-flash-lite
  provider: gemini
  base_url: https://generativelanguage.googleapis.com/v1beta

gateway:
  api_server:
    enabled: true
    host: 0.0.0.0
    port: 10000
    max_concurrent_runs: 1
  allow_all_users: false

platform_toolsets:
  api_server:
    - mcp-inkora

tool_loop_guardrails:
  hard_stop_enabled: true
  hard_stop_after:
    exact_failure: 5
    idempotent_no_progress: 5

mcp_servers:
  inkora:
    url: https://printshop-ai.shabara123456.workers.dev/mcp
    headers:
      Authorization: "Bearer ${HERMES_TOOL_API_KEY}"
    timeout: 60
    connect_timeout: 30
    tools:
      include:
        - search_products
        - get_product_details
        - list_manager_products
        - calculate_quote
        - check_inventory
        - get_low_stock_items
        - get_purchase_suggestions
        - get_production_status
        - get_order_status
        - get_sales_report
        - list_store_verticals
        - get_storefront_config
        - prepare_storefront_update
        - create_material
        - record_material_receipt
        - update_product_details
        - create_product_draft
        - update_order_status
        - update_production_status
      resources: false
      prompts: false
YAML

chown hermes:hermes "$config"
chmod 0600 "$config"
touch "$marker"
chown hermes:hermes "$marker"
fi
