-- Persist customer-selected delivery method and Mansoura delivery/pickup address
-- inside the same transaction that creates the order and reserves materials.
drop function public.create_order_from_accepted_quote(uuid);

create function public.create_order_from_accepted_quote(
  p_quote_id uuid,
  p_delivery_method text,
  p_delivery_address text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype;
  created_order_id uuid;
  requirement record;
  required_quantity numeric(14,3);
begin
  if p_delivery_method not in ('delivery', 'pickup') then
    raise exception 'invalid delivery method' using errcode = '22023';
  end if;
  if p_delivery_address is null or length(trim(p_delivery_address)) < 8 or length(p_delivery_address) > 500 then
    raise exception 'delivery address must be between 8 and 500 characters' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and p_delivery_address !~* '(mansoura|منصورة)' then
    raise exception 'delivery is currently limited to Mansoura' using errcode = '22023';
  end if;
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
    delivery_method, delivery_address, subtotal, discount, tax, total
  ) values (
    q.customer_id, q.id, 'confirmed', 'unpaid', 'queued',
    p_delivery_method, trim(p_delivery_address), q.subtotal, q.discount, q.tax, q.total
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

-- Retain the original RPC signature for existing trusted integrations and SQL checks.
create function public.create_order_from_accepted_quote(p_quote_id uuid)
returns uuid language sql security definer set search_path = '' as $$
  select public.create_order_from_accepted_quote(p_quote_id, 'pickup', 'Store pickup: Samia El-Gamal, Mansoura, Dakahlia');
$$;

revoke all on function public.create_order_from_accepted_quote(uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_order_from_accepted_quote(uuid,text,text) to service_role;
revoke all on function public.create_order_from_accepted_quote(uuid) from public, anon, authenticated;
grant execute on function public.create_order_from_accepted_quote(uuid) to service_role;
