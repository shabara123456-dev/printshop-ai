# INKORA — Create. Print. Grow.

An operating-system prototype and online print store for a fictional Egyptian printing studio. Supabase is the source of truth; Node.js enforces business rules; Hermes assists only with language tasks; n8n handles configured notifications. The user interface in this repository is a custom React/Vite app, not a Lovable project.

## Live demo

Open the public staging site from any device: **[printshop-ai.shabara123456.workers.dev](https://printshop-ai.shabara123456.workers.dev/)**. The catalog and quote calculator are available without signing in. Account confirmation redirects to the hosted site. Registration and delivery of a real confirmation email have not yet been end-to-end tested.

For a quick demo, open **Store**, choose a product, configure its available options, and calculate a quote. The configured scenario is 1,000 waterproof vinyl stickers at 10×8 cm: EGP 2,100, or EGP 2,150 when shop design is selected. These are user-approved demo shop settings, not a real printer's offer. The manager dashboard requires a provisioned manager account. The manager catalog contains 19 products, but 18 are marked demo-only and have no approved selling prices; they are sample entries, not ready-to-buy products. The customer catalog currently exposes the configured sticker format.

The public staging deployment does not process online payments or publish to social accounts. On 2026-10-09, `/ready` reported the database, authenticated Hermes model endpoint, and n8n health endpoint reachable. This availability check does not prove a signed-in Hermes conversation, n8n workflow execution, or email delivery end to end. Render free services may sleep while idle. The catalog uses original product illustrations rather than photographs of physical products.

## Who it serves and how impact is measured

The customer storefront handles product discovery, configuration, approved-rule quotes, design requests, and order tracking. The manager workspace handles orders, inventory, production, reporting, marketing drafts, and a Hermes operations chat. Hermes is configured as a remote manager assistant and its authenticated model-list endpoint passed the readiness probe, but a signed-in conversation still needs an end-to-end check. Customers do not have a separate natural-language agent.

The intended time savings are fewer manual quote lookups, inventory checks, and report-preparation steps. Supported routine data questions use deterministic backend queries instead of an LLM call, which avoids model cost for those requests. The project does not yet have a real shop baseline or measured hours/cash/revenue saved; those should be measured in a pilot using quote turnaround time, manager hours spent on reporting and stock checks, order conversion, and AI token usage/latency. Do not present a projected value as a measured result.

## What works in the repository

- Public INKORA storefront with API-driven product search, original product-specific concept illustrations, quote calculation/save, quote acceptance, order tracking, and bilingual English/Arabic UI with RTL support. The deployed database has 19 sample products; 18 remain demo-only until the manager configures real shop prices and availability. Only the sticker format currently has a configured customer quote path.
- Manager dashboard, quote inbox, customer directory, deterministic pricing, inventory receipts and reorder suggestions, production queue and state transitions.
- Design briefs with private reference uploads and private final artwork uploaded by staff for customer approval.
- Order-independent marketing campaigns based on a manager brief and optional active catalog product; Hermes writes captions, AI Horde creates optional no-fee community-generated artwork saved to private marketing storage, and manager approval controls publication. No automatic social publishing.
- Node API, Supabase migrations/RLS, and a restricted Hermes MCP server. n8n and Hermes have live Render endpoints and passed the 2026-10-09 availability checks. A fresh workflow execution and real email delivery have not been verified from the deployed n8n instance.
- The exact user-approved demo quote is EGP 2,100 for 1,000 waterproof vinyl stickers at 10×8 cm. Choosing shop design adds the approved EGP 50 fee (EGP 2,150 total); customer-supplied artwork adds no design fee. This rule covers no other sizes or quantities.
- The linked Supabase project is up to date through migration `20261008001300_create_private_n8n_schema.sql` (verified with the Supabase CLI on 2026-10-09). The manager catalog contains 19 products. Seeded costs, stock, and prices remain illustrative demo data, not real shop settings or externally sourced prices.
- Hermes uses the configured Gemini text model. Optional marketing campaign images use the free AI Horde volunteer queue; generation can be delayed or unavailable, and prompts are processed by third-party workers. Storefront product art remains original SVG concept art, not claimed product photography.

## What still needs account access or real business data

The owner and manager roles exist in Supabase. On 2026-10-09, the hosted API reported Supabase, Hermes, and n8n reachable, and the Supabase CLI reported all repository migrations applied. A signed-in customer signup/confirmation, manager Hermes conversation, fresh n8n workflow execution with delivered email, and complete order-to-production flow still need end-to-end verification. Online payments and social publishing are not enabled. Render free services may sleep while idle. The local React/Vite app is not linked to a Lovable project. Follow [docs/mvp-final-setup.md](docs/mvp-final-setup.md) and [docs/inkora-build-notes.md](docs/inkora-build-notes.md) for current setup boundaries.

## Run locally

Requirements: Node.js 22.17+, a Supabase project, root `.env`, and `apps/web/.env`. Copy each `.env.example`, then configure credentials in the matching file. Keep Supabase secret, Hermes, and n8n credentials in the root backend `.env` only. AI Horde can use anonymous access without a key; a registered account key is optional.

```powershell
npm install
npm start
```

In another PowerShell window:

```powershell
npm run dev:web
```

Then open `http://localhost:5173`. Validate with `npm test`, `npm run typecheck:web`, and `npm run build:web`.

## Project guides

- [Architecture](docs/architecture.md)
- [MVP status and demo path](docs/mvp-gap-audit.md)
- [Grouped final setup](docs/mvp-final-setup.md)
- [n8n workflows](docs/n8n-workflows.md)
- [Hermes integration](docs/hermes-integration.md)
