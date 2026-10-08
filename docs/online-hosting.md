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
- Free Render web services cannot send SMTP traffic on ports 25, 465, or 587. Existing email workflows need a Gmail API/OAuth or another HTTPS email integration before they can send. Do not activate them while they still use SMTP.
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

Never put these values in Git, the browser frontend, or this chat. The n8n account should use only the `inkora_n8n` schema; the supplied Supabase database role is still privileged, so keep it exclusively in Render's server-side secrets.

For Hermes:

- `GOOGLE_API_KEY`: your Gemini key, entered directly in Render. Do not enable paid billing if your limit is $0.
- `API_SERVER_KEY`: generate a long random key locally and enter it in Render. Save that same value for the Cloudflare Worker secret `HERMES_API_KEY`.
- `HERMES_TOOL_API_KEY`: generate a second long random key. Save the same value for the Worker secret `HERMES_TOOL_API_KEY`.

To generate random values locally in PowerShell without posting them here:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Run it separately for each secret. The Blueprint imports the four repository workflows once after n8n's first successful deploy; they remain inactive until credentials are configured.

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

1. Create the n8n owner account using its hosted URL.
2. Create the `INKORA Integration Key` Header Auth credential and assign it to the event webhook and HTTP Request nodes.
3. Replace each SMTP email node with an HTTPS email integration (Gmail API/OAuth can be used) and create the matching n8n credential. Render Free blocks SMTP, so the existing Gmail SMTP credential will not work there.
4. Run the event workflow's integration test and verify a real email arrives.
5. Run the daily, weekly, and monthly workflows manually. Confirm their API steps and email delivery work.
6. Activate schedules only after successful manual checks. Remember schedules cannot execute while the n8n service is asleep.
7. In the app, open **Manager → Automations** and confirm the live workflow status is visible.
8. Open Manager → Hermes AI and test a read-only shop question. Confirm the API responds after Hermes wakes.

## Important boundary

This configuration only prepares the hosted services; it does not create them or prove they're online. Do not stop the local n8n/Hermes services until the Render URLs, Supabase connection, Worker secrets, and real end-to-end checks all pass. Some features (SMTP emails, schedules during sleep, and sustained Hermes availability) cannot be made dependable on the $0 Render tier.

## Data and recovery

- n8n workflows, credentials, users, execution data, and database-backed binary data live in Supabase's private `inkora_n8n` schema.
- Keep `N8N_ENCRYPTION_KEY` stable. Losing it makes stored n8n credentials unreadable.
- Hermes local chat/session history is not durable on Render Free. Gemini API configuration is recreated from Render environment variables at startup.
- Keep the Supabase project active and retain backups. If the n8n schema is ever removed, n8n's workflow and credential data will be lost.
