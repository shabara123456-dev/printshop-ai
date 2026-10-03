-- Phase 3: material requirements, inventory ledger operations, and guarded state transitions.

create table public.product_material_requirements (
  id uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity_per_unit numeric(14,6) not null,
  waste_factor numeric(7,5) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint product_material_requirements_quantity_positive check (quantity_per_unit > 0),
  constraint product_material_requirements_waste_nonnegative check (waste_factor >= 0),
  constraint product_material_requirements_variant_material_unique unique (product_variant_id, material_id)
);
create index product_material_requirements_variant_active_idx
  on public.product_material_requirements(product_variant_id, active);
create index product_material_requirements_material_idx
  on public.product_material_requirements(material_id);
alter table public.product_material_requirements enable row level security;
create policy product_material_requirements_staff_read
  on public.product_material_requirements for select to authenticated
  using (public.has_any_role(array['manager','production','admin']::public.app_role[]));

-- Reservations, receipts, adjustments, releases, and consumption all update the
-- material row and append a ledger entry in the same transaction. Non-adjustment
-- ledger quantities are positive; transaction_type defines their meaning.
create function public.receive_inventory(
  p_material_id uuid, p_quantity numeric, p_unit_cost numeric, p_reference_type text, p_reference_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive' using errcode = '22023'; end if;
  if p_unit_cost is not null and p_unit_cost < 0 then raise exception 'unit_cost cannot be negative' using errcode = '22023'; end if;
  update public.materials set current_stock = current_stock + p_quantity, updated_at = now()
    where id = p_material_id and active;
  if not found then raise exception 'active material not found' using errcode = 'P0002'; end if;
  insert into public.inventory_transactions(material_id, transaction_type, quantity, unit_cost, reference_type, reference_id)
    values (p_material_id, 'purchase', p_quantity, p_unit_cost, p_reference_type, p_reference_id);
end;
$$;

create function public.adjust_inventory(p_material_id uuid, p_delta numeric, p_reference_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare new_stock numeric(14,3);
begin
  if p_delta is null or p_delta = 0 then raise exception 'adjustment delta cannot be zero' using errcode = '22023'; end if;
  update public.materials set current_stock = current_stock + p_delta, updated_at = now()
    where id = p_material_id and active and current_stock + p_delta >= reserved_stock
    returning current_stock into new_stock;
  if not found then raise exception 'material missing or adjustment would reduce stock below reserved stock' using errcode = '23514'; end if;
  insert into public.inventory_transactions(material_id, transaction_type, quantity, reference_type, reference_id)
    values (p_material_id, 'adjustment', p_delta, 'manual_adjustment', p_reference_id);
end;
$$;

create function public.reserve_inventory(p_material_id uuid, p_quantity numeric, p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare available numeric(14,3); current_order_status public.order_status;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive' using errcode = '22023'; end if;
  select status into current_order_status from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if current_order_status not in ('confirmed','in_production') then raise exception 'inventory can only be reserved for active orders' using errcode = '22023'; end if;
  select current_stock - reserved_stock into available
    from public.materials where id = p_material_id and active for update;
  if not found then raise exception 'active material not found' using errcode = 'P0002'; end if;
  if available < p_quantity then raise exception 'insufficient available stock' using errcode = '23514'; end if;
  update public.materials set reserved_stock = reserved_stock + p_quantity, updated_at = now() where id = p_material_id;
  insert into public.inventory_transactions(material_id, transaction_type, quantity, reference_type, reference_id)
    values (p_material_id, 'reservation', p_quantity, 'order', p_order_id);
end;
$$;

create function public.release_inventory(p_material_id uuid, p_quantity numeric, p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare held numeric(14,3); current_reserved numeric(14,3);
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive' using errcode = '22023'; end if;
  select reserved_stock into current_reserved from public.materials where id = p_material_id for update;
  if not found then raise exception 'material not found' using errcode = 'P0002'; end if;
  select coalesce(sum(case when transaction_type = 'reservation' then quantity else -quantity end), 0)
    into held from public.inventory_transactions
    where material_id = p_material_id and reference_type = 'order' and reference_id = p_order_id
      and transaction_type in ('reservation','release','consumption');
  if held < p_quantity or current_reserved < p_quantity then raise exception 'release exceeds this order reservation' using errcode = '23514'; end if;
  update public.materials set reserved_stock = reserved_stock - p_quantity, updated_at = now() where id = p_material_id;
  insert into public.inventory_transactions(material_id, transaction_type, quantity, reference_type, reference_id)
    values (p_material_id, 'release', p_quantity, 'order', p_order_id);
end;
$$;

create function public.consume_reserved_inventory(p_material_id uuid, p_quantity numeric, p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare held numeric(14,3); current_reserved numeric(14,3);
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive' using errcode = '22023'; end if;
  select reserved_stock into current_reserved from public.materials where id = p_material_id for update;
  if not found then raise exception 'material not found' using errcode = 'P0002'; end if;
  select coalesce(sum(case when transaction_type = 'reservation' then quantity else -quantity end), 0)
    into held from public.inventory_transactions
    where material_id = p_material_id and reference_type = 'order' and reference_id = p_order_id
      and transaction_type in ('reservation','release','consumption');
  if held < p_quantity or current_reserved < p_quantity then raise exception 'consumption exceeds this order reservation' using errcode = '23514'; end if;
  update public.materials
    set current_stock = current_stock - p_quantity, reserved_stock = reserved_stock - p_quantity, updated_at = now()
    where id = p_material_id and current_stock >= p_quantity;
  if not found then raise exception 'insufficient on-hand stock' using errcode = '23514'; end if;
  insert into public.inventory_transactions(material_id, transaction_type, quantity, reference_type, reference_id)
    values (p_material_id, 'consumption', p_quantity, 'order', p_order_id);
end;
$$;

create function public.transition_quote_status(p_quote_id uuid, p_new_status public.quote_status)
returns void language plpgsql security definer set search_path = '' as $$
declare current_status public.quote_status; quote_valid_until timestamptz;
begin
  select status, valid_until into current_status, quote_valid_until from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'quote not found' using errcode = 'P0002'; end if;
  if current_status = 'draft' and p_new_status = 'sent' then
    update public.quotes set status = 'sent', updated_at = now() where id = p_quote_id;
  elsif current_status = 'sent' and p_new_status = 'accepted' and (quote_valid_until is null or quote_valid_until >= now()) then
    update public.quotes set status = 'accepted', updated_at = now() where id = p_quote_id;
  elsif current_status = 'sent' and p_new_status = 'rejected' then
    update public.quotes set status = 'rejected', updated_at = now() where id = p_quote_id;
  elsif current_status = 'sent' and p_new_status = 'expired' and quote_valid_until < now() then
    update public.quotes set status = 'expired', updated_at = now() where id = p_quote_id;
  else
    raise exception 'invalid quote status transition: % -> %', current_status, p_new_status using errcode = '22023';
  end if;
end;
$$;

create function public.create_order_from_accepted_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype;
  created_order_id uuid;
  requirement record;
  required_quantity numeric(14,3);
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'quote not found' using errcode = 'P0002'; end if;
  if q.status <> 'accepted' then raise exception 'only accepted quotes can become orders' using errcode = '22023'; end if;
  if exists (select 1 from public.orders where quote_id = p_quote_id) then raise exception 'an order already exists for this quote' using errcode = '23505'; end if;
  if not exists (select 1 from public.quote_items where quote_id = p_quote_id) then raise exception 'quote has no items' using errcode = '22023'; end if;
  if exists (
    select 1 from public.quote_items qi
    where qi.quote_id = p_quote_id and not exists (
      select 1 from public.product_material_requirements r
      where r.product_variant_id = qi.product_variant_id and r.active
    )
  ) then raise exception 'material requirements are not configured for every quote item' using errcode = '22023'; end if;

  insert into public.orders (
    customer_id, quote_id, status, payment_status, production_status,
    subtotal, discount, tax, total
  ) values (
    q.customer_id, q.id, 'confirmed', 'unpaid', 'queued', q.subtotal, q.discount, q.tax, q.total
  ) returning id into created_order_id;

  insert into public.order_items(order_id, product_variant_id, quantity, unit_price, options, notes)
  select created_order_id, product_variant_id, quantity, unit_price, options, notes
  from public.quote_items where quote_id = p_quote_id;

  for requirement in
    select r.material_id,
      ceil(sum(qi.quantity::numeric * r.quantity_per_unit * (1 + r.waste_factor)) * 1000) / 1000 as quantity
    from public.quote_items qi
    join public.product_material_requirements r on r.product_variant_id = qi.product_variant_id and r.active
    where qi.quote_id = p_quote_id
    group by r.material_id order by r.material_id
  loop
    required_quantity := requirement.quantity;
    perform public.reserve_inventory(requirement.material_id, required_quantity, created_order_id);
  end loop;

  insert into public.production_jobs(order_id, status, priority)
  values (created_order_id, 'queued', 0);
  return created_order_id;
end;
$$;

create function public.release_order_reservations(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare reservation record;
begin
  for reservation in
    select material_id,
      sum(case when transaction_type = 'reservation' then quantity else -quantity end) as quantity
    from public.inventory_transactions
    where reference_type = 'order' and reference_id = p_order_id
      and transaction_type in ('reservation','release','consumption')
    group by material_id
    having sum(case when transaction_type = 'reservation' then quantity else -quantity end) > 0
    order by material_id
  loop
    perform public.release_inventory(reservation.material_id, reservation.quantity, p_order_id);
  end loop;
end;
$$;

create function public.transition_order_status(p_order_id uuid, p_new_status public.order_status)
returns void language plpgsql security definer set search_path = '' as $$
declare current_status public.order_status;
begin
  select status into current_status from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if current_status = 'ready' and p_new_status = 'delivered' then
    update public.orders set status = 'delivered', updated_at = now() where id = p_order_id;
  elsif current_status in ('confirmed','in_production') and p_new_status = 'cancelled' then
    perform public.release_order_reservations(p_order_id);
    update public.production_jobs set status = 'cancelled' where order_id = p_order_id and status not in ('ready','cancelled');
    update public.orders set status = 'cancelled', production_status = 'cancelled', updated_at = now() where id = p_order_id;
  else
    raise exception 'invalid order status transition: % -> %', current_status, p_new_status using errcode = '22023';
  end if;
end;
$$;

create function public.transition_production_job(p_job_id uuid, p_new_status public.production_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  job public.production_jobs%rowtype;
  job_order_id uuid;
  locked_order_id uuid;
  allowed boolean := false;
  reservation record;
begin
  select order_id into job_order_id from public.production_jobs where id = p_job_id;
  if not found then raise exception 'production job not found' using errcode = 'P0002'; end if;
  select id into locked_order_id from public.orders where id = job_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  select * into job from public.production_jobs where id = p_job_id for update;
  if not found then raise exception 'production job not found' using errcode = 'P0002'; end if;
  allowed :=
    (job.status = 'queued' and p_new_status in ('prepress','cancelled')) or
    (job.status = 'prepress' and p_new_status in ('printing','cancelled')) or
    (job.status = 'printing' and p_new_status in ('finishing','cancelled')) or
    (job.status = 'finishing' and p_new_status in ('quality_check','cancelled')) or
    (job.status = 'quality_check' and p_new_status in ('ready','cancelled'));
  if not allowed then raise exception 'invalid production transition: % -> %', job.status, p_new_status using errcode = '22023'; end if;

  if p_new_status = 'cancelled' then
    perform public.release_order_reservations(job.order_id);
    update public.orders set status = 'cancelled', production_status = 'cancelled', updated_at = now() where id = job.order_id;
    update public.production_jobs set status = 'cancelled' where order_id = job.order_id and id <> p_job_id and status not in ('ready','cancelled');
  elsif p_new_status = 'ready' then
    for reservation in
      select material_id,
        sum(case when transaction_type = 'reservation' then quantity else -quantity end) as quantity
      from public.inventory_transactions
      where reference_type = 'order' and reference_id = job.order_id
        and transaction_type in ('reservation','release','consumption')
      group by material_id
      having sum(case when transaction_type = 'reservation' then quantity else -quantity end) > 0
      order by material_id
    loop
      perform public.consume_reserved_inventory(reservation.material_id, reservation.quantity, job.order_id);
    end loop;
    update public.orders set status = 'ready', production_status = 'ready', updated_at = now() where id = job.order_id;
  else
    update public.orders
      set status = case when status = 'confirmed' then 'in_production'::public.order_status else status end,
          production_status = p_new_status, updated_at = now()
      where id = job.order_id;
  end if;

  update public.production_jobs
    set status = p_new_status,
        started_at = case when p_new_status = 'prepress' then coalesce(started_at, now()) else started_at end,
        completed_at = case when p_new_status = 'ready' then now() else completed_at end
    where id = p_job_id;
end;
$$;

-- Keep all mutations behind the server. API authentication and role checks happen before RPC calls.
revoke all on function public.receive_inventory(uuid,numeric,numeric,text,uuid) from public, anon, authenticated;
revoke all on function public.adjust_inventory(uuid,numeric,uuid) from public, anon, authenticated;
revoke all on function public.reserve_inventory(uuid,numeric,uuid) from public, anon, authenticated;
revoke all on function public.release_inventory(uuid,numeric,uuid) from public, anon, authenticated;
revoke all on function public.consume_reserved_inventory(uuid,numeric,uuid) from public, anon, authenticated;
revoke all on function public.transition_quote_status(uuid,public.quote_status) from public, anon, authenticated;
revoke all on function public.create_order_from_accepted_quote(uuid) from public, anon, authenticated;
revoke all on function public.release_order_reservations(uuid) from public, anon, authenticated;
revoke all on function public.transition_order_status(uuid,public.order_status) from public, anon, authenticated;
revoke all on function public.transition_production_job(uuid,public.production_status) from public, anon, authenticated;
grant execute on function public.receive_inventory(uuid,numeric,numeric,text,uuid) to service_role;
grant execute on function public.adjust_inventory(uuid,numeric,uuid) to service_role;
grant execute on function public.reserve_inventory(uuid,numeric,uuid) to service_role;
grant execute on function public.release_inventory(uuid,numeric,uuid) to service_role;
grant execute on function public.consume_reserved_inventory(uuid,numeric,uuid) to service_role;
grant execute on function public.transition_quote_status(uuid,public.quote_status) to service_role;
grant execute on function public.create_order_from_accepted_quote(uuid) to service_role;
grant execute on function public.release_order_reservations(uuid) to service_role;
grant execute on function public.transition_order_status(uuid,public.order_status) to service_role;
grant execute on function public.transition_production_job(uuid,public.production_status) to service_role;
