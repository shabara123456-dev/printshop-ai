# Phase 5: Frontend and API integration

## Implemented

- The React/TypeScript customer portal uses Supabase Auth for sign-in and calls the Node API for catalog, quote calculation/persistence, quote acceptance, order creation, order tracking, and design requests.
- The staff screens use API routes for inventory, material usage, purchase suggestions, design review, and production transitions. The browser does not use the Supabase service-role credential.
- English/Arabic labels and RTL layout are supported.
- The catalog prefers the configured `DEMO-STICKER-10X8` variant when available. This avoids initially selecting the 5×5 variant, which has no approved 1,000-piece shop-price rule.
- The customer quote flow has been exercised against the linked Supabase project: 1,000 10×8 cm waterproof vinyl stickers calculate to EGP 2,100 and the quote saves successfully.

## Shop data needed before making an order

Demo rows now provide fictional material balances and usage so the sample order path works. They are clearly marked as demo data and must not be used for real fulfillment. Replace these values with actual stock and per-variant consumption before accepting commercial orders. Newly created variants remain blocked until staff configure their material usage; never infer material consumption from the selling price.

The customer-facing **Accept & create order** action records acceptance of the quote and then requests an order. Treat it as a real business commitment when using production data.

## Phase 6 entry checklist

- The core customer-to-backend quote flow is connected.
- The read-only Hermes MCP bridge already exposes product search/details and deterministic quote calculation.
- Remaining AI work belongs to Phase 6: add provider-neutral LLM routing for language tasks, manager-scoped tools, and a manager AI chat surface. Preserve deterministic API paths for ordinary lookups and calculations; do not send every operation to a model.
- Do not add n8n, social publishing, or payments in Phase 6; those remain deferred as specified in the project handoff.

## Local commands

Use Node.js 22.17 or newer. `npm start` launches the backend with system certificate trust enabled for Supabase TLS. Run the frontend in a second terminal with `npm run dev:web`. Check the customer build with `npm run typecheck:web` and `npm run build:web`; run backend checks with `npm test`.
