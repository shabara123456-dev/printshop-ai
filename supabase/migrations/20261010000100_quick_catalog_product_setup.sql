-- Create a sellable catalog item and its first stock/price record atomically.
-- The manager UI remains simple while the database keeps its normalized model.
create or replace function public.create_quick_catalog_product(
  p_actor_id uuid,
  p_product jsonb,
  p_variant jsonb,
  p_price jsonb,
  p_show_in_store boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_variant public.product_variants;
  v_rule public.price_rules;
begin
  if not exists (
    select 1 from public.users
    where id = p_actor_id and role in ('manager'::public.app_role, 'admin'::public.app_role)
  ) then
    raise exception 'Manager permission required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_product) <> 'object' or jsonb_typeof(p_variant) <> 'object' or jsonb_typeof(p_price) <> 'object' then
    raise exception 'Product, stock, and price details are required.' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_product->>'sku')), 0) not between 1 and 80
    or coalesce(length(trim(p_product->>'name')), 0) not between 1 and 200
    or coalesce(length(trim(p_product->>'category')), 0) not between 1 and 80
    or coalesce(length(trim(p_product->>'base_unit')), 0) not between 1 and 40 then
    raise exception 'SKU, name, category, and selling unit are required.' using errcode = '22023';
  end if;
  if coalesce((p_price->>'unit_price')::numeric, -1) < 0 then
    raise exception 'Selling price must be zero or greater.' using errcode = '22023';
  end if;
  if coalesce((p_variant->>'available_quantity')::integer, 0) < 0 then
    raise exception 'Available quantity must be zero or greater.' using errcode = '22023';
  end if;

  insert into public.products (
    sku, name, category, description, base_unit, active, requires_design, requires_size,
    vertical_key, attributes, material_description, allow_customer_design_upload
  ) values (
    trim(p_product->>'sku'), trim(p_product->>'name'), trim(p_product->>'category'),
    coalesce(p_product->>'description', ''), trim(p_product->>'base_unit'), coalesce(p_show_in_store, true),
    coalesce((p_product->>'requires_design')::boolean, false), coalesce((p_product->>'requires_size')::boolean, false),
    coalesce(nullif(p_product->>'vertical_key',''), 'printing'), coalesce(p_product->'attributes', '{}'::jsonb),
    nullif(trim(p_product->>'material_description'), ''), coalesce((p_product->>'allow_customer_design_upload')::boolean, false)
  ) returning * into v_product;

  insert into public.product_variants (
    product_id, sku, name, width_cm, height_cm, material, finishing, attributes, available_quantity, active
  ) values (
    v_product.id, trim(p_variant->>'sku'), coalesce(nullif(trim(p_variant->>'name'), ''), v_product.name),
    nullif(p_variant->>'width_cm','')::numeric, nullif(p_variant->>'height_cm','')::numeric,
    nullif(trim(p_variant->>'material'), ''), nullif(trim(p_variant->>'finishing'), ''),
    coalesce(p_variant->'attributes', '{}'::jsonb), nullif(p_variant->>'available_quantity','')::integer, true
  ) returning * into v_variant;

  insert into public.price_rules (
    product_variant_id, quantity_min, quantity_max, material, finishing, unit_price,
    fixed_fee, setup_fee, design_fee, installation_fee, delivery_fee, tax_rate, active_from
  ) values (
    v_variant.id, 1, null, null, null, (p_price->>'unit_price')::numeric,
    0, 0, coalesce(nullif(p_price->>'design_fee','')::numeric, 50), 0, 0,
    coalesce(nullif(p_price->>'tax_rate','')::numeric, 0), current_date
  ) returning * into v_rule;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  values
    (p_actor_id, 'product.quick_created', 'product', v_product.id,
      jsonb_build_object('show_in_store', coalesce(p_show_in_store, true), 'variant_id', v_variant.id, 'starting_quantity', v_variant.available_quantity)),
    (p_actor_id, 'price_rule.created', 'price_rule', v_rule.id,
      jsonb_build_object('reason', 'Manager approved the initial price during product setup.', 'new', to_jsonb(v_rule)));

  return jsonb_build_object('product_id', v_product.id, 'variant_id', v_variant.id, 'price_rule_id', v_rule.id);
end;
$$;

revoke all on function public.create_quick_catalog_product(uuid,jsonb,jsonb,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.create_quick_catalog_product(uuid,jsonb,jsonb,jsonb,boolean) to service_role;
