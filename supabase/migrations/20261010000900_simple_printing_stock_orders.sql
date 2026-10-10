begin;

-- The simplified manager product form records finished-item availability,
-- not raw-material consumption. Keep printing production jobs and stock
-- reservations, but do not block orders on hidden material-usage setup.
update public.commerce_verticals
set capabilities = jsonb_set(
  capabilities,
  '{requires_material_requirements}',
  'false'::jsonb,
  true
),
updated_at = now()
where vertical_key = 'printing';

comment on column public.product_variants.available_quantity is
  'Manager-configured sellable/fulfillable quantity. Orders reserve this quantity; materials remain optional configuration.';

commit;
