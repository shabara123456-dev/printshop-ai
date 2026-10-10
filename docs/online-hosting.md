# INKORA online hosting — $0 Render plan

## Current architecture

- Customer and manager application/API: Cloudflare Worker at `https://printshop-ai.shabara123456.workers.dev/`.
- Business data and private uploads: the existing Supabase project.
- n8n: Render Free web service, with internal workflow data in the existing Supabase PostgreSQL database.
- Hermes: Render Free web service using the existing Gemini API key.

The `render.yaml` Blueprint is configured for **free services only**. It creates no Render Postgres database, paid compute, or persistent disk. Do not select an upgrade during deployment.

## Free-tier limits that affect functionality

This is a no-cost demo/staging deployment, not a dependable production host:

- Render Free services spin down after 15 minutes without inbound traffic and can take about a minute to wake. n8n schedules do not run while n8n is asleep; webhook events may time out during cold start.
- Render provides 750 free instance-hours per workspace per month across all Free services. Two services running continuously would use that pool in about half a month; once depleted, Free services are suspended until the next month.
- Free service filesystems are temporary. n8n data is therefore configured for Supabase PostgreSQL and binary data mode `database`; its encryption key is stored as a Render environment secret. Hermes' local session/memory/config files are temporary and its config is regenerated after restart.
- Free Render web services cannot send SMTP traffic on ports 25, 465, or 587. The hosted n8n workflows use Gmail OAuth over HTTPS. Do not switch them back to SMTP on this tier.
- Free services have 512 MB RAM. n8n and especially Hermes may restart or fail under memory pressure. Hermes is restricted to one concurrent run to reduce pressure.
- Google Gemini API quotas and billing depend on the configured Google account. Keep billing disabled for a strict $0 usage goal and monitor quota.

Render documents these limits at [Deploy for Free](https://render.com/docs/free). Supabase recommends the shared pooler in **session mode (port 5432)** for persistent services on IPv4-only networks: [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres) and [pooling details](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits).

## Deploy steps

### 1. Push the prepared code

Commit and push the repository's current branch to the private GitHub repository. Keep the repository private.

### 2. Create the n8n schema in Supabase

Apply the new migration from the project root:

```powershell
npx supabase@latest db push --linked
```

Confirm the migration `20261008001300_create_private_n8n_schema.sql` is applied before starting n8n. It creates an isolated `inkora_n8n` schema and denies browser-facing Supabase roles access.

### 3. Create a Render Blueprint

In Render, choose **New → Blueprint**, connect the private `printshop-ai` repository, and select its `render.yaml`. Before confirming, check that both services show **Free** and that there are **no disks, databases, or paid add-ons**.

For the n8n Supabase variables, open Supabase **Connect** and choose the shared **Session pooler** connection. Enter its values into Render's protected prompts:

- `DB_POSTGRESDB_HOST`: the pooler hostname only.
- `DB_POSTGRESDB_PORT`: leave at `5432`.
- `DB_POSTGRESDB_DATABASE`: leave at `postgres`.
- `DB_POSTGRESDB_USER`: the exact session-pooler username, commonly `postgres.<project-ref>`.
- `DB_POSTGRESDB_PASSWORD`: the Supabase database password.

The n8n image includes Supabase's public database root CA at `/opt/inkora/supabase-ca.crt` and sets `DB_POSTGRESDB_SSL_CA_FILE` to that path. Keep `DB_POSTGRESDB_SSL_ENABLED=true` and certificate verification enabled; do not work around certificate errors by disabling TLS verification.

Never put these values in Git, the browser frontend, or this chat. The n8n account should use only the `inkora_n8n` schema; the supplied Supabase database role is still privileged, so keep it exclusively in Render's server-side secrets.

For Hermes:

- `GOOGLE_API_KEY`: your Gemini key, entered directly in Render. Do not enable paid billing if your limit is $0.
- `API_SERVER_KEY`: generate a long random key locally and enter it in Render. Save that same value for the Cloudflare Worker secret `HERMES_API_KEY`.
- `HERMES_TOOL_API_KEY`: generate a second long random key. Save the same value for the Worker secret `HERMES_TOOL_API_KEY`.

To generate random values locally in PowerShell without posting them here:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Run it separately for each secret. The repository workflow JSON files are inactive templates. The hosted n8n instance has its own four imported, active workflows; changing a local template does not update the hosted copy. If rebuilding n8n, import the templates, assign credentials, test, then activate them.

### 4. Connect Cloudflare Worker to the hosted services

After Render deploys, copy the two `onrender.com` service URLs from the Render dashboard. In Cloudflare Worker settings, set encrypted server secrets:

- `HERMES_BASE_URL`: Hermes service URL.
- `HERMES_HEALTH_URL`: Hermes URL plus `/health`.
- `HERMES_API_KEY`: the same key entered as Hermes `API_SERVER_KEY`.
- `HERMES_TOOL_API_KEY`: the same key entered in Hermes.
- `N8N_WEBHOOK_BASE_URL`: n8n service URL.
- `N8N_API_BASE_URL`: the n8n service URL.
- `N8N_WEBHOOK_SECRET`: a fresh random secret. Configure the matching Header Auth credential in n8n and assign it to the event webhook and business API request nodes.
- `N8N_API_KEY`: create this in n8n under **Settings → n8n API**.

Never expose these secrets as `VITE_*` variables or browser code. Deploy the Worker after updating its secrets.

### 5. Configure and test n8n

1. The hosted n8n owner account and four workflows have already been configured.
2. The live workflows use saved Gmail OAuth and `INKORA Event Webhook` Header Auth credentials. Keep both credentials in n8n; never copy their values into workflow files or the frontend.
3. The event router's harmless integration test has completed successfully. For future changes, test with the manager mailbox, not a customer's address.
4. In the app, open **Manager → Automations** and refresh to confirm workflow status and recent executions. The Worker reads n8n through server-side secrets.
5. Schedules cannot execute while the Render Free n8n service is asleep. Render may also suspend Free services after the monthly instance-hour allowance is used.
6. Open Manager → Hermes AI and test a read-only shop question. Confirm the API responds after Hermes wakes.

## Important boundary

The hosted n8n API and four active workflows were verified on 2026-10-10, and the event router completed a successful integration test. This is a free-tier demo/staging setup: cold starts, sleep, monthly instance-hour exhaustion, and Hermes memory limits can interrupt availability. It is not a continuously available production service.

## Data and recovery

- n8n workflows, credentials, users, execution data, and database-backed binary data live in Supabase's private `inkora_n8n` schema.
- Keep `N8N_ENCRYPTION_KEY` stable. Losing it makes stored n8n credentials unreadable.
- Hermes local chat/session history is not durable on Render Free. Gemini API configuration is recreated from Render environment variables at startup.
- Keep the Supabase project active and retain backups. If the n8n schema is ever removed, n8n's workflow and credential data will be lost.
