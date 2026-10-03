# INKORA build and Supabase CLI notes

Checked locally on 2026-10-03.

## Brand and customer entry

- Browser title, metadata, favicon, and visible app brand now read **INKORA — Create. Print. Grow.**
- The customer route begins at a public storefront. Product detail actions take the customer to account sign-in; account-backed quotes still use the Node API and approved pricing rules.
- The image tiles are original SVG concept illustrations, not real product photographs. Replace them with properly licensed or shop-owned product photography before treating the storefront as a production catalog.

## Demo catalog migration

Migrations `20261003000800` through `20261003001600` have been applied to the linked project. The demo data includes 18 product families, 54 variants, four fictional suppliers, eight initial fictional materials plus mug blanks, five demo machines, 18 fictional customers, 162 fictional price rules, 24 accepted sample quotes/orders/production jobs, eight sample design requests, and nine sample marketing assets. Migration `0009` repairs price/order seeding skipped by a PostgreSQL sibling-CTE visibility issue. Migration `0010` adds 117 illustrative material-use mappings covering all 57 active demo variants, plus a mug-blank opening stock ledger entry. Migration `0015` adds the approved EGP 50 fee to the original sticker example. Migration `0016` applies and audits the same fee across active rules for all products supporting shop design. A live query verified 163 applicable active rules and zero missing EGP 50 fees. Remote migration history was verified on 2026-10-03. All non-sticker prices, stock, and consumption values are fictional demo data and must be replaced or approved before commercial quoting or production.

The owner-approved EGP 2,100 base rule remains scoped to the original 1,000-piece / 10×8 cm / waterproof-vinyl sticker variant. With customer-supplied artwork the quote remains EGP 2,100; selecting shop design adds EGP 50 for a total of EGP 2,150. New price rules created through the manager form/API also default to a EGP 50 design fee.

## Marketing image generation

Gemini remains the configured text model through Hermes. Gemini image generation returned HTTP 429 because this project's free-tier quota for the image model is zero. Marketing artwork now uses AI Horde's no-fee community queue and is stored in the private marketing-assets bucket when generation succeeds. The worker queue may delay or reject requests, and campaign prompts are sent to third-party volunteers. Storefront product cards continue to use original, clearly labeled SVG concept illustrations; the AI Horde integration generates campaign artwork, not the store's full product-photography catalog.

## Supabase CLI check

The cached CLI executable works (`2.119.0`). The linked project reference is present locally. A live `GET http://localhost:3000/health` returned 200, and `GET http://localhost:3000/api/products` returned 200. Therefore the API route is not missing in the running local app.

The CLI transport error was caused by Avast Web/Mail Shield HTTPS inspection. Node's default certificate bundle failed verification (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`), while Node using the Windows system CA store succeeded. The presented certificate issuer was `Avast Web/Mail Shield Root`. After HTTPS scanning was disabled, the CLI successfully listed the project, connected to the database, applied migrations `0008`–`0010`, and verified remote migration history and demo row counts. The temporary scoped test token created during diagnosis was deleted.

```text
failed to list projects: HttpClientError: Transport error (GET https://api.supabase.com/v1/projects)
```

The CLI also reports a missing local `.supabase/profile` file before it selects its saved `supabase` auth profile. That warning is not blocking; the cause was HTTPS certificate inspection. The local `npm start` script now uses Node's system certificate store.

For future migrations, run from the repository root:

```powershell
npx supabase@latest migration list --linked
npx supabase@latest db push --dry-run --linked
npx supabase@latest db push --linked
```

The verified project is currently up to date through migration `20261003001500`. Inspect each future dry run before applying it. Prefer a narrow `api.supabase.com` exception in Avast and then re-enable HTTPS scanning when the product supports domain-scoped exclusions; otherwise keep scanning disabled only as long as necessary to run the CLI.

## Not production-ready yet

Payments/webhooks, cart/checkout, paid AI design and credits, actual social publishing/OAuth, real product photography, production hosting, full product-option administration, dedicated business profile management, and a separate deployed manager app remain incomplete. n8n workflow files exist, but activation and external delivery cannot be confirmed from this checkout. This build must not be presented as a finished production platform.
