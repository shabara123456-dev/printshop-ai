-- Record the cited market source, then add the user-approved midpoint as a scoped
-- quote rule for exactly 1,000 waterproof vinyl stickers at 10 x 8 cm.
alter table public.price_rules
  add column pricing_basis text not null default 'shop_approved',
  add column market_reference_id uuid references public.market_references(id) on delete restrict,
  add constraint price_rules_pricing_basis_valid check (pricing_basis in ('shop_approved', 'user_approved_market_midpoint')),
  add constraint price_rules_reference_consistent check (
    (pricing_basis = 'shop_approved' and market_reference_id is null)
    or (pricing_basis = 'user_approved_market_midpoint' and market_reference_id is not null)
  );

create index price_rules_market_reference_idx on public.price_rules(market_reference_id) where market_reference_id is not null;

update public.market_references
set source_name = 'El Sewedy',
    source_url = 'https://elsewedyprint.com/en/sticker-printing-prices-in-egypt/',
    source_date = date '2026-05-12'
where source_name = 'El Sewedy (as cited in project handoff)';

insert into public.price_rules (
  product_variant_id, quantity_min, quantity_max, material, finishing, unit_price,
  fixed_fee, setup_fee, design_fee, installation_fee, delivery_fee, tax_rate,
  active_from, pricing_basis, market_reference_id
)
select
  variant.id, 1000, 1000, 'Waterproof Vinyl', null, 2.10,
  0, 0, 0, 0, 0, 0,
  current_date, 'user_approved_market_midpoint', reference.id
from public.product_variants variant
join public.market_references reference
  on reference.product_variant_id = variant.id
where variant.sku = 'DEMO-STICKER-10X8'
  and reference.quantity = 1000
  and reference.source_name = 'El Sewedy'
  and not exists (
    select 1 from public.price_rules existing
    where existing.product_variant_id = variant.id
      and existing.quantity_min = 1000
      and existing.quantity_max = 1000
      and existing.material = 'Waterproof Vinyl'
      and existing.finishing is null
      and existing.pricing_basis = 'user_approved_market_midpoint'
      and existing.market_reference_id = reference.id
      and existing.active_to is null
  );
