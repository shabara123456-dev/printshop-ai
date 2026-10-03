# Phase 4: Backend API

The Node API authenticates Supabase access tokens, reads each caller's application role, and uses the server-only Supabase secret for data operations. Customer reads are explicitly scoped by the authenticated customer's profile because service-role requests bypass RLS.

## Routes

| Method | Route | Access |
| --- | --- | --- |
| GET | `/health` | Public health check |
| GET | `/api/me` | Authenticated caller's role and customer profile |
| GET | `/api/products`, `/api/products/:id` | Public active catalog |
| POST | `/api/quotes/calculate` | Public read-only calculation from shop-approved rules; does not save a quote |
| POST | `/api/quotes` | Customer, manager, sales, admin |
| GET | `/api/quotes/:id` | Quote owner or manager, sales, admin |
| PATCH | `/api/quotes/:id/status` | Customer accepts/rejects; staff sends/expires |
| POST | `/api/orders` | Creates an order only from an accepted quote |
| GET | `/api/orders`, `/api/orders/:id` | Customer sees own orders; authorized staff see operations |
| PATCH | `/api/orders/:id/status` | Manager/admin can deliver a ready order or cancel an active order; database enforces transitions |
| GET | `/api/inventory`, `/api/inventory/low-stock`, `/api/inventory/purchase-suggestions` | Manager, production, admin |
| POST | `/api/inventory/materials`, `/api/inventory/receive`, `/adjust`, `/reserve`, `/release`, `/consume` | Manager, admin |
| POST | `/api/products/:productId/material-requirements` | Manager, admin; active variant must belong to the product |
| GET | `/api/production` | Manager, production, admin |
| PATCH | `/api/production/:id/status` | Manager, production, admin; database enforces transition order |
| GET, POST | `/api/design-requests` | Customers see/create their own; authorized staff can manage requests |
| PATCH | `/api/design-requests/:id/status` | Customer approval/rejection and staff design workflow; database enforces transitions |
| PATCH | `/api/design-requests/:id/file` | Manager/sales/admin attaches a private final-artwork storage path while designing |
| GET | `/api/marketing/assets` | Manager, marketing, admin |
| POST | `/api/marketing/draft` | Manager/marketing/admin; requires campaign brief/type/platform, optional active catalog product, rejects order linkage; optional free AI Horde artwork is explicitly requested |
| PATCH | `/api/marketing/assets/:id/status` | Manager/admin; approval atomically creates an approved marketing-post record |
| GET | `/api/integrations/daily-report` | n8n only, authenticated by `x-printshop-integration-key` |

All state-changing order, inventory, quote, and production operations call the database functions. The browser never supplies authoritative quote totals or directly edits stock counters. Market-reference prices are included only as catalog context and do not become quote prices.

Reference and final artwork objects live in the private `design-files` Supabase Storage bucket and are served to authorized users through short-lived signed URLs. Inventory purchase suggestions are read-only reorder calculations; purchase-order creation/receiving UI is not implemented. Design statuses advance `requested → reviewing → designing → customer_review → approved → completed`; customers can approve or request changes at `customer_review`. A requested revision returns to `designing`.

## Local configuration

The Windows host reserves Supabase's default `5432x` ports. `supabase/config.toml` therefore assigns local services ports `55420`–`55429`. This only changes local development URLs, not the linked hosted project. Local Supabase tests require Docker. The latest CLI dry run failed while initializing the login role because the network transport was unavailable.

Run the API with `npm start` (Node.js 22.17+; system certificate trust is enabled for Supabase TLS). The active local frontend is React/Vite on port 5173; configure its public origin in `CORS_ORIGINS` before hosting it.
