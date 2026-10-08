# PrintShop AI — codebase audit

Audit date: 2026-10-08

This document records the architecture verified in the repository before broad refactoring. It distinguishes implemented behavior from plans and external setup.

## Architecture map

```text
Customer / staff browser
  apps/web: React 19 + Vite + TypeScript + Tailwind-like authored CSS
  Supabase Auth session ──────────────────────────────────┐
  Supabase Storage SDK (private design-files bucket)       │
  JSON API calls with access token                         │
                                                           ▼
  apps/api: Node HTTP server ──► Supabase Auth / PostgREST / RPC
       │                           PostgreSQL + RLS + migrations
       ├── deterministic quote calculator
       ├── role/ownership checks and state-changing RPC calls
       ├── Hermes HTTP adapter (manager chat, marketing draft)
       └── authenticated n8n event/report HTTP integration
  Supabase transactional outbox ──► scheduled Worker delivery ──► n8n

  apps/hermes: restricted MCP stdio server ──► allowlisted read-only API tools
  n8n/workflows: imported workflows; external credentials/activation are instance-specific
```

## Module inventory

| Path | Responsibility | Audit notes |
|---|---|---|
| `apps/web/src/App.tsx` | Customer and staff screens, auth state, browser API client, uploads | Customer/manager remain role-conditioned tabs in one shell; analytics and manager product/pricing setup are split into feature components. Auth and much page state remain centralized. |
| `apps/web/src/style.css` | Dark visual system, responsive layout, RTL rules | Authored styling; verify on real devices before deployment. |
| `apps/api/src/api.ts` | HTTP routing, input validation, roles, customer ownership, Hermes/n8n orchestration | Single large router; responses have correlation IDs and structured request/error logs. AI endpoints have per-user in-process budgets; there is no shared schema/router framework or distributed rate limiter. |
| `apps/api/src/supabase.ts` | Auth verification and server-side Supabase REST/RPC gateway | Uses server-only secret, 15-second request timeouts, and safe upstream error responses with structured status/code logs. |
| `apps/api/src/pricing.ts` | Deterministic EGP quote calculation and rule selection | Uses integer cents and rejects missing/ambiguous rules; market-reference provenance is retained. |
| `/api/analytics/business` + `get_business_analytics` RPC | Manager-only order analytics and comparison with an equal-length previous period | Implemented in migration `20261003000600`; its deployment was not verified in this turn. It returns saved order value, daily order value, top products and categories; it does not claim profit or cash collection. |
| Manager product/pricing API and page | Product/variant create, active toggle, approved rule create/end | Manager-only UI/API. Price-rule writes are designed to use audited SQL functions in migration `20261003000700`; that migration has not been applied or verified remotely. |
| `apps/api/src/hermes-client.ts` | HTTP adapter to Hermes-compatible chat completion endpoint | Server-side key, timeout, response checks; manager web chat uses a small server-side deterministic intent layer for supported lookups; general chat requests do not receive MCP tools. |
| `apps/hermes/src/server.ts` | Hermes MCP stdio bridge | Narrow read-only tool allowlist; no database credentials. |
| `supabase/migrations/*.sql` | Schema, RLS, transactional quote/order/inventory/production routines, private file policies and marketing approval | Incremental migrations; tests include SQL transaction coverage. Payment ledger, cart, AI credits/jobs, product option schema, business settings, event/outbox, and full analytics schema are absent. |
| `supabase/seed.sql` | Sticker market references and explicitly owner-approved exact demo quote rule | EGP 2,100 applies only to the defined 1,000-piece, 10×8 cm waterproof vinyl configuration; it is not general shop cost data. |
| `n8n/workflows/*` | Importable notification/report workflows | SMTP, credentials, network reachability, and activation belong to the n8n instance; a successful API report call alone does not verify email delivery. |
| `docs/*` | Architecture, operations, phase and setup notes | Some older setup notes are stale; use current verified account state rather than treating those notes as proof of pending work. |

## Verified behavior

- Product reads are public; final quote calculation and saving use backend price rules.
- Customers are assigned their own customer record on signup. Customer quote/order/design ownership is checked in the API; PostgreSQL RLS separately protects customer records and private storage.
- Quote/order/inventory/production changes use database RPCs with row locks/state checks. Order creation from accepted quote is unique by `orders.quote_id` and reserves configured raw materials.
- Private design uploads use a private storage bucket, MIME allowlist and 20 MiB limit. The browser checks MIME/size and the API checks the uploader folder path and role before attaching artwork. Server-side content sniffing, malware scanning, image dimension/preflight checks, and upload quotas are not implemented.
- Hermes is called only for explicit manager chat or marketing caption generation; stock, recognized sales-period, production-queue, and UUID order-status prompts in manager chat are returned by the backend without an LLM call. Unsupported live-data questions are explicitly not treated as facts by the LLM.
- Marketing campaigns are independent of orders. The brief and optional active catalog product are stored with the pending asset; Hermes receives only those campaign inputs. Optional artwork is generated by the free AI Horde community queue and stored privately. Approval persists a marketing post. Social publishing is not connected.
- Order creation, production-ready transitions, and marketing approval write a durable event in the same database transaction. A Cloudflare scheduled Worker claims leased batches, posts them to n8n, retries failures with exponential backoff, and dead-letters after 10 attempts. Delivery is at-least-once; downstream actions should deduplicate by event ID.

## Baseline checks

Run from repository root on 2026-10-03:

- `npm test` — passed, 20 API tests after the latest changes.
- `npm run typecheck` — passed for the web app. The repository does not yet type-check backend files because Node type definitions are not installed; an npm install attempt did not complete in this environment.
- `npm run build` — passed for the web app.
- SQL/pgtap coverage files are present, but the local Supabase database is not healthy in this environment, so migrations `20261003000600`/`20261003000700` and their SQL tests were not executed.

## Priority gaps before production use

1. **Do not represent the current MVP as payment-ready.** No payment provider adapter, payments table, webhook verification/idempotency, refund logic, cart persistence, or payment-gated order transition exists. Orders can be created from accepted quotes while `payment_status` remains unpaid.
2. **Add operational reliability.** API has no global/distributed rate limit, durable event outbox, or bounded pagination for all list routes. The AI rate budgets are process-local and reset on restart; multi-instance deployments need a shared limiter.
3. **Strengthen file pipeline.** MIME/extension agreement, file signatures, malware scanning, quotas, dimensions, and print preflight are absent. AI-generated image output and paid credits/jobs are absent.
4. **Separate the staff application boundary.** Current role-based tabs hide manager screens from customers, and API checks access; however, there is one shared shell/component, not separate customer and manager apps.
5. **Complete business domains.** Product/variant/rule creation and product activation are implemented locally; audited price-rule changes are migrated. Product option/image management, business profile/settings, finished-goods availability, payment ledger, purchase order lifecycle, durable event history, calendar/planner, social OAuth/publishing/metrics, and robust business analytics remain absent or partial.
6. **Expand tests.** API and SQL tests now cover baseline analytics calculations, but do not provide the complete security, concurrency, storage, payment, or reporting matrix from the master prompt.

## Delivery constraint

Real payment/social/OAuth/SMTP provider credentials, production hosting, and the operator's shop-specific costs cannot be invented by code. Build adapters and truthful disabled/configuration states; activate external operations only after provider credentials and a real test account exist.
