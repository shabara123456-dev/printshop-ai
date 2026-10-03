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
| `HERMES_BASE_URL` | **Yes** | Temporary HTTPS tunnel URL ending in `/hermes` |
| `HERMES_API_KEY` | **Yes** | Local Hermes API bearer key |
| `N8N_WEBHOOK_BASE_URL` | **Yes** | Temporary HTTPS tunnel URL ending in `/n8n` |
| `N8N_WEBHOOK_SECRET` | **Yes** | Shared secret for the event-notification webhook |
| `PRINTSHOP_MANAGER_EMAIL` | **Yes** | Manager's report/alert destination |

Keep credentials marked as secrets. Never paste them in chat or commit them.

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
- Hermes and the event-notification webhook are reached through a temporary Cloudflare Quick Tunnel. The tunnel only forwards `POST /hermes/v1/chat/completions` to Hermes and `POST /n8n/webhook/printshop-ai-events` to n8n. It does not expose the n8n editor or other local paths.
- The Quick Tunnel URL is temporary. The laptop, Docker Desktop, Hermes gateway, n8n, tunnel proxy, and `cloudflared` container must stay running. If the tunnel restarts and its URL changes, update `HERMES_BASE_URL` and `N8N_WEBHOOK_BASE_URL` on the Worker.
- Start `npm start`, `hermes gateway run --quiet`, and `npm run tunnel:proxy` in separate PowerShell windows. Keep the existing n8n Docker stack running, then start the Quick Tunnel in another window:

  ```powershell
  docker run --rm --name printshop-ai-temporary-tunnel cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://host.docker.internal:3099
  ```

  The command prints a new `https://*.trycloudflare.com` address. If it changes, update the Worker secrets `HERMES_BASE_URL` (append `/hermes`) and `N8N_WEBHOOK_BASE_URL` (append `/n8n`) with `npx wrangler secret put NAME --config wrangler.worker.toml`.
- Do not expose the local n8n editor through this tunnel. The webhook is protected by the configured n8n header-auth credential.
- Online payment processing, paid AI design/edit checkout, and social publishing are not enabled until real providers are configured.
- Cloudflare free usage has service limits. Treat this as public staging, not a reliability guarantee for a live print shop.

## Updates

After Workers Builds is connected, commits pushed to `main` trigger the configured build and deployment. Keep credentials in Cloudflare settings and never commit `.env` or `.dev.vars`.
