# PrintShop AI architecture

## Current implementation

```text
Customer / manager / staff
          │ Supabase Auth session
          ▼
React + Vite app (apps/web) ── JSON API ──► Node.js API (apps/api)
          │                                      │
          │ private Storage SDK                  ├── deterministic pricing/order/inventory rules
          ▼                                      ├── Hermes chat and marketing draft calls (opt-in)
Supabase Auth + Storage + PostgreSQL ◄──────────┘
                                                 │ operational webhooks
                                                 ▼
                                         n8n workflows (import/setup required)
```

The frontend is the locally coded React/Vite application in `apps/web`. It is not currently synced to an external Lovable project. Supabase remains the data source of truth; the Node API checks roles and applies business transitions. Supabase Storage is private and design uploads use short-lived signed links. Hermes is only used for manager chat or an explicitly requested marketing draft. n8n receives operational events after its workflows and credentials are configured.

## Responsibilities and boundaries

| Component | Responsibility | Authority boundary |
|---|---|---|
| React/Vite | Customer portal, manager operations screens, bilingual/RTL layout | Cannot decide final prices, mutate stock directly, or bypass role checks |
| Node.js API | Authentication/role checks, quote calculations, business operations, Hermes adapter, n8n events | Uses server-only Supabase secret and narrow route allowlists |
| Supabase PostgreSQL | Users, customers, products, price rules, quotes, orders, inventory ledger, jobs, designs, marketing assets, AI usage | Persistent business truth; mutation routines are transactional database functions |
| Supabase Auth/Storage | Account sessions and private design/reference/final-art files | Public browser key only; object policies scope owners and authorized staff |
| Hermes | Language understanding, manager Q&A, marketing copy | No database credentials or unrestricted SQL; no authority over prices or stock |
| n8n | Low-stock/order-ready/approved-marketing notifications and daily report | Workflow engine only; no authoritative application state or automatic social publishing |

## Key business paths

### Quote and order

1. Browser submits product SKU, quantity, and options.
2. API selects a valid shop price rule and calculates the total. The EGP 2,100 demo price is valid only for 1,000 waterproof-vinyl stickers at 10×8 cm.
3. Customer accepts; the database creates one order only from an accepted quote.
4. The database requires configured material usage, checks/reserves real stock, records ledger rows, and creates a queued production job in the same transaction.
5. Production moves through validated stages. Ready consumes reservations; delivery can be marked only from ready.

### Design service

Customers upload PNG/JPEG/WebP/PDF references to the private `design-files` bucket and submit a written brief. Authorized staff upload final artwork to their private folder and submit it for customer review. Customers can approve or request revisions. The reference and final artwork paths are available only to their request owner and staff; the web client creates expiring signed links.

### Marketing

Marketing is campaign-first and independent of customer orders. A manager or marketer provides a brief, campaign type, platform, and optional active catalog product. Hermes writes the caption from those supplied marketing facts only. Optional campaign artwork uses the no-fee AI Horde volunteer queue, then private marketing storage; it is a separate provider from Gemini/Hermes text. Queue time varies and the prompt is handled by third-party workers. The draft awaits manager approval; approval records a marketing post and emits an n8n event. No workflow auto-publishes to a social account.

### n8n

The API posts low-stock, order-ready, and marketing-approved events to a shared-secret-protected n8n webhook. The daily schedule calls a separate API report endpoint authenticated with the same secret. Workflow JSON is committed under `n8n/workflows`; the n8n instance, SMTP credentials, webhook auth credential, and reachable API URL must be configured before activation.

## Configuration and delivery status

- Root `.env.example` lists backend-only keys; `apps/web/.env.example` lists browser-safe Supabase URL/publishable key and API URL.
- The local API and frontend run with `npm start` and `npm run dev:web`.
- Supabase schema and incremental migrations through `20261003001000` are applied to the linked project. The 2026-10-03 CLI transport problem was caused by Avast HTTPS certificate inspection; no manual migration-history changes were needed.
- The owner account has already been promoted to manager and n8n has been created/configured in the project setup conversation. Email delivery still requires an SMTP credential and workflow activation must be verified in the actual n8n instance.
- The UI is the repository's custom React/Vite app. A Lovable project is not connected.
- Payment, social-media publishing, production hosting, and domain setup are not implemented/configured in this checkout.

See [mvp-gap-audit.md](mvp-gap-audit.md), [phase-4-api.md](phase-4-api.md), and [n8n-workflows.md](n8n-workflows.md) for route and setup details.
