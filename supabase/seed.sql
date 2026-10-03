-- Public price ranges supplied in the handoff. These are market references only,
-- not internal costs or quote rules. URL and observation date were not provided.
with sticker as (
  insert into public.products (sku,name,category,description,base_unit,active,requires_design,requires_size)
  values ('DEMO-STICKER','Waterproof Vinyl Sticker','stickers','Market-reference entry; configure shop production pricing separately.','piece',true,true,true)
  on conflict (sku) do update set name=excluded.name
  returning id
), variants as (
  insert into public.product_variants (product_id,sku,name,width_cm,height_cm,material,active)
  select sticker.id,v.sku,v.name,v.width_cm,v.height_cm,'Waterproof Vinyl',true from sticker cross join (values
    ('DEMO-STICKER-5X5','5 x 5 cm',5::numeric,5::numeric),
    ('DEMO-STICKER-10X8','10 x 8 cm',10::numeric,8::numeric),
    ('DEMO-STICKER-15X10','15 x 10 cm',15::numeric,10::numeric)
  ) as v(sku,name,width_cm,height_cm)
  on conflict (sku) do update set name=excluded.name,width_cm=excluded.width_cm,height_cm=excluded.height_cm,material=excluded.material
  returning id,sku
)
insert into public.market_references (product_variant_id,quantity,min_price,max_price,currency,source_name,source_url,source_date)
select v.id,r.quantity,r.min_price,r.max_price,'EGP','El Sewedy','https://elsewedyprint.com/en/sticker-printing-prices-in-egypt/','2026-05-12'
from variants v join (values
  ('DEMO-STICKER-5X5',500,700::numeric,1000::numeric),('DEMO-STICKER-5X5',1000,1200::numeric,1600::numeric),('DEMO-STICKER-5X5',5000,4000::numeric,5500::numeric),
  ('DEMO-STICKER-10X8',500,1000::numeric,1400::numeric),('DEMO-STICKER-10X8',1000,1800::numeric,2400::numeric),('DEMO-STICKER-10X8',5000,6000::numeric,8000::numeric),
  ('DEMO-STICKER-15X10',500,1500::numeric,2000::numeric),('DEMO-STICKER-15X10',1000,2500::numeric,3500::numeric),('DEMO-STICKER-15X10',5000,8000::numeric,11000::numeric)
) as r(sku,quantity,min_price,max_price) on r.sku=v.sku
where not exists (select 1 from public.market_references x where x.product_variant_id=v.id and x.quantity=r.quantity and x.source_name='El Sewedy');

-- This exact-configuration midpoint was explicitly selected by the project owner:
-- EGP 2,100 total for 1,000 pieces = EGP 2.10 per piece. It does not generalize
-- to other quantities and carries its market-reference provenance on the rule.
insert into public.price_rules (
  product_variant_id,quantity_min,quantity_max,material,unit_price,
  fixed_fee,setup_fee,design_fee,installation_fee,delivery_fee,tax_rate,
  active_from,pricing_basis,market_reference_id
)
select v.id,1000,1000,'Waterproof Vinyl',2.10,0,0,0,0,0,0,current_date,'user_approved_market_midpoint',r.id
from public.product_variants v
join public.market_references r on r.product_variant_id=v.id and r.quantity=1000 and r.source_name='El Sewedy'
where v.sku='DEMO-STICKER-10X8'
  and not exists (
    select 1 from public.price_rules existing
    where existing.product_variant_id=v.id and existing.quantity_min=1000 and existing.quantity_max=1000
      and existing.material='Waterproof Vinyl' and existing.finishing is null
      and existing.pricing_basis='user_approved_market_midpoint' and existing.market_reference_id=r.id
      and existing.active_to is null
  );
