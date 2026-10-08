begin;

create table public.commerce_verticals (
  vertical_key text primary key check (vertical_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label_en text not null,
  label_ar text not null,
  capabilities jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.commerce_verticals(vertical_key,label_en,label_ar,capabilities) values
  ('printing','Printing','الطباعة', '{"requires_production":true,"requires_material_requirements":true,"supports_design":true,"supports_preflight":true,"supports_custom_options":true}'::jsonb),
  ('clothing','Clothing','الملابس', '{"requires_production":false,"requires_material_requirements":false,"supports_size_color_variants":true,"supports_custom_options":true}'::jsonb),
  ('electronics','Electronics','الإلكترونيات', '{"requires_production":false,"requires_material_requirements":false,"supports_technical_specs":true,"supports_warranty":true,"supports_custom_options":true}'::jsonb),
  ('cosmetics','Cosmetics','مستحضرات التجميل', '{"requires_production":false,"requires_material_requirements":false,"supports_ingredients":true,"supports_expiry_tracking":true,"supports_custom_options":true}'::jsonb),
  ('furniture','Furniture','الأثاث', '{"requires_production":false,"requires_material_requirements":false,"supports_dimensions":true,"supports_delivery":true,"supports_custom_options":true}'::jsonb),
  ('generic','Generic','عام', '{"requires_production":false,"requires_material_requirements":false,"supports_custom_options":true}'::jsonb)
on conflict (vertical_key) do update set
  label_en=excluded.label_en,label_ar=excluded.label_ar,capabilities=excluded.capabilities,active=true,updated_at=now();

alter table public.products
  add column vertical_key text not null default 'printing' references public.commerce_verticals(vertical_key),
  add column attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object');
alter table public.product_variants
  add column attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object');
create index products_vertical_active_idx on public.products(vertical_key,active);

alter table public.commerce_verticals enable row level security;
revoke all on public.commerce_verticals from public,anon,authenticated;
grant select on public.commerce_verticals to anon,authenticated;
grant all on public.commerce_verticals to service_role;
create policy commerce_verticals_public_read on public.commerce_verticals
  for select to anon,authenticated using (active);

-- Extend the existing product outbox trigger so vertical and specification
-- changes are delivered without creating a second event for the same update.
create or replace function public.enqueue_product_change_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  event_name text;
  event_id uuid := gen_random_uuid();
  event_payload jsonb;
begin
  if tg_op = 'INSERT' then
    event_name := 'product.created';
    event_payload := jsonb_build_object('type',event_name,'product_id',new.id,'sku',new.sku,'name',new.name,
      'category',new.category,'vertical_key',new.vertical_key,'active',new.active);
    insert into public.integration_outbox(event_type,payload,idempotency_key)
      values (event_name,event_payload,event_name || ':' || new.id::text) on conflict (idempotency_key) do nothing;
  else
    if old.name is not distinct from new.name and old.category is not distinct from new.category
       and old.description is not distinct from new.description and old.active is not distinct from new.active
       and old.vertical_key is not distinct from new.vertical_key and old.attributes is not distinct from new.attributes then return new; end if;
    event_name := 'product.updated';
    event_payload := jsonb_build_object('type',event_name,'product_id',new.id,'sku',new.sku,'name',new.name,
      'category',new.category,'vertical_key',new.vertical_key,'active',new.active);
    insert into public.integration_outbox(event_type,payload,idempotency_key)
      values (event_name,event_payload,event_name || ':' || new.id::text || ':' || event_id::text);
  end if;
  return new;
end;
$$;
drop trigger products_enqueue_updated_event on public.products;
create trigger products_enqueue_updated_event
  after update of name,category,description,active,vertical_key,attributes on public.products
  for each row execute function public.enqueue_product_change_event();

create function public.enqueue_variant_availability_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recipient text;
  product_name text;
  product_key text;
  event_type text;
begin
  if new.available_quantity is not distinct from old.available_quantity then return new; end if;
  select p.name,p.vertical_key into product_name,product_key from public.products p where p.id=new.product_id;
  event_type := case when new.available_quantity = 0 then 'product.out_of_stock'
    when old.available_quantity = 0 or (old.available_quantity is not null and new.available_quantity > old.available_quantity) then 'product.restocked'
    else 'product.availability_changed' end;
  insert into public.integration_outbox(event_type,payload,idempotency_key)
  values (event_type,jsonb_build_object('type',event_type,'product_id',new.product_id,'product_name',product_name,
    'vertical_key',product_key,'variant_id',new.id,'variant_sku',new.sku,'available_quantity',new.available_quantity,
    'previous_available_quantity',old.available_quantity),
    event_type || ':' || new.id::text || ':' || gen_random_uuid()::text);
  return new;
end;
$$;
create trigger product_variants_enqueue_availability_event
  after update of available_quantity on public.product_variants
  for each row execute function public.enqueue_variant_availability_event();

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
  requested_variant record;
  required_quantity numeric(14,3);
  needs_production boolean := false;
begin
  if p_delivery_method not in ('delivery','pickup') then raise exception 'invalid delivery method' using errcode = '22023'; end if;
  if p_delivery_address is null or length(trim(p_delivery_address)) < 8 or length(p_delivery_address) > 500 then
    raise exception 'delivery address must be between 8 and 500 characters' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and p_delivery_address !~* '(mansoura|منصورة)' then
    raise exception 'delivery is currently limited to Mansoura' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and (p_delivery_phone is null or length(regexp_replace(p_delivery_phone,'[^0-9]','','g')) < 7) then
    raise exception 'a valid recipient phone is required for delivery' using errcode = '22023';
  end if;
  if p_delivery_phone is not null and length(p_delivery_phone) > 30 then raise exception 'recipient phone is too long' using errcode = '22023'; end if;

  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'quote not found' using errcode = 'P0002'; end if;
  if q.status <> 'accepted' then raise exception 'only accepted quotes can become orders' using errcode = '22023'; end if;
  if exists (select 1 from public.orders where quote_id=p_quote_id) then raise exception 'an order already exists for this quote' using errcode = '23505'; end if;
  if not exists (select 1 from public.quote_items where quote_id=p_quote_id) then raise exception 'quote has no items' using errcode = '22023'; end if;
  if exists (
    select 1 from public.quote_items qi
    join public.product_variants v on v.id=qi.product_variant_id
    join public.products p on p.id=v.product_id
    where qi.quote_id=p_quote_id and (p.demo_only or not p.active or not v.active)
  ) then raise exception 'PRODUCT_UNAVAILABLE: a quoted product is no longer available' using errcode = '22023'; end if;

  select coalesce(bool_or(coalesce((cv.capabilities->>'requires_production')::boolean,false)),false)
  into needs_production
  from public.quote_items qi
  join public.product_variants v on v.id=qi.product_variant_id
  join public.products p on p.id=v.product_id
  join public.commerce_verticals cv on cv.vertical_key=p.vertical_key;

  if exists (
    select 1 from public.quote_items qi
    join public.product_variants v on v.id=qi.product_variant_id
    join public.products p on p.id=v.product_id
    join public.commerce_verticals cv on cv.vertical_key=p.vertical_key
    where qi.quote_id=p_quote_id
      and coalesce((cv.capabilities->>'requires_material_requirements')::boolean,false)
      and not exists (select 1 from public.product_material_requirements r where r.product_variant_id=v.id and r.active)
  ) then raise exception 'material requirements are not configured for every production quote item' using errcode = '22023'; end if;

  for requested_variant in
    select qi.product_variant_id,sum(qi.quantity)::integer as quantity
    from public.quote_items qi where qi.quote_id=p_quote_id
    group by qi.product_variant_id order by qi.product_variant_id
  loop
    update public.product_variants set available_quantity=available_quantity-requested_variant.quantity
    where id=requested_variant.product_variant_id
      and (available_quantity is null or available_quantity >= requested_variant.quantity);
    if not found then raise exception 'PRODUCTION_CAPACITY_INSUFFICIENT: variant % cannot fulfill % units',
      requested_variant.product_variant_id,requested_variant.quantity using errcode = '22023'; end if;
  end loop;

  insert into public.orders(customer_id,quote_id,status,payment_status,production_status,delivery_method,delivery_address,delivery_phone,subtotal,discount,tax,total)
  values (q.customer_id,q.id,'confirmed','unpaid',case when needs_production then 'queued'::public.production_status else null end,
    p_delivery_method,trim(p_delivery_address),nullif(trim(p_delivery_phone),''),q.subtotal,q.discount,q.tax,q.total)
  returning id into created_order_id;

  insert into public.order_items(order_id,product_variant_id,quantity,unit_price,options,notes)
  select created_order_id,product_variant_id,quantity,unit_price,options,notes from public.quote_items where quote_id=p_quote_id;

  for requirement in
    select r.material_id,ceil(sum(qi.quantity::numeric*r.quantity_per_unit*(1+r.waste_factor))*1000)/1000 as quantity
    from public.quote_items qi
    join public.product_variants v on v.id=qi.product_variant_id
    join public.products p on p.id=v.product_id
    join public.commerce_verticals cv on cv.vertical_key=p.vertical_key
    join public.product_material_requirements r on r.product_variant_id=v.id and r.active
    where qi.quote_id=p_quote_id and coalesce((cv.capabilities->>'requires_material_requirements')::boolean,false)
    group by r.material_id order by r.material_id
  loop
    required_quantity := requirement.quantity;
    perform public.reserve_inventory(requirement.material_id,required_quantity,created_order_id);
  end loop;

  if needs_production then
    insert into public.production_jobs(order_id,status,priority) values (created_order_id,'queued',0);
  end if;
  return created_order_id;
end;
$$;

create or replace function public.transition_order_status(p_order_id uuid,p_new_status public.order_status)
returns void language plpgsql security definer set search_path = '' as $$
declare current_status public.order_status;
begin
  select status into current_status from public.orders where id=p_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if current_status='ready' and p_new_status='delivered' then
    update public.orders set status='delivered',updated_at=now() where id=p_order_id;
  elsif current_status='confirmed' and p_new_status='ready'
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

create or replace function public.enqueue_order_status_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient text;
begin
  if new.status is not distinct from old.status or (new.status='ready' and exists(select 1 from public.production_jobs where order_id=new.id and status <> 'cancelled')) then return new; end if;
  select c.email into recipient from public.customers c where c.id=new.customer_id;
  if new.status='ready' then
    insert into public.integration_outbox(event_type,payload,idempotency_key)
    values ('order.ready',jsonb_build_object('type','order.ready','to_email',recipient,'order_id',new.id,'status',new.status),
      'order.ready.order:' || new.id::text) on conflict(idempotency_key) do nothing;
  else
    insert into public.integration_outbox(event_type,payload,idempotency_key)
    values ('order.status_changed',jsonb_build_object('type','order.status_changed','order_id',new.id,
      'customer_id',new.customer_id,'to_email',recipient,'previous_status',old.status,'status',new.status,'total',new.total,'currency','EGP'),
      'order.status_changed:' || new.id::text || ':' || gen_random_uuid()::text);
  end if;
  return new;
end;
$$;

revoke all on function public.create_order_from_accepted_quote(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.create_order_from_accepted_quote(uuid,text,text,text) to service_role;
revoke all on function public.transition_order_status(uuid,public.order_status) from public,anon,authenticated;
grant execute on function public.transition_order_status(uuid,public.order_status) to service_role;
revoke all on function public.enqueue_variant_availability_event() from public,anon,authenticated;
commit;
