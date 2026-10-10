# INKORA — current deployment checks

Last checked 2026-10-09 after Cloudflare deployment `f4b77cdd-1468-4019-8078-f6ce322850f9`.

## Live checks

- Website: HTTP 200 at https://printshop-ai.shabara123456.workers.dev/
- Worker health: `/health` returned `ok`.
- Supabase: `/ready` reports database `ok`.
- Hermes: `/ready` reports `reachable` in the latest probe.
- n8n: the latest `/ready` probe returned `reachable`; no live workflow execution/email has yet been verified in this check.
- Catalog API: 19 products returned.
- Database: linked Supabase migrations through `20261009000500` applied successfully.
- Automated checks: `npm test` (61 passed), `npm run typecheck`, and `npm run build:web` passed.

The site and API are online and the latest `/ready` response is `ready`. Reachability does not confirm workflow activation, email delivery, or a complete automation run. See [mvp-gap-audit.md](mvp-gap-audit.md).

## Newly available manager features

- Per-product customer design-upload permission, optional descriptive material, manual image upload/replace/remove, and image preview.
- Three shop-wide included product-image generations by default. Managers can review candidates, choose the primary image, and adjust the included limit with an audited reason. This uses the free AI Horde queue; it is not a guarantee of output quality or uptime.
- Paid extra image generations are explicitly unavailable until a real payment provider is configured; the app does not simulate a payment.
- Marketing monthly plan settings persist in Supabase and feed the existing monthly-plan API when the n8n workflow is run. Posts remain approval-required drafts.
- Storefront edits support versioned drafts, preview, publish, themes, colors, logo/hero assets, featured products and categories.

## Remaining live checks and integrations

1. Sign in as a manager and upload a product photo, then verify it on the catalog and public storefront.
2. Use a non-customer image to try optional AI product-image generation; review a candidate and explicitly select it. The shared allowance defaults to three.
3. Open Marketing, save the monthly plan settings, and run the existing monthly n8n workflow only after n8n is reachable. Confirm that approval-required drafts appear in the Marketing calendar.
4. Test Hermes with a manager question against actual inventory.
5. Verify signup email, confirmation redirect, and a disposable customer order through supported cancellation/release flows.

Online payment processing, paid AI image add-ons, and social publishing are not enabled. Do not mark unpaid orders paid or claim posts were published without provider confirmation.

## Local development

From the repository root:

```powershell
npm install
npm start
```

In another PowerShell window:

```powershell
npm run dev:web
```

Open `http://localhost:5173`. Keep server secrets in the root backend `.env`; browser variables must contain only the Supabase publishable key and public API URL.
