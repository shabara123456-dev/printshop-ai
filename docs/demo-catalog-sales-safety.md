# Demo catalog sale-safety

The expanded `INK-*` catalog is fictional demo data. Its sample unit prices must not be shown as shop-approved prices or used to create a customer quote or order. The approved EGP 2,100 sticker rule remains independently orderable.

The migration marks the `INK-*` products `demo_only`. Customers can see them as labeled samples, but cannot select them for checkout. The deterministic quote service rejects them even if a price rule exists, and the database order trigger blocks an order if a stale or manually-created quote contains one.

## Enabling one product for real sales

1. In Manager → Products and stock, review the product and every format; only configure prices for formats the shop actually offers.
2. End every sample price rule before the start date of the real price. For example, if the real rule starts today, end an older rule yesterday to avoid a same-day overlap.
3. Add a manager-approved internal price rule for every active format, including the actual quantity ranges, material/finish constraints, fees, and tax. Enter the reason for each rule so the system records the manager and a price snapshot in the audit log.
4. Click **Review and enable for sale**. The backend checks manager authorization, current approved price rules for every active format, and that no sample rule is still effective. It refuses promotion if any check fails.
5. Recheck the product in the public store and calculate a quote for a real configuration before advertising it.

Enabling a product does not validate its production materials, capacity, images, or tax settings. Configure and verify those independently before accepting customer orders.
