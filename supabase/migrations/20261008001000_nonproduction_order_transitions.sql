begin;

create or replace function public.create_order_from_accepted_quote(
  p_quote_id uuid,p_delivery_method text,p_delivery_address text,p_delivery_phone text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype;
  created_order_id uuid;
  requirement record;
  requested_variant record;
  required_quantity numeric(14,3);
  needs_production boolean := false;
begin
  if p_delivery_method not in ('delivery','pickup') then raise exception 'invalid delivery method' using errcode = '22023'; end if;
  if p_delivery_address is null or length(trim(p_delivery_address)) < 8 or length(p_delivery_address) > 500 then
    raise exception 'delivery address must be between 8 and 500 characters' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and p_delivery_address !~* '(mansoura|منصورة)' then raise exception 'delivery is currently limited to Mansoura' using errcode = '22023'; end if;
  if p_delivery_method = 'delivery' and (p_delivery_phone is null or length(regexp_replace(p_delivery_phone,'[^0-9]','','g')) < 7) then
    raise exception 'a valid recipient phone is required for delivery' using errcode = '22023';
  end if;
  if p_delivery_phone is not null and length(p_delivery_phone) > 30 then raise exception 'recipient phone is too long' using errcode = '22023'; end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'quote not found' using errcode = 'P0002'; end if;
  if q.status <> 'accepted' then raise exception 'only accepted quotes can become orders' using errcode = '22023'; end if;
  if exists (select 1 from public.orders where quote_id=p_quote_id) then raise exception 'an order already exists for this quote' using errcode = '23505'; end if;
  if not exists (select 1 from public.quote_items where quote_id=p_quote_id) then raise exception 'quote has no items' using errcode = '22023'; end if;
  if exists (select 1 from public.quote_items qi join public.product_variants v on v.id=qi.product_variant_id
    join public.products p on p.id=v.product_id where qi.quote_id=p_quote_id and (p.demo_only or not p.active or not v.active)) then
    raise exception 'PRODUCT_UNAVAILABLE: a quoted product is no longer available' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.quote_items qi
    join public.product_variants v on v.id=qi.product_variant_id
    join public.products p on p.id=v.product_id
    join public.commerce_verticals cv on cv.vertical_key=p.vertical_key
    where qi.quote_id=p_quote_id and coalesce((cv.capabilities->>'requires_production')::boolean,false) is true
  ) into needs_production;

  if exists (select 1 from public.quote_items qi join public.product_variants v on v.id=qi.product_variant_id
    join public.products p on p.id=v.product_id join public.commerce_verticals cv on cv.vertical_key=p.vertical_key
    where qi.quote_id=p_quote_id and coalesce((cv.capabilities->>'requires_material_requirements')::boolean,false)
      and not exists (select 1 from public.product_material_requirements r where r.product_variant_id=v.id and r.active)) then
    raise exception 'material requirements are not configured for every production quote item' using errcode = '22023';
  end if;

  for requested_variant in select qi.product_variant_id,sum(qi.quantity)::integer as quantity
    from public.quote_items qi where qi.quote_id=p_quote_id group by qi.product_variant_id order by qi.product_variant_id
  loop
    update public.product_variants set available_quantity=available_quantity-requested_variant.quantity
      where id=requested_variant.product_variant_id and (available_quantity is null or available_quantity >= requested_variant.quantity);
    if not found then raise exception 'PRODUCTION_CAPACITY_INSUFFICIENT: variant % cannot fulfill % units',
      requested_variant.product_variant_id,requested_variant.quantity using errcode = '22023'; end if;
  end loop;

  insert into public.orders(customer_id,quote_id,status,payment_status,production_status,delivery_method,delivery_address,delivery_phone,subtotal,discount,tax,total)
  values (q.customer_id,q.id,'confirmed','unpaid',case when needs_production is true then 'queued'::public.production_status else null end,
    p_delivery_method,trim(p_delivery_address),nullif(trim(p_delivery_phone),''),q.subtotal,q.discount,q.tax,q.total)
  returning id into created_order_id;
  insert into public.order_items(order_id,product_variant_id,quantity,unit_price,options,notes)
  select created_order_id,product_variant_id,quantity,unit_price,options,notes from public.quote_items where quote_id=p_quote_id;
  for requirement in select r.material_id,ceil(sum(qi.quantity::numeric*r.quantity_per_unit*(1+r.waste_factor))*1000)/1000 as quantity
    from public.quote_items qi join public.product_variants v on v.id=qi.product_variant_id
    join public.products p on p.id=v.product_id join public.commerce_verticals cv on cv.vertical_key=p.vertical_key
    join public.product_material_requirements r on r.product_variant_id=v.id and r.active
    where qi.quote_id=p_quote_id and coalesce((cv.capabilities->>'requires_material_requirements')::boolean,false)
    group by r.material_id order by r.material_id
  loop
    required_quantity := requirement.quantity;
    perform public.reserve_inventory(requirement.material_id,required_quantity,created_order_id);
  end loop;
  if needs_production is true then insert into public.production_jobs(order_id,status,priority) values (created_order_id,'queued',0); end if;
  return created_order_id;
end;
$$;

create or replace function public.transition_order_status(p_order_id uuid,p_new_status public.order_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_status public.order_status;
  current_production_status public.production_status;
begin
  select status,production_status into current_status,current_production_status
  from public.orders where id=p_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if current_status='ready' and p_new_status='delivered' then
    update public.orders set status='delivered',updated_at=now() where id=p_order_id;
  elsif current_status='confirmed' and p_new_status='ready' and current_production_status is null
    and not exists (select 1 from public.production_jobs where order_id=p_order_id and status <> 'cancelled') then
    update public.orders set status='ready',updated_at=now() where id=p_order_id;
  elsif current_status in ('confirmed','in_production') and p_new_status='cancelled' then
    perform public.release_order_reservations(p_order_id);
    perform public.release_order_production_capacity(p_order_id);
    update public.production_jobs set status='cancelled' where order_id=p_order_id and status not in ('ready','cancelled');
    update public.orders set status='cancelled',production_status='cancelled',updated_at=now() where id=p_order_id;
  else
    raise exception 'invalid order status transition: % -> %',current_status,p_new_status using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.transition_order_status(uuid,public.order_status) from public,anon,authenticated;
grant execute on function public.transition_order_status(uuid,public.order_status) to service_role;
revoke all on function public.create_order_from_accepted_quote(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.create_order_from_accepted_quote(uuid,text,text,text) to service_role;
commit;
