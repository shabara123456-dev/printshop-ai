-- Remove synthetic storefront activity while preserving every non-seed order and
-- the product/material rows referenced by historical test orders.
begin;

-- Remove only the deterministic seed activity written by migrations 008/009.
delete from public.marketing_posts p
using public.marketing_assets a
where p.marketing_asset_id = a.id
  and (p.metrics->>'demo_seed' = 'true' or a.caption like 'DEMO / SEED DATA%');

delete from public.marketing_assets
where caption like 'DEMO / SEED DATA%';

delete from public.design_requests
where brief like 'DEMO / SEED DATA%';

delete from public.production_jobs
where notes like 'DEMO / SEED DATA%';

delete from public.orders
where quote_id::text like '00000000-0000-4000-8000-%'
  and exists (
    select 1 from public.order_items oi
    where oi.order_id = orders.id and oi.options->>'demo_seed' = 'true'
  );

delete from public.quotes q
where q.id::text like '00000000-0000-4000-8000-%'
  and not exists (select 1 from public.orders o where o.quote_id = q.id);

delete from public.customers c
where c.email like 'demo+customer%@example.invalid'
  and not exists (select 1 from public.orders o where o.customer_id = c.id)
  and not exists (select 1 from public.quotes q where q.customer_id = c.id)
  and not exists (select 1 from public.design_requests d where d.customer_id = c.id);

-- Keep seeded products/materials available for old order and inventory audit
-- references, but remove them from sale, active stock, and the default manager view.
update public.product_variants v
set active = false
from public.products p
where v.product_id = p.id
  and (p.demo_only = true or p.sku = 'DEMO-STICKER')
  and v.active = true;

update public.products
set active = false, demo_only = true, updated_at = now()
where demo_only = true or sku = 'DEMO-STICKER';

update public.materials
set active = false, updated_at = now()
where sku like 'DEMO-%';

update public.suppliers
set active = false
where notes like 'DEMO / SEED DATA%';

update public.machines
set status = 'inactive', location = null
where location like 'DEMO / SEED DATA%';

-- Do not carry old product selections into the simplified monthly writer.
update public.marketing_plan_settings
set product_ids = '{}'::uuid[], updated_at = now()
where id = true and cardinality(product_ids) > 0;

commit;
