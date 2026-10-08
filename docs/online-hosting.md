# INKORA off-laptop hosting

## What is already online

- Customer and manager web application/API: Cloudflare Worker at `https://printshop-ai.shabara123456.workers.dev/`.
- Source of truth and private file storage: the existing Supabase project.
- Hermes and n8n are currently local services reached through a temporary Cloudflare Quick Tunnel. This means the full app still depends on the laptop.

## Hosted services prepared

The root `render.yaml` defines two persistent Docker web services:

- `inkora-n8n`: n8n 2.42.5, persistent workflow/database/binary-data volume, Cairo timezone, secure cookies, and automatic import of the four repository workflows as inactive workflows on first boot. Workflow URLs are rewritten to the public INKORA Worker. They are not activated without SMTP and shared-auth credentials.
- `inkora-hermes`: the official Hermes Agent container, persistent config, Gemini provider configuration, an authenticated OpenAI-compatible API, and only the filtered `mcp-inkora` toolset. It cannot use Hermes terminal, filesystem, or browser tools through the app API.

The API Worker must remain the only browser-facing business API. Hermes calls the protected `/mcp` endpoint server-to-server; n8n calls protected business endpoints and receives outbox events. Supabase remains authoritative.

## Deploy from Render

1. Push this repository to the private GitHub repository. Keep the repository private.
2. In Render, choose **New → Blueprint**, connect `shabara123456-dev/printshop-ai`, and select the repository's `render.yaml`.
3. Review the resource summary. The Blueprint creates two always-on `1c-2g` web services with persistent disks; these are paid resources. Do not create them if the displayed total exceeds your budget.
4. Enter these secrets only in Render's protected environment prompts:
   - Hermes `GOOGLE_API_KEY`: the Gemini key, never committed to Git.
   - Hermes `API_SERVER_KEY`: a new long random key.
   - Hermes `HERMES_TOOL_API_KEY`: a new long random key. Set the same value as the Cloudflare Worker secret `HERMES_TOOL_API_KEY`.
5. Let both services finish their first deploy. Set up the n8n owner account from its `onrender.com` URL. Save the URL, but do not share its password or API key.
6. In Cloudflare Workers secrets, update:
   - `HERMES_BASE_URL` to the Hermes service URL.
   - `HERMES_HEALTH_URL` to `https://<your-hermes-service>.onrender.com/health` so readiness uses Hermes' health endpoint.
   - `HERMES_API_KEY` to the same secret as Hermes `API_SERVER_KEY`.
   - `HERMES_TOOL_API_KEY` to the same secret as Hermes `HERMES_TOOL_API_KEY`.
   - `N8N_WEBHOOK_BASE_URL` to the n8n service URL, without `/webhook/...`.
   - `N8N_WEBHOOK_SECRET` to a new random value.
   - Deploy the Worker after updating secrets. Keep `SUPABASE_SECRET_KEY` server-only.
7. In the new n8n instance, create an **HTTP Header Auth** credential for INKORA using header `x-printshop-integration-key` and the same `N8N_WEBHOOK_SECRET`. Assign it to the event webhook and the three report/marketing HTTP Request nodes. Create and select the verified SMTP credential and sender address on each email node.
8. Create an n8n API key under **Settings → n8n API**. Store it as the Worker secret `N8N_API_KEY`; set `N8N_API_BASE_URL` to the n8n service URL. This key is privileged and must stay server-side.
9. Verify Hermes through the signed-in manager dashboard and `/ready`. Verify n8n's workflow list, then run a test event to the manager inbox. Activate schedules only after each credential-backed test succeeds.
10. Once all online checks pass, stop the laptop's Docker n8n, Hermes gateway, and Quick Tunnel. The public site will then depend only on Cloudflare, Supabase, Render, and configured external providers.

## Cost and limitations

Render currently lists a `1c-2g` web service at $25/month and persistent SSD at $0.25/GB/month. This Blueprint specifies two services plus 7 GB total disks, so the listed baseline is about **$51.75/month**, before bandwidth, tax, or any applicable workspace charges. Confirm the current amount in Render before deployment. The Worker and Supabase are existing services and are not included in that estimate. [Render pricing](https://render.com/pricing)

The deployment does not create payment-provider, courier, or social-media accounts. The n8n workflows start inactive and require SMTP plus the shared API credential before email/event automation can work. No live payment, courier booking, or social publishing is claimed by this deployment plan.

## Recovery and updates

- Render disks preserve n8n's SQLite database, encryption key, workflows, credentials, and local binary data across service restarts. Do not detach or recreate the disk during a deploy.
- n8n imports the checked-in workflows only once on a fresh data disk. It will not overwrite changes made in the n8n editor on later restarts.
- Hermes writes its initial config only once to its persistent disk. Preserve that disk to retain the Gemini/MCP setup.
- Keep backups of n8n data and its encryption key in a private location. n8n credentials cannot be decrypted if the encryption key is lost.
