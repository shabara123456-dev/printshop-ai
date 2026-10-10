# INKORA n8n workflows

## Hosted instance status (verified 2026-10-10)

The hosted n8n service is `https://inkora-n8n.onrender.com`. Its API returned four workflows, all active. Recent executions were available and the latest execution reported success. The operational event router was also tested with a harmless `integration.test` event and completed successfully using the saved Gmail OAuth credential. No API keys, webhook secrets, or OAuth tokens belong in this document or in Git.

The hosted workflows are:

- **Operational Event Router** receives INKORA outbox events and routes supported customer and manager notifications.
- **Daily Operations Report** prepares the daily operational summary.
- **Weekly Manager Briefing** prepares verified order, inventory, and production figures and a short explanation.
- **Monthly Marketing Plan** creates a month of campaign drafts and artwork attempts for manager approval. It does not publish social posts.

Hosted email nodes use the saved Gmail OAuth credential, not SMTP. Hosted HTTP Request nodes use the saved `INKORA Event Webhook` Header Auth credential. This is necessary because Render Free blocks outbound SMTP ports. Render Free can also sleep after inactivity, so a cold start may delay API requests and interrupt schedules; activation does not guarantee uninterrupted scheduled execution.

The manager's Automations page reads workflow activation and recent execution status from the n8n API. The deployed API uses a longer bounded timeout for Render cold starts and fetches the workflow and execution lists concurrently. Refresh **Manager → Automations** to see the live state.

## Event outbox recovery

The 27 older events already marked dead were deliberately left untouched. Replaying them in bulk could send stale order or inventory messages. Retry only an event that is still relevant after checking its details. The four events previously returned to pending are eligible for the normal outbox delivery process now that the event workflow is active. Delivery status should be checked in the Automations page after refreshing; `pending` means queued, while `delivered` means n8n accepted the event. A successful workflow run does not prove every external notification was delivered unless its downstream node also succeeded.

## Repository workflow templates

The JSON files under `n8n/workflows/` are portable import templates. They are intentionally inactive and do not contain credentials. Importing a template does not activate a workflow or connect email/webhook credentials. When importing into a new n8n instance:

1. Import the required JSON template.
2. Select the destination instance's saved Gmail OAuth credential on each Gmail node.
3. Select its saved Header Auth credential on the event webhook and INKORA HTTP Request nodes.
4. Verify the target API URL and test each workflow manually.
5. Activate scheduled workflows only after the manual run succeeds.

Do not copy workflow credentials into JSON, source control, or chat. Never mass-retry old dead events as a setup test.

## Encrypted backup

The Compose file pins n8n to the version verified in the local container. Before migrating or updating the image, run this from the repository root in PowerShell:

```powershell
.\n8n\backup.ps1
```

Credential exports use n8n's encrypted backup mode. Keep the backup private and preserve the matching `N8N_ENCRYPTION_KEY`; without it, stored credentials cannot be decrypted. The backup does not replace a backup of n8n's persistent database.

## Delivery integration status

Checkout records delivery or store pickup, the customer's Mansoura address, and recipient phone. Courier booking and delivery-rate calculation are not connected. A courier account/API key, pickup-location setup, and delivery-rate policy are required before a shipment can be created.
