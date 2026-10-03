# PrintShop AI staging on Cloudflare Workers

One Cloudflare Worker serves the Vite storefront as static assets and routes `/api/*` plus `/health` to the existing Node API through Cloudflare's Node HTTP compatibility layer. This keeps the customer site and API on one public hostname, with Supabase as the source of truth. The GitHub repository remains private.

## Connect the private GitHub repository

In Cloudflare Dashboard, open **Workers & Pages → Create application → Get started → Import a repository**. Connect GitHub, authorize access to the private repository `shabara123456-dev/printshop-ai`, and configure:

- Production branch: `main`
- Build command: `npm run build:web`
- Deploy command: `npx wrangler deploy --config wrangler.worker.toml`
- Root directory: `/`

The Worker name must remain `printshop-ai`, matching `wrangler.worker.toml`. Cloudflare Workers Builds can redeploy when commits reach `main`.

## Build variables

In the Worker project's **Settings → Builds → Build variables and secrets**, add:

| Name | Secret? | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | No | Supabase URL embedded in the frontend build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | No | Public Supabase key embedded in the frontend; RLS must protect data |

## Runtime variables and secrets

In **Settings → Variables & Secrets**, add these to the production environment:

| Name | Secret? | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | No | API's Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | No | Supabase auth verification key |
| `SUPABASE_SECRET_KEY` | **Yes** | Server-only Supabase key used by the API |
| `MARKETING_IMAGE_PROVIDER` | No | `ai_horde` enables community image generation; `off` disables it |
| `HERMES_WRITE_TOOLS_ENABLED` | No | Keep `false` for public staging |
| `N8N_WEBHOOK_BASE_URL` | Optional | Public HTTPS n8n URL, if available |
| `N8N_WEBHOOK_SECRET` | **Yes** | Shared secret for n8n integration routes |
| `PRINTSHOP_MANAGER_EMAIL` | Optional | Destination for report workflows |

Use the Supabase URL and keys from the local environment files, but enter them directly into Cloudflare's dashboard fields. Never paste the secret key in chat or commit it. Only `SUPABASE_SECRET_KEY` and `N8N_WEBHOOK_SECRET` should be marked as secrets.

Set Supabase Authentication's Site URL and redirect allow-list to the Worker URL shown after deployment. Keep local development redirect URLs only if still needed.

## Local preview

The ignored root `.dev.vars` file may contain local server secrets. Then run:

```powershell
npm run dev:cloudflare
```

`GET /health` should return `{"status":"ok"}`; `/api/products` should return the Supabase catalog. The root `.dev.vars` file is ignored by Git.

## Staging boundaries

- The storefront and API use the same hostname and the API only accepts same-origin browser calls.
- Customer and manager access depends on Supabase Auth and RLS. Review RLS and seed/demo data before sharing the public URL.
- Hermes currently invokes a local CLI, which cannot run inside a Cloudflare Worker. Cloud Hermes chat and Hermes-generated monthly report narratives are not available until a remote Hermes endpoint or cloud LLM adapter is configured. Keep any Gemini credential server-side.
- n8n must have a public HTTPS URL to call the cloud API. A local Docker n8n instance cannot receive events from Cloudflare.
- Online payment processing, paid AI design/edit checkout, and social publishing are not enabled until real providers are configured.
- Cloudflare free usage has service limits. Treat this as public staging, not a reliability guarantee for a live print shop.

## Updates

After Workers Builds is connected, commits pushed to `main` trigger the configured build and deployment. Keep credentials in Cloudflare settings and never commit `.env` or `.dev.vars`.
