# INKORA Store Operating System — Audit and Phased Plan

Audit date: 2026-10-08

## Verified architecture

- `apps/web`: React/Vite customer and manager UI in one role-conditioned app shell. Product management, business analytics, marketing, and design flows already exist.
- `apps/api`: Node HTTP API. It enforces roles and customer ownership, performs deterministic pricing, calls Supabase RPCs, proxies Hermes, and sends n8n integrations.
- `apps/hermes`: restricted MCP server. Tools call allowlisted API operations; there is no direct database credential in Hermes.
- `supabase/migrations`: incremental PostgreSQL schema, RLS, transactional quote/order/inventory/production functions, marketing approval, analytics, and demo catalog protections.
- `n8n/workflows`: importable workflow JSON for event notification, daily/weekly reporting, and monthly marketing planning. Instance activation and credentials remain external setup.
- `cloudflare/worker.ts`: public static web app and API proxy/staging entrypoint.

## Current architecture gaps against the INKORA vision

1. API event delivery used best-effort HTTP calls. An n8n outage could lose an order-ready or campaign-approved notification.
2. Hermes write proposals and approval handoff are process-memory scoped; restarts lose pending actions and a multi-instance API would not share approval state.
3. Storefront theme/homepage are not a first-class database-backed configuration with preview, approval, version history, and audit.
4. The manager has business screens, but not an automation operations console for workflow status, delivery history, retries, and failures.
5. Product data now has a vertical registry and JSON product/variant specifications. The basic catalog is cross-vertical, but vertical-specific attributes/validation and richer fulfillment rules are still future work.
6. n8n workflows cover notification and reporting examples; durable outbox delivery and an expanded event catalog now exist, but live workflow activation/credentials, execution callbacks, and recovery visibility from n8n are still missing.
7. Payments, customer carts, social publishing/OAuth, and paid AI design are still not implemented/configured. They should remain explicitly unavailable until real providers and credentials are chosen.

## Phased implementation order

### Phase 0 — Audit and boundaries (complete)

Map the current implementation and gaps; preserve existing printing features and the Supabase source of truth.

### Phase 1 — Reliable event delivery (implementation deployed; live event execution still needs n8n verification)

Add a transactional database outbox for order creation, production-ready transitions, and campaign approval. Add leased, retryable API delivery to n8n, stable event IDs, and SQL/API tests. Then apply the additive migration and verify a real n8n execution before expanding event coverage.

### Phase 2 — Durable AI action proposals and approvals (complete)

Pending Hermes actions are persisted in Supabase with actor, exact payload, expiry, status, approval, execution result, and audit links. The API requires the manager confirmation context and consumes each approved action once. The migration, cross-instance API test, remote SQL state-machine test, and Cloudflare deployment passed. Live Hermes write-tool deployment remains disabled by the existing Worker safety setting.

### Phase 3 — Storefront configuration and safe preview (deployed)

Added versioned database configuration, manager-only draft/publish APIs, bilingual copy, announcement, accent color, and featured product ordering. The manager reviews a preview and publishes explicitly; publishing is audited and enqueues `storefront.published` for n8n. Hermes can read current settings and prepare an unpublished versioned draft after exact manager confirmation. Product availability and price rules remain untouched. Automated API tests and remote SQL checks passed. The Cloudflare storefront deployment exposes the public config endpoint.

### Phase 4 — Automation operations console (delivery history and safe retry deployed)

Managers can inspect sanitized recent outbox event deliveries and requeue dead-letter events; only managers/admins may access these actions, and every retry is audited. Live workflow active/disabled state and n8n execution details are not yet integrated; repository templates are not presented as proof that workflows are active.

### Phase 5 — Generic commerce capabilities (configurable option/price foundation implemented)

Added per-product option groups and values with bilingual labels and manager-approved fixed or per-unit EGP surcharges. The deterministic quote engine validates required selections against Supabase, computes the fee server-side, stores a quote snapshot, and includes the surcharge in tax. Managers configure options from Products; public customers can select them. Updates are manager-only, reason-audited, and enqueue an n8n outbox event. Printing material, price-rule, and production behavior remain intact. The migration and SQL assertions passed against the linked Supabase project; the feature bundle is deployed as Worker version `56f11a84-eeba-4fbd-9342-490eb7cadcd3`. Live `/ready`, `/api/storefront`, and `/api/products` requests returned HTTP 200 (19 products). Existing catalog items have no generic option groups until a manager configures them. The broader category/vertical capability model, imagery metadata, and centralized availability service remain to be built.

### Phase 6 — Operational automation expansion (event coverage implemented; n8n activation remains external)

Database-transactional events now cover material updates, low-stock and restock threshold crossings (including policy changes), product creation/updates, order status changes, and production stages, in addition to order creation/ready, marketing approval, storefront publishing, and product-option updates. The notification router formats actionable events, separates customer and manager recipients, escapes dynamic content, suppresses routine inventory emails, and avoids duplicate ready notifications. Remote SQL assertions passed. The workflow was imported into the persistent local n8n instance as inactive; inspection showed no saved n8n workflows or credentials before import. It still requires the integration Header Auth credential, a verified SMTP credential/sender, and explicit activation before it can execute live notifications. Idempotent n8n callbacks, customer lifecycle events, fulfillment/report event handlers, and workflow execution status synchronization remain follow-on work.

### Phase 7 — Cross-vertical catalog and order flow (implemented, remote-tested, deployed)

Added a database-backed registry for printing, clothing, electronics, cosmetics, furniture, and generic stores. Existing products keep the `printing` default and existing deterministic price rules remain authoritative. Managers can set a vertical and structured public product/variant specifications from Products. Order creation now reads vertical capabilities: printing still requires configured material requirements and creates production jobs; non-production products reserve configured sellable quantity without fake printing materials or production jobs. Non-production orders can progress through ready and delivered, with one dedicated ready event. SQL regression tests passed against linked Supabase, API tests reject unknown verticals and malformed specifications, the frontend build and type checks pass, and the Cloudflare deployment exposes six active verticals. Products still require manager-approved prices before they can be purchased.

### Phase 8 — AI Store Operator integration (read tool path verified; public write flow pending)

Hermes' API-server platform is configured to expose only the `printshop-ai` MCP server, with general terminal/file/browser/code tools excluded. The running gateway and local API were restarted from current configuration/code. Read-only product search and manager-only vertical lookup succeeded through the HTTPS Hermes gateway; the public Worker readiness check reports database, Hermes, and n8n reachable. Supabase stores action proposals and approval state. However, a signed-in public-dashboard proposal → exact manager confirmation → retry → database mutation has not been run end-to-end, so public write actions remain unverified. Existing write tools cover material receipts/creation, product listing metadata, inactive product drafts, order cancel/delivery, and production status. Product variants, approved discounts, storefront proposals, campaign approval tools, and multi-action plans are still future capabilities. A product draft cannot be purchased until a manager adds its variant, approved price rule, and stock through Products.

### Phase 9 — n8n operations visibility and runtime callbacks (read-only console implemented; API key required)

The manager console has a server-only n8n status adapter in addition to outbox delivery history and safe retry. It excludes node data, execution payloads, and credentials. The Worker has no `N8N_API_KEY`; its console therefore remains `not configured`. A read-only SQLite inspection of the running local n8n instance found four imported workflows, all inactive, no saved credentials, and no executions. Its health endpoint is reachable, but this does not verify workflow delivery. `N8N_API_BASE_URL` is now optional and falls back to the configured n8n host. Create and securely configure an API key, recreate required n8n credentials, activate workflows, then verify real executions and the event-to-workflow path. Never infer active state from workflow JSON or a reachable health endpoint.

### Phase 10 — Store operator action plans (first safe catalog action implemented)

Extend Hermes through allowlisted, typed business actions across products, orders, inventory, storefront, and campaigns. Product draft creation and storefront draft preparation are approval-gated, persist exact normalized arguments, and are covered by approval-flow tests. Product drafts are always inactive; storefront drafts remain unpublished until a manager publishes them. Multi-action requests still need persistent draft plans with per-action validation, impact preview, manager approval, idempotent execution, outbox events, and audit history. Pricing and inventory remain deterministic application/database rules. Do not enable a new write type until role, exact arguments, approval state, and retry behavior have regression tests.

### Phase 11 — Persistent hosting and external integrations

Move the local Hermes gateway and n8n to managed hosting so the laptop and temporary tunnel are not runtime dependencies. The Cloudflare Worker and stateless HTTPS MCP endpoint are deployed and verified; the MCP read path dispatches directly into the Worker API. The connected Hermes API and n8n webhook targets are still laptop-hosted through a temporary tunnel, so AI chat, n8n schedules, and webhook delivery stop when that machine is off. Render is the selected hosting candidate, but no billable services have been created. Its always-on deployment requires paid compute and persistent storage; obtain the owner's spending approval before provisioning. The current n8n API key is also absent from Worker secrets, and Hermes hosting needs a fresh provider key because the previous Gemini key was exposed. Add persistent volumes, server-only credentials, backups, monitoring, and explicit n8n workflow activation during hosting migration. Payment, social OAuth/publishing, and paid AI design remain adapter interfaces or truthful disabled states until actual provider accounts and test environments are available.

### Phase 12 — Reliability, security, and production readiness

Add shared rate limits, structured tracing, storage preflight and malware controls, load/concurrency checks, disaster recovery, security review, and end-to-end customer/manager authorization tests. Measure and optimize after correctness and reliability are verified.

## Phase 1 acceptance criteria

- Domain events are written in the same database transaction as the corresponding order/production/marketing status change.
- n8n downtime leaves pending events available for retry; worker crashes release events through lease expiry.
- Failed webhook calls use bounded backoff; after 10 failed attempts the event is visibly dead-lettered in the database.
- API does not deliver the same event from both a direct request path and the outbox.
- Event payloads contain stable event IDs and no secrets.
- Automated API tests pass. SQL tests verify trigger creation, claim, completion, and event uniqueness.
- A real database migration and n8n execution are verified before calling the phase operationally complete.

## Important delivery semantics

The outbox is at-least-once. A delivery accepted by n8n followed by a lost response can be retried, so downstream workflows should use the `event_id` for idempotency before performing non-repeatable actions. SMTP itself cannot guarantee exactly-once delivery.
