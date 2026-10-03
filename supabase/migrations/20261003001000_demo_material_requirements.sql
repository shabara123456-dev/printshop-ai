-- Configure illustrative material use so accepted demo quotes can reserve stock
-- and enter production. These rates and opening mug blanks are fictional demo
-- values and must be replaced by the real shop's BOM and stock counts.
begin;

insert into public.materials(
  sku, name, category, unit, current_stock, reserved_stock, reorder_point,
  reorder_quantity, cost_per_unit, active
)
select 'DEMO-MUG-BLANK', 'Ceramic mug blanks (demo)', 'blanks', 'piece',
       1200, 0, 200, 500, null, true
where not exists (select 1 from public.materials where sku = 'DEMO-MUG-BLANK');

insert into public.inventory_transactions(
  material_id, transaction_type, quantity, reference_type
)
select m.id, 'adjustment', m.current_stock, 'demo_seed_opening_balance'
from public.materials m
where m.sku = 'DEMO-MUG-BLANK'
  and m.current_stock > 0
  and not exists (
    select 1 from public.inventory_transactions t
    where t.material_id = m.id and t.reference_type = 'demo_seed_opening_balance'
  );

with substrate as (
  select v.id as variant_id,
         case
           when p.sku = 'DEMO-STICKER' then 'DEMO-VINYL'
           when p.sku = 'INK-BANNER' then 'DEMO-VINYL'
           when p.sku = 'INK-LABEL' and v.sku like '%10X7' then 'DEMO-VINYL'
           when p.sku in ('INK-BAG', 'INK-TSHIRT') then 'DEMO-CANVAS'
           when p.sku = 'INK-MUG' then 'DEMO-MUG-BLANK'
           when p.sku = 'INK-PACK' then 'DEMO-CARTON'
           when p.sku in ('INK-BIZCARD', 'INK-INVITE', 'INK-CERT', 'INK-FOLDER') then 'DEMO-CARD-350'
           else 'DEMO-PAPER-150'
         end as material_sku,
         case
           when p.sku = 'DEMO-STICKER' then least(v.width_cm, v.height_cm) / 100
           when p.sku = 'INK-BANNER' then 2
           when p.sku = 'INK-LABEL' and v.sku like '%10X7' then least(v.width_cm, v.height_cm) / 100
           when p.sku = 'INK-LABEL' and v.sku like '%5X3' then 0.005
           when p.sku = 'INK-LABEL' then 0.01
           when p.sku = 'INK-BIZCARD' then 0.02
           when p.sku = 'INK-FOLDER' then 0.15
           when p.sku = 'INK-BOOKLET' and v.sku like '%8P' then 4
           when p.sku = 'INK-BOOKLET' then 8
           when p.sku = 'INK-NOTEBOOK' and v.sku like '%A6' then 40
           when p.sku = 'INK-NOTEBOOK' then 50
           when p.sku = 'INK-CALENDAR' then 13
           when p.sku = 'INK-MENU' and v.sku like '%A3FOLD' then 2
           when p.sku = 'INK-MENU' and v.sku like '%A5BOOK' then 4
           when p.sku = 'INK-PACK' then 0.1
           when p.sku in ('INK-BAG', 'INK-TSHIRT') and (v.sku like '%LARGE' or v.sku like '%-L') then 0.35
           when p.sku in ('INK-BAG', 'INK-TSHIRT') then 0.25
           when p.sku = 'INK-MUG' then 1
           else 1
         end as quantity_per_unit,
         case
           when p.sku = 'DEMO-STICKER' or p.sku = 'INK-BANNER' then 0.15
           else 0.05
         end as waste_factor
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.active and (p.sku = 'DEMO-STICKER' or p.sku like 'INK-%')
), material_ids as (
  select s.variant_id, m.id as material_id, s.quantity_per_unit, s.waste_factor
  from substrate s
  join public.materials m on m.sku = s.material_sku and m.active
)
insert into public.product_material_requirements(
  product_variant_id, material_id, quantity_per_unit, waste_factor, active
)
select x.variant_id, x.material_id, x.quantity_per_unit, x.waste_factor, true
from material_ids x
where not exists (
  select 1 from public.product_material_requirements existing
  where existing.product_variant_id = x.variant_id and existing.active
)
on conflict (product_variant_id, material_id) do nothing;

-- Small demo ink allowance per unit for every printed catalog item.
insert into public.product_material_requirements(
  product_variant_id, material_id, quantity_per_unit, waste_factor, active
)
select v.id, m.id, 0.001, 0.05, true
from public.product_variants v
join public.products p on p.id = v.product_id
join public.materials m on m.sku = 'DEMO-INK-CMYK' and m.active
where v.active and (p.sku = 'DEMO-STICKER' or p.sku like 'INK-%')
  and not exists (
    select 1 from public.product_material_requirements existing
    where existing.product_variant_id = v.id and existing.material_id = m.id
  )
on conflict (product_variant_id, material_id) do nothing;

-- The sample menu variants include lamination in their display name and rule.
insert into public.product_material_requirements(
  product_variant_id, material_id, quantity_per_unit, waste_factor, active
)
select v.id, m.id,
       case when v.sku like '%A3FOLD' then 0.6
            when v.sku like '%A5BOOK' then 0.4 else 0.3 end,
       0.05, true
from public.product_variants v
join public.products p on p.id = v.product_id and p.sku = 'INK-MENU'
join public.materials m on m.sku = 'DEMO-LAMINATE' and m.active
where v.active
  and not exists (
    select 1 from public.product_material_requirements existing
    where existing.product_variant_id = v.id and existing.material_id = m.id
  )
on conflict (product_variant_id, material_id) do nothing;

commit;
