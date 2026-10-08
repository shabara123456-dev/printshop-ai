# Hermes integration

PrintShop AI exposes a local MCP bridge for Hermes. Read tools are available for verified lookup. A small manager write allowlist can be enabled separately; Hermes Agent supports local stdio MCP servers and per-server tool filtering: [Hermes MCP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/).

## Tools available

- `search_products`: search active print products and variants.
- `get_product_details`: retrieve one product by UUID.
- `calculate_quote`: calculate a quote from the approved backend pricing rules.
- `check_inventory`, `get_low_stock_items`, `get_purchase_suggestions`: manager read-only inventory tools.
- `get_production_status`, `get_order_status`, `get_sales_report`: manager read-only operations and reporting tools.
- `create_material`, `record_material_receipt`, `create_product_draft`, `update_product_details`, `update_order_status`, `update_production_status`: confirmation-gated manager actions. Hermes first creates a 10-minute pending proposal. The manager must reply in the authenticated dashboard chat with `I CONFIRM THIS CHANGE <action_id>`; the API binds the next tool run to that exact proposal and user. The direct Hermes CLI can still perform reads, but writes require the authenticated dashboard chat context. Each action includes a reason and records requested/completed audit entries.
- `get_storefront_config` and `prepare_storefront_update`: read the current published configuration, then create an exact-approval-gated, unpublished versioned draft. Hermes cannot publish it; the manager reviews and publishes from Storefront settings.

The MCP process calls the application API. It does not receive Supabase credentials or issue SQL. Quote calculation is a public, read-only API operation; persisting a quote still requires a signed-in customer or authorized staff account through the normal API. Manager tools use a separate server-to-server key and expose only fixed allowlisted operations.

The same tool registry supports local stdio and stateless HTTP transport. The Cloudflare Worker exposes `/mcp` only when the server-only `HERMES_TOOL_API_KEY` secret is configured; requests must include that key in `X-PrintShop-Hermes-Key` or a Bearer header. On Cloudflare, tools dispatch directly into the Worker API handler rather than making a self-request to the public hostname. For a remote Hermes gateway, configure an HTTP MCP server URL `https://printshop-ai.shabara123456.workers.dev/mcp` with header authentication, then restrict `platform_toolsets.api_server` to only that server. Keep manager write tools disabled until the authenticated proposal-and-confirm flow is verified. The MCP endpoint and business API are deployed online; the Hermes gateway itself still runs on the laptop and must be moved to managed hosting for always-on service.

Manager writes are disabled by default in local development. In the deployed Worker, they are enabled only for the configured manager profile after verifying that profile has a live manager/admin role. Each allowlisted change first creates a persistent proposal and requires the exact confirmation phrase and action ID in a separate authenticated manager chat turn. The backend revalidates the manager role, exact arguments, action, expiry, and one-time approval before executing. The write tools do not set prices, payment status, or publish social posts. Hermes can create an inactive product draft after manager confirmation; a manager must still configure its variants, approved price rules, and stock in Products before the product can be purchased.

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

The manager dashboard AI chat can connect to Hermes through its OpenAI-compatible API server. Configure `API_SERVER_ENABLED=true`, a strong `API_SERVER_KEY`, and `API_SERVER_HOST=0.0.0.0` on the Hermes host, then expose it only over HTTPS. Set `HERMES_BASE_URL` to the gateway origin (for example `https://hermes.example.com`) and `HERMES_API_KEY` to the same bearer key in the backend environment. Local development can use `http://127.0.0.1:8642`.

**Security requirement:** Hermes' API server can expose powerful agent tools. Its `api_server` platform must use only the PrintShop MCP server, with no terminal, file, browser, computer, code execution, or other general-purpose toolsets. The current Hermes installation is configured with:

```powershell
hermes config set platform_toolsets.api_server '["printshop-ai"]'
hermes gateway restart
```

The PrintShop MCP server calls the API process on its host and uses the separate server-only `PRINTSHOP_HERMES_TOOL_KEY`. Keep both keys out of the frontend and chat. Do not expose the Hermes API directly to browsers; the app backend authenticates and proxies requests.

After changing the Hermes platform toolset, run `hermes mcp test printshop-ai` and verify a read-only business lookup through the configured HTTPS `/v1/chat/completions` endpoint. A `/healthz` response alone does not prove business tools are available.

The local Node API uses the Hermes CLI with `--toolsets printshop-ai`. The Cloudflare Worker uses the authenticated HTTP gateway mode when `HERMES_BASE_URL` and `HERMES_API_KEY` are configured. The Worker does not expose the raw Hermes tool endpoint to browsers; manager chat requests are authenticated by the app API before Hermes is called.

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

The manager dashboard AI chat requires a signed-in `manager` or `admin` user. A customer account cannot access it. The first write-tool request stores a pending proposal without changing business data. The following authenticated chat turn must contain the exact confirmation phrase and action ID, and Hermes must retry the same tool arguments with that action ID. Supabase checks the proposal against the configured manager, action, and exact arguments before mutation. Proposals expire after 10 minutes and survive API restarts. Price and payment changes are excluded.

## Verified runtime status (2026-10-08)

- Hermes' API-server platform is restricted to the single `printshop-ai` MCP server.
- The Hermes gateway was restarted, and the local API process was restarted from this checkout so both run current code.
- Read-only smoke tests passed through the HTTPS gateway for product search and manager-only store-vertical lookup.
- The public Cloudflare MCP endpoint was verified: invalid credentials return 401, authorized discovery exposes 19 tools, and an authorized `list_store_verticals` call returned six active verticals. Public readiness, catalog, and storefront endpoints returned 200.
- The deployed Worker `/ready` endpoint returned `database: ok`, `hermes: reachable`, and `n8n: reachable`; the public catalog returned 19 products and six active verticals.
- The manager write-confirmation flow has automated API coverage, but it has not been exercised through a signed-in browser session against the public Worker. Do not describe a live dashboard mutation as verified until that test is completed.
- Hermes and n8n are hosted on the local machine. Their temporary tunnel works only while the laptop, Docker, gateway, and API process are running; this is not persistent production hosting.

Start this project-focused CLI session after registering it:

```powershell
hermes chat --toolsets printshop-ai
```

This selects only the PrintShop MCP toolset for this chat, rather than Hermes' broad default tools. Ask Hermes to find stickers, then ask for a quote using the exact variant SKU and quantity. Hermes must ask for missing dimensions or finishing; the backend returns a validation error if the selected SKU or pricing rule is unavailable. The user-approved EGP 2,100 rule is currently limited to the 1,000-piece 10×8 cm waterproof vinyl sticker variant. The sales-report tool also requires migration `20261003000300_sales_report_rpc.sql` to be applied.

This integration works while the local PrintShop API, Hermes gateway, and temporary tunnel are running. For persistent operation when the laptop is off, move Hermes, the API/MCP bridge, and n8n to managed hosts and configure their server-only credentials there. The application backend must remain the only browser-facing Hermes proxy.

## Model setup

Hermes needs a configured inference provider/model for natural-language conversations. Configure it with Hermes' own setup flow (`hermes setup` or `hermes model`); this repository intentionally does not choose a provider or store an LLM credential. Deterministic quote calculations do not make a provider API call.
