# INKORA — Create. Print. Grow.

An operating-system prototype and online print store for a fictional Egyptian printing studio. Supabase is the source of truth; Node.js enforces business rules; Hermes assists only with language tasks; n8n handles configured notifications. The user interface in this repository is a custom React/Vite app, not a Lovable project.

## What works in the repository

- Public INKORA storefront with API-driven product search, original product-specific concept illustrations, quote calculation/save, quote acceptance, order tracking, and bilingual English/Arabic UI with RTL support. The visible catalog is limited to products present in the currently deployed database.
- Manager dashboard, quote inbox, customer directory, deterministic pricing, inventory receipts and reorder suggestions, production queue and state transitions.
- Design briefs with private reference uploads and private final artwork uploaded by staff for customer approval.
- Order-independent marketing campaigns based on a manager brief and optional active catalog product; Hermes writes captions, AI Horde creates optional no-fee community-generated artwork saved to private marketing storage, and manager approval controls publication. No automatic social publishing.
- Node API, Supabase migrations/RLS, restricted Hermes MCP tools, and four active local n8n workflows: daily report, weekly manager report, monthly marketing plan, and operational event notifications. All four have successful n8n executions using the configured SMTP credential; the event workflow routes order-ready notifications to the event's customer email and manager alerts to the manager.
- The exact user-approved demo quote is EGP 2,100 for 1,000 waterproof vinyl stickers at 10×8 cm. Choosing shop design adds the approved EGP 50 fee (EGP 2,150 total); customer-supplied artwork adds no design fee. This rule covers no other sizes or quantities.
- The linked Supabase project has migrations through `20261003001500` applied. It now contains 18 demo product families, 54 catalog variants plus 3 sticker variants, 162 explicitly fictional demo price rules, 117 illustrative material-use mappings across all 57 active demo variants, 9 sample raw materials, 4 fictional suppliers, 5 demo machines, 18 demo customers, and 24 sample quotes/orders/production jobs. These values are for a hackathon demo, not real shop settings or externally sourced prices.
- Hermes uses the configured Gemini text model. Optional marketing campaign images use the free AI Horde volunteer queue; generation can be delayed or unavailable, and prompts are processed by third-party workers. Storefront product art remains original SVG concept art, not claimed product photography.

## What still needs account access or real business data

The owner and manager roles exist in Supabase. The four local n8n workflows are active and have successful test executions; the event-notification test was manager-only. Schedules run only while Docker Desktop and n8n are running on this computer. The Gemini compatibility proxy used by n8n Assistant was repaired and is healthy on n8n's Docker network; Assistant requests still fail because the sandbox tenant's two slots are occupied. The remote migration state and seeded records were verified on 2026-10-03. The local React/Vite app is not linked to a Lovable project. Follow [docs/mvp-final-setup.md](docs/mvp-final-setup.md) for remaining setup and [docs/inkora-build-notes.md](docs/inkora-build-notes.md) for verified state and limitations. The app does not create external hosting, payment, social-publishing, or Lovable accounts.

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
