# INKORA n8n workflows

## Local workflows (verified 2026-10-08)

A read-only query of the running Docker n8n database and an encrypted CLI backup verified four imported workflows. All four are **inactive**. There are **zero saved credentials and zero executions** in this instance, so scheduled reporting and email delivery are not currently operational here. Do not treat workflow JSON, a healthy n8n endpoint, or a previous run on another instance as proof that this current instance is configured.

- **Daily Operations Report** sends a daily operational summary at 6:00 PM Africa/Cairo.
- **Weekly Manager Briefing** sends verified order, inventory, and production data each Monday at 9:00 AM Africa/Cairo. Hermes writes the short explanation; the API/database supplies the figures.
- **Monthly Marketing Plan** runs on the first day of each month at 9:00 AM Africa/Cairo. The API chooses four dates, Hermes drafts four captions from the active catalog, and the free AI Horde volunteer queue attempts one artwork per post. Generated images are saved to private storage and the assets appear in the manager Marketing screen for approval. Queue delays/failures preserve the caption draft. This workflow does not publish to social media.
- **Operational Event Router** receives durable events for orders, products, stock thresholds, production, storefront, and marketing. It ignores routine stock updates, routes customer notices to the order email, and routes operational alerts to the manager. The workflow is inactive and its Header Auth and SMTP credentials are not assigned.

Schedules run only while Docker Desktop and the local n8n container are running. If Docker Desktop stops, n8n schedules and webhook delivery stop until it is started again.

## Encrypted backup before migration

The Compose file pins n8n to the version currently verified in the local container (`2.42.5`) so a future `latest` release cannot silently change the runtime. Before moving n8n or updating its image, run this from the repository root in PowerShell:

```powershell
.\n8n\backup.ps1
```

The script exports each workflow and credential into a timestamped folder under `n8n/backups/`. Credential exports use n8n's encrypted backup mode; the script never uses `--decrypted`. The backup directory is gitignored because workflow definitions may include sensitive configuration. Store a copy in a private backup location. Restore credentials only after configuring the destination n8n with the exact same `N8N_ENCRYPTION_KEY` from the protected `n8n/.env`; never put that key in Git, a workflow, or chat. The backup is not a substitute for separately backing up n8n's persistent database volume.

To restore into a fresh instance using the same encryption key, copy the backup folders into the destination n8n container and run `n8n import:workflow --separate --input=<workflows-folder>` followed by `n8n import:credentials --separate --input=<credentials-folder>`. Do not import into a populated instance without first planning for duplicate workflows and credentials.

## Credentials and event security

- SMTP and Header Auth credentials are not currently saved in the inspected local n8n instance. Configure them in n8n; their values must not be committed to this repository.
- Event webhooks require the same secret in the API `N8N_WEBHOOK_SECRET` and n8n `Header Auth account` credential. The application environment has `N8N_WEBHOOK_SECRET` configured, but the corresponding n8n credential still needs to be created and selected.
- The API uses `N8N_WEBHOOK_BASE_URL` to deliver events to n8n.
- The manager Automation page reads live workflow activation and the last 25 execution statuses when `N8N_API_KEY` is set on the server. `N8N_API_BASE_URL` is optional; if omitted, the application reuses `N8N_WEBHOOK_BASE_URL` and appends `/api/v1`. It requests `includeData=false` and returns only workflow names/status/tags and execution IDs/status/timing; it never returns node definitions, credentials, inputs, or outputs. Without the API key, the page reports `not configured` rather than guessing from the files in this repository.
- Create the key in n8n under **Settings → n8n API**. For a self-hosted non-Enterprise instance, n8n API keys have full account access even though INKORA only uses read requests; keep it server-only and do not add it to browser environment variables. On Enterprise, scope the key to workflow-read and execution-list/read permissions. n8n documents the `X-N8N-API-KEY` header and API-key scope behavior in its [API authentication guide](https://docs.n8n.io/connect/n8n-api/authentication/).
- The event workflow uses the event's `to_email`. Do not test with a real customer's address; use the manager's inbox for `integration.test`.
- The event workflow template uses a placeholder sender. Configure the verified shop sender and a saved SMTP credential before activation. Customer-specific event emails use the address stored on that customer's order.

## Re-importing from this repository

1. Start the API, Docker Desktop, and n8n.
2. The four repository workflows are already imported into the current local n8n instance. For a fresh instance, import the matching JSON from `n8n/workflows`.
3. Create/select an SMTP credential in each Email node. For the event workflow, create/select a Header Auth credential whose secret matches the API's `N8N_WEBHOOK_SECRET`.
4. Replace the placeholder sender with the verified shop sender; keep the event workflow's recipient expression dynamic so order notices go to customers and manager alerts use the manager email.
5. Test each report workflow, then send an `integration.test` event through the manager-only API route and confirm the email arrives.
6. Activate a workflow only after the credential and test checks succeed. Current imported workflows remain inactive until this setup is complete.

## Delivery integration status

Checkout records delivery or store pickup, the customer's Mansoura address, and a recipient phone for delivery. Courier booking and delivery-rate calculation are not connected. A courier account/API key, pickup-location setup, and delivery-rate policy are required before a shipment can be created.

Bosta is a reasonable Egypt-first candidate to evaluate: its official API documents delivery creation and shipment-status webhooks. An n8n adapter could create a Bosta shipment after manager confirmation and receive status callbacks, while the backend remains the order source of truth. Do not send an order until the shop has a Bosta account/API key and the customer address has been validated against Bosta's supported zones.
