-- Let a manager finish the setup of an existing legacy product that has no
-- variant yet, using the same simple quantity + approved unit price workflow.
create or replace function public.configure_product_offer(
  p_actor_id uuid,
  p_product_id uuid,
  p_unit_price numeric,
  p_available_quantity integer,
  p_reason text
) returns jsonb
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
  if p_unit_price is null or p_unit_price < 0 or (p_available_quantity is not null and p_available_quantity < 0)
     or length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Enter a valid price, quantity, and reason.' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.product_variants where product_id = p_product_id) then
    raise exception 'This product already has a format. Edit its price and quantity in the product row.' using errcode = '22023';
  end if;

  insert into public.product_variants (
    product_id, sku, name, attributes, available_quantity, active
  ) values (
    p_product_id,
    left(v_product.sku, 62) || '-UNIT-' || left(replace(p_product_id::text, '-', ''), 8),
    v_product.name, '{}'::jsonb, p_available_quantity, true
  ) returning * into v_variant;

  insert into public.price_rules (
    product_variant_id, quantity_min, quantity_max, unit_price, design_fee, active_from
  ) values (
    v_variant.id, 1, null, p_unit_price, 0, current_date
  ) returning * into v_rule;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'product.offer.configured', 'product', p_product_id,
    jsonb_build_object('variant_id', v_variant.id, 'price_rule_id', v_rule.id,
      'unit_price', p_unit_price, 'available_quantity', p_available_quantity, 'reason', trim(p_reason)));

  insert into public.integration_outbox(event_type, payload, idempotency_key)
  values ('product.updated', jsonb_build_object('type', 'product.updated', 'product_id', p_product_id,
    'variant_id', v_variant.id, 'unit_price', p_unit_price, 'available_quantity', p_available_quantity),
    'product.offer.configured:' || p_product_id::text || ':' || gen_random_uuid()::text);

  return jsonb_build_object('product_id', p_product_id, 'variant_id', v_variant.id, 'price_rule_id', v_rule.id);
end;
$$;

revoke all on function public.configure_product_offer(uuid, uuid, numeric, integer, text) from public, anon, authenticated;
grant execute on function public.configure_product_offer(uuid, uuid, numeric, integer, text) to service_role;
