# PrintShop AI architecture

## Current implementation

```text
Customer / manager / staff
          │ Supabase Auth session
          ▼
React + Vite app (apps/web) ── JSON API ──► API runtime (apps/api / Cloudflare Worker)
          │                                      │
          │ private Storage SDK                  ├── deterministic pricing/order/inventory rules
          ▼                                      ├── Hermes chat and marketing draft calls (opt-in)
Supabase Auth + Storage + PostgreSQL ◄──────────┘
Supabase transactional outbox ──► scheduled Cloudflare Worker ──► n8n event webhook
                                                 │ report webhooks
                                                 ▼
                                         n8n workflows + read-only runtime status
```

The frontend is the locally coded React/Vite application in `apps/web`. It is not currently synced to an external Lovable project. Supabase remains the data source of truth; the API checks roles and applies business transitions. Supabase Storage is private and design uploads use short-lived signed links. Hermes is used for manager chat or an explicitly requested marketing draft. The Hermes API-server platform is restricted to the `printshop-ai` MCP server, and its public read path has been verified through HTTPS. Order, product, inventory, production, storefront, and marketing events are written transactionally to an outbox and delivered by the scheduled Cloudflare Worker. The manager Automation page can show live n8n workflow/execution status when the server-only n8n API credential is configured; the current local n8n API has no such key, so that panel remains explicitly unconfigured.

For off-laptop operation, `render.yaml` prepares persistent hosted n8n and Hermes services. Their first boot imports inactive workflows and restricts the Hermes API platform to the single `mcp-inkora` business toolset. This requires a Render Blueprint deployment, encrypted provider and service secrets, and n8n SMTP/API credentials; until those steps are completed, the existing local tunnel remains the active integration path. See [off-laptop hosting](online-hosting.md).

## Responsibilities and boundaries

| Component | Responsibility | Authority boundary |
|---|---|---|
| React/Vite | Customer portal, manager operations screens, bilingual/RTL layout | Cannot decide final prices, mutate stock directly, or bypass role checks |
| Node.js API | Authentication/role checks, quote calculations, business operations, Hermes adapter, n8n events | Uses server-only Supabase secret and narrow route allowlists |
| Supabase PostgreSQL | Users, customers, products, price rules, quotes, orders, inventory ledger, jobs, designs, marketing assets, AI usage | Persistent business truth; mutation routines are transactional database functions |
| Supabase Auth/Storage | Account sessions and private design/reference/final-art files | Public browser key only; object policies scope owners and authorized staff |
| Hermes | Language understanding, manager Q&A, marketing copy | No database credentials or unrestricted SQL; no authority over prices or stock |
| n8n | Workflow execution, external notifications, schedules, and integrations | Workflow engine only; no authoritative application state or automatic social publishing. Live management status uses a read-only server-side API client. |

## Key business paths

### Quote and order

1. Browser submits product SKU, quantity, and options.
2. API selects a valid shop price rule and calculates the total. The EGP 2,100 demo price is valid only for 1,000 waterproof-vinyl stickers at 10×8 cm.
3. Customer accepts; the database creates one order only from an accepted quote.
4. The database reads the product vertical's capabilities. Printing orders require configured material usage, reserve real stock, and create a queued production job in the same transaction. Other verticals use configured variant availability without fake printing-material requirements or production jobs.
5. Production moves through validated stages. Ready consumes reservations; delivery can be marked only from ready.

### Design service

Customers upload PNG/JPEG/WebP/PDF references to the private `design-files` bucket and submit a written brief. Authorized staff upload final artwork to their private folder and submit it for customer review. Customers can approve or request revisions. The reference and final artwork paths are available only to their request owner and staff; the web client creates expiring signed links.

### Marketing

Marketing is campaign-first and independent of customer orders. A manager or marketer provides a brief, campaign type, platform, and optional active catalog product. Hermes writes the caption from those supplied marketing facts only. Optional campaign artwork uses the no-fee AI Horde volunteer queue, then private marketing storage; it is a separate provider from Gemini/Hermes text. Queue time varies and the prompt is handled by third-party workers. The draft awaits manager approval; approval records a marketing post and emits an n8n event. No workflow auto-publishes to a social account.

### n8n

Order-created, order-ready, order-status, production-status, catalog, inventory, storefront, and approved-marketing events are delivered from the Supabase outbox to the shared-secret-protected n8n webhook. Delivery uses leased retries and is at-least-once; workflows should deduplicate by event ID. The event router sends actionable customer or manager email and ignores routine inventory updates. The scheduled reports call API endpoints authenticated with a shared secret. Workflow JSON is committed under `n8n/workflows`; workflow activation and downstream credentials are instance-specific. The manager console now reads actual workflow state and recent execution metadata through a server-only API adapter if `N8N_API_BASE_URL` and `N8N_API_KEY` are configured.

## Configuration and delivery status

- `GET /health` is a liveness check. `GET /ready` checks that the API can read Supabase and reports whether Hermes and n8n are configured; it never returns credentials. Use `/ready` to distinguish an online Worker from an application whose database is unavailable.

- Root `.env.example` lists backend-only keys; `apps/web/.env.example` lists browser-safe Supabase URL/publishable key and API URL.
- The local API and frontend run with `npm start` and `npm run dev:web`.
- Supabase schema and incremental migrations through `20261008001000` are applied to the linked project. The cross-vertical order-flow SQL assertions passed through the linked database query runner.
- The public Worker readiness endpoint currently reports the Supabase database, Hermes HTTPS gateway, and n8n webhook host reachable. Hermes business read tools have passed live HTTPS calls. The n8n management API key has not been configured; email delivery and workflow activation are not implied by n8n health or the saved workflow files.
- The UI is the repository's custom React/Vite app. A Lovable project is not connected.
- Payment, social-media publishing, production hosting, and domain setup are not implemented/configured in this checkout.

See [mvp-gap-audit.md](mvp-gap-audit.md), [phase-4-api.md](phase-4-api.md), and [n8n-workflows.md](n8n-workflows.md) for route and setup details.
