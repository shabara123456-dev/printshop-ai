# Phase 6 — Hermes integration

## Implemented

- Hermes is the AI runtime; the web API does not call a model provider directly.
- The manager dashboard chat is limited to manager/admin roles and records model, token, latency, and success data in `ai_runs`.
- Hermes MCP exposes catalog search, product details, deterministic quote calculation, and read-only manager tools for inventory, reorder suggestions, production, orders, and sales reporting.
- Manager MCP requests use a dedicated server key and a fixed allowlist. Hermes has no Supabase credentials or unrestricted SQL access.
- Configuration and startup steps are documented in `hermes-integration.md`.

## Verification

- API health endpoint responds successfully.
- Hermes gateway responds to the API-compatible chat endpoint.
- Hermes MCP discovers nine tools.
- Read-only inventory, low-stock, and production tools return data from the backend.
- `npm test`, `npm run typecheck:web`, and `npm run build:web` passed during this phase.

## Deployment note

The SQL migration was applied to the linked Supabase project and its version was recorded in `supabase_migrations.schema_migrations`. The sales-report backend tool then returned the current month aggregate successfully (zero orders in the range at verification time).

The Supabase CLI Management API transport failure was traced to Avast HTTPS scanning, which replaced the API certificate. After HTTPS scanning was disabled, `projects list`, `migration list --linked`, `db push`, and read-only `db query --linked` succeeded. The temporary scoped test token was deleted. On 2026-10-03, migrations through `20261003001000` and the demo seed counts were verified remotely. The manager dashboard chat still needs an end-to-end UI check with a signed-in manager/admin account; a customer account correctly cannot access it.
