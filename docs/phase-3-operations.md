# Phase 3: Orders, Inventory, and Production

## Implemented database operations

- Quotes move through `draft -> sent -> accepted|rejected`, with expiry checked before acceptance.
- An order can be created only from an accepted quote. It copies quote items, calculates required material from configured product-material requirements plus waste, reserves stock atomically, and creates one queued production job.
- Inventory receipt, adjustment, reservation, release, and consumption each update `materials` and append a matching `inventory_transactions` record in the same transaction. Available stock is on-hand minus reserved. Negative adjustments cannot take stock below the reserved amount.
- Production transitions follow `queued -> prepress -> printing -> finishing -> quality_check -> ready`; invalid skips fail. Becoming ready consumes the order's reservations. Cancelling an active job/order releases remaining reservations.
- An order becomes delivered only from ready. Invalid transitions are rejected by database functions.
- Security-definer mutations are executable only by the server-side `service_role`; no browser write policies are added.

## Required shop configuration

`product_material_requirements` maps each product variant to material quantities per product and an optional waste fraction. Migration `20261003001000` includes fictional demo requirements for the demo catalog so the hackathon flow can create orders and reserve demo stock. These values are not verified shop consumption rates. Replace them with the real shop's bill of materials and stock counts before commercial production. Newly created variants still need manager-configured material requirements before order creation.

Material unit and requirement quantity must use the same unit (for example, metres per sticker). Do not use the public sticker price to infer material consumption or cost.

## Migration and database tests

Apply `supabase/migrations/20261002000400_orders_inventory_production.sql` to the linked project. The rollback-only pgTAP checks are in `supabase/tests/phase3.sql`; run them against a local Supabase database using `npx supabase@latest test db` after starting the local stack. The tests use fixed test-only records and roll back their transaction.

These functions are exposed by the Phase 4 backend API for authenticated, role-checked callers. The browser calls the backend; it does not call the privileged database functions directly.
