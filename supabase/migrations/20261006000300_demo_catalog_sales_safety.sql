-- Mark fictional INK catalog rows as sample-only and prevent a demo price
-- from being used to produce customer quotes or orders. Managers can promote
-- a product after replacing its active demo rules with audited shop rules.
begin;

alter table public.products
  add column if not exists demo_only boolean not null default false;

update public.products
set demo_only = true
where sku like 'INK-%' and demo_only = false;

create or replace function public.promote_demo_product(p_actor_id uuid, p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
begin
  if not exists (
    select 1 from public.users
    where id = p_actor_id and role in ('manager'::public.app_role, 'admin'::public.app_role)
  ) then
    raise exception 'Manager permission required.' using errcode = '42501';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found.' using errcode = 'P0002'; end if;
  if not v_product.demo_only then raise exception 'Product is already enabled for sales.' using errcode = '22023'; end if;
  if not exists (select 1 from public.product_variants v where v.product_id = p_product_id and v.active) then
    raise exception 'Add an active product format before enabling sales.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.product_variants v
    where v.product_id = p_product_id and v.active
      and not exists (
        select 1 from public.price_rules r
        where r.product_variant_id = v.id
          and r.active_from <= current_date
          and (r.active_to is null or r.active_to >= current_date)
          and exists (
            select 1 from public.audit_logs a
            where a.entity_type = 'price_rule' and a.entity_id = r.id
              and a.action = 'price_rule.created'
          )
      )
  ) then
    raise exception 'Replace each active demo price with a manager-approved price rule before enabling sales.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.price_rules r
    join public.product_variants v on v.id = r.product_variant_id
    where v.product_id = p_product_id and v.active
      and r.active_from <= current_date
      and (r.active_to is null or r.active_to >= current_date)
      and not exists (
        select 1 from public.audit_logs a
        where a.entity_type = 'price_rule' and a.entity_id = r.id
          and a.action = 'price_rule.created'
      )
  ) then
    raise exception 'End every demo price rule before enabling sales.' using errcode = '22023';
  end if;

  update public.products set demo_only = false, updated_at = now() where id = p_product_id;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'product.promoted_from_demo', 'product', p_product_id,
    jsonb_build_object('previous_demo_only', true, 'new_demo_only', false, 'active_variants', (
      select count(*) from public.product_variants where product_id = p_product_id and active
    )));
end;
$$;

revoke all on function public.promote_demo_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.promote_demo_product(uuid, uuid) to service_role;

create or replace function public.prevent_demo_product_orders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quote_id is not null and exists (
    select 1
    from public.quote_items qi
    join public.product_variants v on v.id = qi.product_variant_id
    join public.products p on p.id = v.product_id
    where qi.quote_id = new.quote_id and p.demo_only
  ) then
    raise exception 'DEMO_ONLY_PRODUCTS: this sample catalog item is not available for sale.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_prevent_demo_product_sales on public.orders;
create trigger orders_prevent_demo_product_sales
  before insert on public.orders
  for each row execute function public.prevent_demo_product_orders();

commit;
