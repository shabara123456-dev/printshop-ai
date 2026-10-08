-- Manager-controlled remaining production capacity per product variant.
-- NULL means the shop has not configured a limit; zero means unavailable.
begin;

alter table public.product_variants
  add column if not exists available_quantity integer;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_variants_available_quantity_nonnegative'
      and conrelid = 'public.product_variants'::regclass
  ) then
    alter table public.product_variants
      add constraint product_variants_available_quantity_nonnegative
      check (available_quantity is null or available_quantity >= 0);
  end if;
end $$;

create or replace function public.create_order_from_accepted_quote(
  p_quote_id uuid,
  p_delivery_method text,
  p_delivery_address text,
  p_delivery_phone text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype;
  created_order_id uuid;
  requirement record;
  required_quantity numeric(14,3);
  requested_variant record;
begin
  if p_delivery_method not in ('delivery', 'pickup') then raise exception 'invalid delivery method' using errcode = '22023'; end if;
  if p_delivery_address is null or length(trim(p_delivery_address)) < 8 or length(p_delivery_address) > 500 then
    raise exception 'delivery address must be between 8 and 500 characters' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and p_delivery_address !~* '(mansoura|منصورة)' then
    raise exception 'delivery is currently limited to Mansoura' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and (p_delivery_phone is null or length(regexp_replace(p_delivery_phone, '[^0-9]', '', 'g')) < 7) then
    raise exception 'a valid recipient phone is required for delivery' using errcode = '22023';
  end if;
  if p_delivery_phone is not null and length(p_delivery_phone) > 30 then raise exception 'recipient phone is too long' using errcode = '22023'; end if;

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

  -- Lock variants in stable order and atomically debit configured availability.
  -- If any line cannot be fulfilled, PostgreSQL rolls back the entire order.
  for requested_variant in
    select qi.product_variant_id, sum(qi.quantity)::integer as quantity
    from public.quote_items qi where qi.quote_id = p_quote_id
    group by qi.product_variant_id order by qi.product_variant_id
  loop
    update public.product_variants
      set available_quantity = available_quantity - requested_variant.quantity
      where id = requested_variant.product_variant_id
        and (available_quantity is null or available_quantity >= requested_variant.quantity);
    if not found then
      raise exception 'PRODUCTION_CAPACITY_INSUFFICIENT: variant % cannot fulfill % units',
        requested_variant.product_variant_id, requested_variant.quantity using errcode = '22023';
    end if;
  end loop;

  insert into public.orders (
    customer_id, quote_id, status, payment_status, production_status,
    delivery_method, delivery_address, delivery_phone, subtotal, discount, tax, total
  ) values (
    q.customer_id, q.id, 'confirmed', 'unpaid', 'queued',
    p_delivery_method, trim(p_delivery_address), nullif(trim(p_delivery_phone), ''), q.subtotal, q.discount, q.tax, q.total
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

  insert into public.production_jobs(order_id, status, priority) values (created_order_id, 'queued', 0);
  return created_order_id;
end;
$$;

create or replace function public.release_order_production_capacity(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.product_variants v
  set available_quantity = v.available_quantity + item_totals.quantity
  from (
    select product_variant_id, sum(quantity)::integer as quantity
    from public.order_items where order_id = p_order_id
    group by product_variant_id
  ) item_totals
  where v.id = item_totals.product_variant_id and v.available_quantity is not null;
end;
$$;

create or replace function public.transition_order_status(p_order_id uuid, p_new_status public.order_status)
returns void language plpgsql security definer set search_path = '' as $$
declare current_status public.order_status;
begin
  select status into current_status from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if current_status = 'ready' and p_new_status = 'delivered' then
    update public.orders set status = 'delivered', updated_at = now() where id = p_order_id;
  elsif current_status in ('confirmed','in_production') and p_new_status = 'cancelled' then
    perform public.release_order_reservations(p_order_id);
    perform public.release_order_production_capacity(p_order_id);
    update public.production_jobs set status = 'cancelled' where order_id = p_order_id and status not in ('ready','cancelled');
    update public.orders set status = 'cancelled', production_status = 'cancelled', updated_at = now() where id = p_order_id;
  else
    raise exception 'invalid order status transition: % -> %', current_status, p_new_status using errcode = '22023';
  end if;
end;
$$;

create or replace function public.transition_production_job(p_job_id uuid, p_new_status public.production_status)
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
    perform public.release_order_production_capacity(job.order_id);
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

revoke all on function public.release_order_production_capacity(uuid) from public, anon, authenticated;
grant execute on function public.release_order_production_capacity(uuid) to service_role;

commit;
