# INKORA — verified status

Last checked: 2026-10-09 after the latest Cloudflare Worker deployment.

## Verified live

| Check | Result |
|---|---|
| Public website | `https://printshop-ai.shabara123456.workers.dev/` returned HTTP 200. |
| Worker health | `/health` returned `ok`. |
| Supabase | `/ready` reported `database: ok`; linked migrations through `20261009000500` applied. |
| Hermes | Latest `/ready` probe reported `reachable`; a real authenticated chat/tool call still needs a manager-side check. |
| n8n | Latest `/ready` probe reported `reachable`; online workflow execution and email are not yet verified. |
| Public catalog | API returned 19 products. Demo-only data must not be sold as actual shop inventory. |
| Automated checks | `npm test`: 61 passed, 0 failed. `npm run typecheck`: passed. `npm run build:web`: passed. |
| Deployment | Cloudflare Worker version `f4b77cdd-1468-4019-8078-f6ce322850f9` deployed successfully. |

The latest `/ready` response is `ready` with database, Hermes, and n8n reachable. This confirms endpoints respond; it does not prove n8n workflows are active or email/social actions succeeded.

## Implemented in code and deployed; not yet proven end to end

- Per-product optional customer artwork upload setting; backend checks the order’s actual product permission. Paid shop-design checkout was removed; unrelated order payment state remains intact.
- Product manager upload/replace/remove controls and local preview before uploading/saving. Storefront assets are stored in Supabase Storage.
- Optional AI product-image candidates using the configured free AI Horde image service. The default shop allowance is three; reservations are atomic, failures release the allowance, managers can change the limit with an audit reason, and selecting a candidate is a separate explicit action.
- Product-image allowance and candidate metadata are protected by service-role backend access/RLS.
- Storefront configuration with distinct themes, custom palettes, typography/layout choices, hero/logo assets and placement, featured products/categories, drafts, preview, publish and restore.
- Compact searchable/paginated manager catalog with status, stock availability, material description, current starting price, image and secondary actions.
- A single prominent valid next production action in order rows while retaining backend state validation and the progress summary.
- Persisted manager marketing-plan configuration and deterministic monthly schedule passed to the existing plan-generation endpoint. Generated posts are drafts requiring approval; no post is marked published by this feature.
- Incremental Supabase migrations were applied without dropping existing order, product, customer, pricing, inventory or payment data.

## Not enabled or not production-ready

- n8n is reachable in the latest live readiness check. Workflow activation, SMTP email delivery, and scheduled publishing are not verified live.
- Online payment processing and payment webhooks are not configured. Paid extra image generations are not offered; no payment is simulated.
- Facebook/Instagram/social publishing and platform analytics are not configured. Approval creates an internal marketing post record only.
- Product image uploads and AI generation were not exercised against a real manager session in this verification. AI Horde uses a shared volunteer queue and output quality/availability are not guaranteed.
- Existing products without real approved prices/availability must remain unavailable; demo records are illustrative, not real business performance.
- Current seeded product visuals are illustrations until the manager uploads authentic shop photography or selects reviewed generated candidates.

## Next verification steps

1. Resolve n8n reachability and verify one active monthly plan run and a real manager email. Keep the workflow inactive until its credentialed manual run succeeds.
2. Sign in as manager; save a marketing plan, run n8n once, approve a draft, and verify the scheduled post row. Social publishing remains disabled unless a real official platform integration is configured.
3. Upload an image to a test product and confirm the public storefront displays it. Generate a candidate only if the manager accepts the community queue; review before selecting.
4. Test signup email, customer upload permissions for two products, and a disposable order through reservation, production, and cancellation/release.
5. Do not use seeded customer contacts for real messages, invent prices, or mark unpaid orders paid.
