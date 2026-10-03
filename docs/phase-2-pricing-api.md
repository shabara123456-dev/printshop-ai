# Phase 2: Pricing Engine and Quote API

## What is implemented

- Deterministic EGP quote calculation from active `price_rules` only.
- Matching by variant SKU, quantity range, active dates, material, and finishing. The most specific rule wins; equally specific matches are rejected as ambiguous.
- The user-approved demo rule is EGP 2.10 per piece (EGP 2,100 total) for exactly 1,000 waterproof vinyl stickers at 10×8 cm. It adds no fees or tax, since none were specified, and carries `pricing_basis: user_approved_market_midpoint` plus the source-reference ID.
- Money is calculated in integer piastres. Each line adds base amount and configured fixed/setup fees; design, delivery, and installation fees are added only when requested. Tax is rounded to two decimals per line.
- `POST /api/quotes/calculate` returns a quote preview without persistence.
- `POST /api/quotes` recalculates on the server and atomically saves the quote and items through a secret-key-only Supabase RPC.
- Both endpoints require a Supabase access token. Customers can only save quotes against their own customer record; manager, sales, and admin roles may specify an existing customer.
- CORS origins are explicit. Default values allow local frontend development; add the Lovable origin to `CORS_ORIGINS` when known.

## Endpoints

Both requests require `Authorization: Bearer <Supabase access token>` and JSON bodies. The `items` array contains 1–20 entries.

```json
{
  "items": [
    {
      "variant_sku": "DEMO-STICKER-10X8",
      "quantity": 1000,
      "design_required": true,
      "delivery_required": false,
      "installation_required": false
    }
  ]
}
```

`POST /api/quotes/calculate` returns currency, subtotal, discount, tax, total, and line breakdowns. `POST /api/quotes` accepts the same body; manager/sales/admin must also provide `customer_id`. A customer’s own customer ID is resolved from the authenticated account, and any client-supplied customer ID is ignored.

Errors return `{ "error": { "code": "...", "message": "..." } }`. An unconfigured price rule returns `PRICE_RULE_NOT_FOUND` (422); ambiguous matching rules return `PRICE_RULE_AMBIGUOUS` (409). The market range itself is not calculated at quote time; this single rule uses the user-approved midpoint and retains a pointer to its source reference.

## Configuration and run

Copy `.env.example` to `.env`, fill `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`, then start with:

```powershell
npm start
```

The backend requires Node.js 22 or later. Keep `.env` and the secret key on the server only. `GET /health` is a basic process-health check.

## Required deployment setup

The linked Supabase project has the pricing migrations applied. The EGP 2,100 sticker price is user-approved and scoped to its exact variant and quantity. Other catalog prices are fictional demo rules; approve real shop prices before using them commercially.
