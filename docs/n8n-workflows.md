# INKORA n8n workflows

## Local workflows

The local n8n instance currently has four published workflows. All four have successful executions using the saved SMTP credential:

- **Daily Operations Report** sends a daily operational summary at 6:00 PM Africa/Cairo.
- **Weekly Manager Briefing** sends verified order, inventory, and production data each Monday at 9:00 AM Africa/Cairo. Hermes writes the short explanation; the API/database supplies the figures.
- **Monthly Marketing Plan** runs on the first day of each month at 9:00 AM Africa/Cairo. The API chooses four dates, Hermes drafts four captions from the active catalog, and the free AI Horde volunteer queue attempts one artwork per post. Generated images are saved to private storage and the assets appear in the manager Marketing screen for approval. Queue delays/failures preserve the caption draft. This workflow does not publish to social media.
- **Operational Event Notifications** receives low-stock, order-ready, and approved-marketing events from the API. Low-stock and marketing alerts go to the manager; order-ready notices go to the email address on that order. A manager-only integration test was also successful.

Schedules run only while Docker Desktop and the local n8n container are running. If Docker Desktop stops, n8n schedules and webhook delivery stop until it is started again.

## Credentials and event security

- SMTP credentials are stored in n8n and are not committed to this repository.
- Event webhooks require the same secret in the API `N8N_WEBHOOK_SECRET` and n8n `Header Auth account` credential.
- The API uses `N8N_WEBHOOK_BASE_URL` to deliver events to n8n.
- The event workflow uses the event's `to_email`. Do not test with a real customer's address; use the manager's inbox for `integration.test`.
- The saved local event workflow is configured with the shop's Gmail sender and dynamic event recipients. A fresh import from the template requires selecting SMTP and Header Auth credentials again.

## Re-importing from this repository

1. Start the API, Docker Desktop, and n8n.
2. Import the appropriate JSON from `n8n/workflows`.
3. Select an SMTP credential in each Email node. For the event workflow, also select the Header Auth credential in the Webhook node.
4. Configure the sender and manager recipient; keep the event workflow's recipient expression dynamic so order-ready emails go to customers.
5. Test the report workflows and use a manager-only `integration.test` event for the event workflow.
6. Publish a workflow only after its test execution succeeds.

## Delivery integration status

Checkout records delivery or store pickup, the customer's Mansoura address, and a recipient phone for delivery. Courier booking and delivery-rate calculation are not connected. A courier account/API key, pickup-location setup, and delivery-rate policy are required before a shipment can be created.

Bosta is a reasonable Egypt-first candidate to evaluate: its official API documents delivery creation and shipment-status webhooks. An n8n adapter could create a Bosta shipment after manager confirmation and receive status callbacks, while the backend remains the order source of truth. Do not send an order until the shop has a Bosta account/API key and the customer address has been validated against Bosta's supported zones.
