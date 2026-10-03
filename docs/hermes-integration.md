# Hermes integration

PrintShop AI exposes a local MCP bridge for Hermes. Read tools are available for verified lookup. A small manager write allowlist can be enabled separately; Hermes Agent supports local stdio MCP servers and per-server tool filtering: [Hermes MCP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/).

## Tools available

- `search_products`: search active print products and variants.
- `get_product_details`: retrieve one product by UUID.
- `calculate_quote`: calculate a quote from the approved backend pricing rules.
- `check_inventory`, `get_low_stock_items`, `get_purchase_suggestions`: manager read-only inventory tools.
- `get_production_status`, `get_order_status`, `get_sales_report`: manager read-only operations and reporting tools.
- `create_material`, `record_material_receipt`, `update_product_details`, `update_order_status`, `update_production_status`: confirmation-gated manager actions. Hermes first creates a 10-minute pending proposal. The manager must reply in the authenticated dashboard chat with `I CONFIRM THIS CHANGE <action_id>`; the API binds the next tool run to that exact proposal and user. The direct Hermes CLI can still perform reads, but writes require the authenticated dashboard chat context. Each action includes a reason and records requested/completed audit entries.

The MCP process calls the local backend API. It does not receive Supabase credentials or issue SQL. Quote calculation is a public, read-only API operation; persisting a quote still requires a signed-in customer or authorized staff account through the normal API. Manager tools use a separate server-to-server key and expose only fixed allowlisted operations.

Manager writes are disabled by default. Set `HERMES_WRITE_TOOLS_ENABLED=true` and `HERMES_MANAGER_USER_ID` in the API `.env`, register the MCP server with `HERMES_TOOL_API_KEY` in its environment, then restart the API. The configured user ID is checked against the live manager/admin role on each write. The write tools do not set prices, payment status, or publish social posts. Product creation remains a manager dashboard task because a sellable product also needs variants, approved price rules, and material usage; Hermes can update product listing metadata only.

## Register the local server (Windows PowerShell)

Start the API first in one terminal:

```powershell
cd "C:\Users\yousefshabara\OneDrive\Documents\ChatGPT\aiagant"
npm start
```

In another terminal, register the stdio server with Hermes:

```powershell
hermes mcp add printshop-ai --command "C:\Program Files\nodejs\node.exe" --args --experimental-strip-types "C:\Users\yousefshabara\OneDrive\Documents\ChatGPT\aiagant\apps\hermes\src\server.ts"
hermes mcp test printshop-ai
```

For manager tools, configure Hermes' MCP server environment with the backend's `HERMES_TOOL_API_KEY` value as `PRINTSHOP_HERMES_TOOL_KEY`, then restart the Hermes gateway. Keep both secrets out of chat messages and source control. The API itself reads the local `.env`; Hermes MCP child processes receive their key through their MCP server configuration.

The manager dashboard AI chat uses Hermes' local API server. Configure its `API_SERVER_ENABLED` and `API_SERVER_KEY` in Hermes' own environment, set the same key as `HERMES_API_KEY` in this project's ignored `.env`, and start the Hermes gateway. Set `HERMES_BASE_URL=http://127.0.0.1:8642` and `HERMES_MODEL=hermes-agent` in the backend `.env`. Restrict Hermes' `api_server` platform toolsets to the PrintShop MCP toolset for this integration; do not enable broad computer, terminal, or file tools for the web chat.

Start the API in one PowerShell terminal:

```powershell
cd "C:\Users\yousefshabara\OneDrive\Documents\ChatGPT\aiagant"
npm start
```

Start the Hermes gateway in another terminal. Then start the frontend in a third terminal:

```powershell
cd "C:\Users\yousefshabara\OneDrive\Documents\ChatGPT\aiagant"
npm run dev:web
```

The manager dashboard AI chat requires a signed-in `manager` or `admin` user. A customer account cannot access it. The first tool request stores a pending proposal without changing data. The following authenticated chat turn must contain the exact confirmation phrase and action ID, and Hermes must retry the same tool arguments with that action ID. The API checks the proposal against the authenticated manager, action, and exact arguments before mutation. Proposals expire after 10 minutes and currently live in API memory, so an API restart clears them. Price and payment changes are excluded.

Start this project-focused CLI session after registering it:

```powershell
hermes chat --toolsets printshop-ai
```

This selects only the PrintShop MCP toolset for this chat, rather than Hermes' broad default tools. Ask Hermes to find stickers, then ask for a quote using the exact variant SKU and quantity. Hermes must ask for missing dimensions or finishing; the backend returns a validation error if the selected SKU or pricing rule is unavailable. The user-approved EGP 2,100 rule is currently limited to the 1,000-piece 10×8 cm waterproof vinyl sticker variant. The sales-report tool also requires migration `20261003000300_sales_report_rpc.sql` to be applied.

This integration works on the same computer while the PrintShop API is running. For a hosted or remote Hermes installation, the backend must be deployed behind HTTPS and protected with user-scoped authentication before exposing these tools remotely.

## Model setup

Hermes needs a configured inference provider/model for natural-language conversations. Configure it with Hermes' own setup flow (`hermes setup` or `hermes model`); this repository intentionally does not choose a provider or store an LLM credential. Deterministic quote calculations do not make a provider API call.
