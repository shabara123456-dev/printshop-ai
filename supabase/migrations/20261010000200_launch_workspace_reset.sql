-- Start a clean shop workspace while preserving the catalog, approved prices,
-- material counts, staff users, and n8n workflow definitions.
-- Customer data and prior business activity are intentionally removed.
begin;

-- Remove pre-existing campaign drafts and their post records. Published post
-- records remain as history, but prior metrics are cleared for the new launch.
delete from public.marketing_posts
where status in ('draft', 'pending_approval', 'approved', 'scheduled', 'failed');

delete from public.marketing_assets a
where a.order_id is null
  and a.status in ('draft', 'pending_approval', 'approved', 'scheduled', 'failed')
  and not exists (select 1 from public.marketing_posts p where p.marketing_asset_id = a.id);

update public.marketing_posts set metrics = '{}'::jsonb;

-- Clear old operational and AI history, including the stale dead webhook events.
delete from public.production_jobs;
delete from public.design_requests;
delete from public.order_items;
delete from public.orders;
delete from public.quote_items;
delete from public.quotes;
delete from public.purchase_order_items;
delete from public.purchase_orders;
delete from public.inventory_transactions;
update public.materials set reserved_stock = 0, updated_at = now() where reserved_stock <> 0;
delete from public.ai_runs;
delete from public.integration_outbox;
delete from public.hermes_action_proposals;

-- Remove customer records and customer login accounts. Staff accounts remain.
delete from public.customers;
delete from auth.users u
using public.users app_user
where app_user.id = u.id and app_user.role = 'customer';
delete from public.users where role = 'customer';

-- Permanent deletion is available only for products with no historical quote
-- or order references. Related format/pricing/config records are removed as one
-- transaction; the database refuses deletion when a historical sale references it.
create or replace function public.delete_unreferenced_product(p_actor_id uuid, p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.users u where u.id = p_actor_id and u.role in ('manager', 'admin')
  ) then
    raise exception 'manager authorization required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.quote_items qi
    join public.product_variants v on v.id = qi.product_variant_id
    where v.product_id = p_product_id
  ) or exists (
    select 1 from public.order_items oi
    join public.product_variants v on v.id = oi.product_variant_id
    where v.product_id = p_product_id
  ) then
    raise exception 'product has historical sales and cannot be permanently deleted' using errcode = '23503';
  end if;

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  delete from public.product_material_requirements pmr
  using public.product_variants v
  where pmr.product_variant_id = v.id and v.product_id = p_product_id;
  delete from public.product_option_groups where product_id = p_product_id;
  delete from public.product_image_generations where product_id = p_product_id;
  delete from public.market_references mr
  using public.product_variants v
  where mr.product_variant_id = v.id and v.product_id = p_product_id;
  delete from public.price_rules pr
  using public.product_variants v
  where pr.product_variant_id = v.id and v.product_id = p_product_id;
  delete from public.product_variants where product_id = p_product_id;
  delete from public.products where id = p_product_id;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'product.permanently_deleted', 'product', p_product_id,
          jsonb_build_object('reason', 'Manager requested permanent product deletion'));
end;
$$;

revoke all on function public.delete_unreferenced_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_unreferenced_product(uuid, uuid) to service_role;

create or replace function public.update_product_shop_price(
  p_actor_id uuid, p_variant_id uuid, p_unit_price numeric, p_design_fee numeric, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  product_id uuid;
  old_rules jsonb;
begin
  if not exists (select 1 from public.users u where u.id = p_actor_id and u.role in ('manager','admin')) then
    raise exception 'manager authorization required' using errcode = '42501';
  end if;
  if p_unit_price < 0 or p_design_fee < 0 or length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'invalid approved price input' using errcode = '22023';
  end if;
  select v.product_id into product_id from public.product_variants v where v.id = p_variant_id for update;
  if product_id is null then raise exception 'variant not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.price_rules pr where pr.product_variant_id = p_variant_id and pr.active_from > current_date and pr.active_to is null) then
    raise exception 'a future price rule is already scheduled' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(pr)), '[]'::jsonb) into old_rules
  from public.price_rules pr
  where pr.product_variant_id = p_variant_id and pr.active_from <= current_date
    and (pr.active_to is null or pr.active_to >= current_date);

  update public.price_rules
  set active_to = current_date
  where product_variant_id = p_variant_id and active_from <= current_date
    and (active_to is null or active_to >= current_date);

  insert into public.price_rules(product_variant_id, quantity_min, quantity_max, unit_price, design_fee, active_from)
  values (p_variant_id, 1, null, p_unit_price, p_design_fee, current_date + 1);

  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'product.price.updated', 'product', product_id,
    jsonb_build_object('variant_id',p_variant_id,'previous_rules',old_rules,'new_unit_price',p_unit_price,
      'new_design_fee',p_design_fee,'effective_from',current_date + 1,'reason',trim(p_reason)));

  insert into public.integration_outbox(event_type,payload,idempotency_key)
  values ('product.price_changed',jsonb_build_object('type','product.price_changed','product_id',product_id,
    'variant_id',p_variant_id,'unit_price',p_unit_price,'effective_from',current_date + 1),
    'product.price_changed:' || p_variant_id::text || ':' || current_date::text || ':' || gen_random_uuid()::text);
end;
$$;
revoke all on function public.update_product_shop_price(uuid,uuid,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.update_product_shop_price(uuid,uuid,numeric,numeric,text) to service_role;

commit;
