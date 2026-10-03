-- Repair the demo catalog rules and activity that were skipped by migration 008.
-- In a single data-modifying CTE, PostgreSQL sibling CTEs cannot see inserted rows
-- through a base-table scan. Migration 008 therefore inserted products/variants but
-- its rule and demo-order queries saw no newly inserted product rows. This migration
-- runs after those rows are committed and is safe to retry.
begin;

with variant_rates(sku, material, rate_1_99, rate_100_499, rate_500_plus) as (
  values
    ('INK-BIZCARD-90X50','Coated cardstock',14.40,12.00,9.84),
    ('INK-BIZCARD-85X55','Coated cardstock',14.40,12.00,9.84),
    ('INK-BIZCARD-90X54','Premium cardstock',18.00,15.00,12.30),
    ('INK-FLYER-A6','Coated paper',4.20,3.50,2.87),
    ('INK-FLYER-A5','Coated paper',6.60,5.50,4.51),
    ('INK-FLYER-A4','Coated paper',10.20,8.50,6.97),
    ('INK-POSTER-A3','Poster paper',33.60,28.00,22.96),
    ('INK-POSTER-A2','Poster paper',66.00,55.00,45.10),
    ('INK-POSTER-A1','Poster paper',114.00,95.00,77.90),
    ('INK-BANNER-80X200','Display vinyl',1860.00,1550.00,1271.00),
    ('INK-BANNER-100X200','Display vinyl',2220.00,1850.00,1517.00),
    ('INK-BANNER-120X200','Display vinyl',2700.00,2250.00,1845.00),
    ('INK-INVITE-A6','Textured cardstock',10.80,9.00,7.38),
    ('INK-INVITE-A5','Textured cardstock',18.00,15.00,12.30),
    ('INK-INVITE-DL','Textured cardstock',15.60,13.00,10.66),
    ('INK-BROCHURE-A5','Coated paper',9.00,7.50,6.15),
    ('INK-BROCHURE-A4','Coated paper',13.20,11.00,9.02),
    ('INK-BROCHURE-A4TRI','Coated paper',16.80,14.00,11.48),
    ('INK-MENU-A4','Laminated paper',26.40,22.00,18.04),
    ('INK-MENU-A3FOLD','Laminated paper',45.60,38.00,31.16),
    ('INK-MENU-A5BOOK','Coated paper',81.60,68.00,55.76),
    ('INK-CERT-A5','Certificate paper',21.60,18.00,14.76),
    ('INK-CERT-A4','Certificate paper',33.60,28.00,22.96),
    ('INK-CERT-A3','Certificate paper',57.60,48.00,39.36),
    ('INK-BOOKLET-A5-8P','Coated paper',50.40,42.00,34.44),
    ('INK-BOOKLET-A5-16P','Coated paper',81.60,68.00,55.76),
    ('INK-BOOKLET-A4-16P','Coated paper',126.00,105.00,86.10),
    ('INK-NOTEBOOK-A6','Offset paper',90.00,75.00,61.50),
    ('INK-NOTEBOOK-A5','Offset paper',150.00,125.00,102.50),
    ('INK-NOTEBOOK-A4','Offset paper',228.00,190.00,155.80),
    ('INK-CALENDAR-DESK','Coated paper',174.00,145.00,118.90),
    ('INK-CALENDAR-A4WALL','Coated paper',222.00,185.00,151.70),
    ('INK-CALENDAR-A3WALL','Coated paper',354.00,295.00,241.90),
    ('INK-LABEL-5X3','Label paper',0.78,0.65,0.53),
    ('INK-LABEL-7X5','Label paper',1.14,0.95,0.78),
    ('INK-LABEL-10X7','Waterproof label stock',1.92,1.60,1.31),
    ('INK-PACK-SMALL','Folding carton',16.80,14.00,11.48),
    ('INK-PACK-MEDIUM','Folding carton',26.40,22.00,18.04),
    ('INK-PACK-LARGE','Folding carton',40.80,34.00,27.88),
    ('INK-TSHIRT-S','Cotton textile',384.00,320.00,262.40),
    ('INK-TSHIRT-M','Cotton textile',384.00,320.00,262.40),
    ('INK-TSHIRT-L','Cotton textile',408.00,340.00,278.80),
    ('INK-FOLDER-A4','Coated cardstock',28.80,24.00,19.68),
    ('INK-FOLDER-A4POCKET','Coated cardstock',45.60,38.00,31.16),
    ('INK-FOLDER-A5','Coated cardstock',22.80,19.00,15.58),
    ('INK-LETTERHEAD-A4','Offset paper',5.40,4.50,3.69),
    ('INK-LETTERHEAD-DLENV','Offset paper',6.60,5.50,4.51),
    ('INK-LETTERHEAD-C5ENV','Offset paper',8.40,7.00,5.74),
    ('INK-MUG-11OZ','Ceramic',222.00,185.00,151.70),
    ('INK-MUG-15OZ','Ceramic',276.00,230.00,188.60),
    ('INK-MUG-TRAVEL','Steel',468.00,390.00,319.80),
    ('INK-BAG-SMALL','Cotton canvas',252.00,210.00,172.20),
    ('INK-BAG-MEDIUM','Cotton canvas',312.00,260.00,213.20),
    ('INK-BAG-LARGE','Cotton canvas',384.00,320.00,262.40)
)
insert into public.price_rules(
  product_variant_id, quantity_min, quantity_max, material, unit_price,
  setup_fee, design_fee, tax_rate, active_from
)
select v.id, tier.quantity_min, tier.quantity_max, rates.material, tier.unit_price,
       0, 250, 0, current_date
from variant_rates rates
join public.product_variants v on v.sku = rates.sku and v.active
cross join lateral (values
  (1, 99, rates.rate_1_99),
  (100, 499, rates.rate_100_499),
  (500, null::integer, rates.rate_500_plus)
) as tier(quantity_min, quantity_max, unit_price)
where not exists (
  select 1 from public.price_rules existing
  where existing.product_variant_id = v.id
    and existing.quantity_min = tier.quantity_min
    and existing.quantity_max is not distinct from tier.quantity_max
    and existing.active_to is null
);

-- Build deterministic, clearly-labelled demo activity only from demo catalog rows.
create temporary table inkora_demo_order_seed on commit drop as
select n,
       ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid as quote_id,
       c.id as customer_id,
       selected.variant_id,
       selected.unit_price,
       (20 + (n % 5) * 15)::integer as quantity,
       round(selected.unit_price * (20 + (n % 5) * 15), 2) as line_total,
       (current_date - ((n * 3) % 60))::timestamptz as created_at,
       case n % 5 when 0 then 'delivered'::public.order_status
         when 1 then 'in_production'::public.order_status
         when 2 then 'confirmed'::public.order_status
         when 3 then 'ready'::public.order_status
         else 'delivered'::public.order_status end as order_status,
       case n % 5 when 0 then 'ready'::public.production_status
         when 1 then 'printing'::public.production_status
         when 2 then 'queued'::public.production_status
         when 3 then 'ready'::public.production_status
         else 'ready'::public.production_status end as production_status,
       case n % 5 when 1 then 'partial'::public.payment_status
         when 2 then 'unpaid'::public.payment_status
         else 'paid'::public.payment_status end as payment_status
from generate_series(1, 24) as n
join public.customers c
  on c.email = 'demo+customer' || lpad(((n - 1) % 18 + 1)::text, 2, '0') || '@example.invalid'
cross join lateral (
  select v.id as variant_id, r.unit_price
  from public.product_variants v
  join public.price_rules r on r.product_variant_id = v.id
    and r.quantity_min = 1 and r.active_to is null
  where v.sku like 'INK-%' and v.active
  order by v.sku
  offset ((n * 7) % 54)
  limit 1
) selected;

insert into public.quotes(id, customer_id, status, currency, subtotal, total, created_at, updated_at)
select quote_id, customer_id, 'accepted', 'EGP', line_total, line_total, created_at, created_at
from inkora_demo_order_seed
on conflict (id) do nothing;

insert into public.quote_items(quote_id, product_variant_id, quantity, unit_price, options, design_required, notes)
select d.quote_id, d.variant_id, d.quantity, d.unit_price,
       '{"demo_seed":true}'::jsonb, false, 'DEMO / SEED DATA — sample quote; fictional price.'
from inkora_demo_order_seed d
where not exists (select 1 from public.quote_items qi where qi.quote_id = d.quote_id);

insert into public.orders(
  customer_id, quote_id, status, payment_status, production_status, delivery_method,
  delivery_address, due_at, subtotal, total, created_at, updated_at
)
select d.customer_id, d.quote_id, d.order_status, d.payment_status, d.production_status,
       'local_delivery', 'DEMO / SEED ADDRESS', d.created_at + interval '5 days',
       d.line_total, d.line_total, d.created_at, d.created_at
from inkora_demo_order_seed d
on conflict (quote_id) do nothing;

insert into public.order_items(order_id, product_variant_id, quantity, unit_price, options, notes)
select o.id, d.variant_id, d.quantity, d.unit_price, '{"demo_seed":true}'::jsonb,
       'DEMO / SEED DATA — sample order snapshot; fictional price.'
from inkora_demo_order_seed d
join public.orders o on o.quote_id = d.quote_id
where not exists (select 1 from public.order_items oi where oi.order_id = o.id);

insert into public.production_jobs(order_id, machine_id, status, priority, scheduled_at, notes)
select o.id, m.id, d.production_status, d.n % 3, d.created_at + interval '1 day',
       'DEMO / SEED DATA — sample production job.'
from inkora_demo_order_seed d
join public.orders o on o.quote_id = d.quote_id
join public.machines m on m.name = case when d.n % 3 = 0 then 'Wide Format Printer'
  when d.n % 3 = 1 then 'Digital Press A' else 'Lamination Unit' end
where not exists (select 1 from public.production_jobs j where j.order_id = o.id);

insert into public.marketing_assets(order_id, caption, platform, status)
select o.id, 'DEMO / SEED DATA — sample creative draft. Replace with approved shop content.', 'instagram', 'draft'
from public.orders o
join public.quotes q on q.id = o.quote_id
where q.id::text like '00000000-0000-4000-8000-%'
  and o.status = 'delivered'
  and not exists (select 1 from public.marketing_assets a where a.order_id = o.id);

insert into public.design_requests(customer_id, order_id, brief, design_fee, status, customer_notes)
select o.customer_id, o.id,
       'DEMO / SEED DATA — sample brief for a Cairo coffee brand. Replace with a real customer brief.',
       250, 'requested'::public.design_request_status,
       'Fictional demo request. No production artwork is attached.'
from public.orders o
join public.quotes q on q.id = o.quote_id
where q.id::text like '00000000-0000-4000-8000-%'
  and mod(substring(q.id::text from 25 for 12)::bigint, 3) = 0
  and not exists (select 1 from public.design_requests d where d.order_id = o.id);

insert into public.marketing_posts(marketing_asset_id, platform, status, metrics)
select a.id, 'instagram', 'pending_approval', '{"demo_seed":true}'::jsonb
from public.marketing_assets a
join public.orders o on o.id = a.order_id
where a.caption like 'DEMO / SEED DATA%'
  and not exists (select 1 from public.marketing_posts p where p.marketing_asset_id = a.id);

commit;
