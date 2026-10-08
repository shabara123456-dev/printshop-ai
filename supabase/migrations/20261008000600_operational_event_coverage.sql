-- Expand durable business-event coverage at the database transaction boundary.
-- n8n remains an executor; INKORA/Supabase remains the business source of truth.

create function public.enqueue_inventory_change_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_available numeric(14,3);
  new_available numeric(14,3);
  event_id uuid := gen_random_uuid();
  event_payload jsonb;
begin
  old_available := old.current_stock - old.reserved_stock;
  new_available := new.current_stock - new.reserved_stock;
  if old.current_stock = new.current_stock and old.reserved_stock = new.reserved_stock then return new; end if;

  event_payload := jsonb_build_object(
    'type','inventory.updated','material_id',new.id,'sku',new.sku,'name',new.name,'unit',new.unit,
    'current_stock',new.current_stock,'reserved_stock',new.reserved_stock,'available_stock',new_available,
    'reorder_point',new.reorder_point,'reorder_quantity',new.reorder_quantity
  );
  insert into public.integration_outbox(event_type,payload,idempotency_key)
  values ('inventory.updated',event_payload,'inventory.updated:' || new.id::text || ':' || event_id::text);

  if old_available > new.reorder_point and new_available <= new.reorder_point then
    insert into public.integration_outbox(event_type,payload,idempotency_key)
    values ('inventory.low_stock',event_payload || jsonb_build_object('type','inventory.low_stock'),
      'inventory.low_stock:' || new.id::text || ':' || event_id::text);
  elsif old_available <= old.reorder_point and new_available > new.reorder_point then
    insert into public.integration_outbox(event_type,payload,idempotency_key)
    values ('inventory.restocked',event_payload || jsonb_build_object('type','inventory.restocked'),
      'inventory.restocked:' || new.id::text || ':' || event_id::text);
  end if;
  return new;
end;
$$;

create trigger materials_enqueue_inventory_change
  after update of current_stock,reserved_stock on public.materials
  for each row execute function public.enqueue_inventory_change_event();

create function public.enqueue_product_change_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  event_name text;
  event_id uuid := gen_random_uuid();
  event_payload jsonb;
begin
  if tg_op = 'INSERT' then
    event_name := 'product.created';
    event_payload := jsonb_build_object('type',event_name,'product_id',new.id,'sku',new.sku,'name',new.name,
      'category',new.category,'active',new.active);
    insert into public.integration_outbox(event_type,payload,idempotency_key)
      values (event_name,event_payload,event_name || ':' || new.id::text) on conflict (idempotency_key) do nothing;
  else
    if old.name is not distinct from new.name and old.category is not distinct from new.category
       and old.description is not distinct from new.description and old.active is not distinct from new.active then return new; end if;
    event_name := 'product.updated';
    event_payload := jsonb_build_object('type',event_name,'product_id',new.id,'sku',new.sku,'name',new.name,
      'category',new.category,'active',new.active);
    insert into public.integration_outbox(event_type,payload,idempotency_key)
      values (event_name,event_payload,event_name || ':' || new.id::text || ':' || event_id::text);
  end if;
  return new;
end;
$$;

create trigger products_enqueue_created_event
  after insert on public.products for each row execute function public.enqueue_product_change_event();
create trigger products_enqueue_updated_event
  after update of name,category,description,active on public.products
  for each row execute function public.enqueue_product_change_event();

create function public.enqueue_order_status_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select c.email into recipient from public.customers c where c.id = new.customer_id;
  insert into public.integration_outbox(event_type,payload,idempotency_key)
  values ('order.status_changed',jsonb_build_object('type','order.status_changed','order_id',new.id,
    'customer_id',new.customer_id,'to_email',recipient,'previous_status',old.status,'status',new.status,
    'total',new.total,'currency','EGP'),
    'order.status_changed:' || new.id::text || ':' || gen_random_uuid()::text);
  return new;
end;
$$;

create trigger orders_enqueue_status_changed_event
  after update of status on public.orders
  for each row execute function public.enqueue_order_status_event();

create function public.enqueue_production_status_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  insert into public.integration_outbox(event_type,payload,idempotency_key)
  values ('production.status_changed',jsonb_build_object('type','production.status_changed','production_job_id',new.id,
    'order_id',new.order_id,'previous_status',old.status,'status',new.status),
    'production.status_changed:' || new.id::text || ':' || gen_random_uuid()::text);
  return new;
end;
$$;

create trigger production_enqueue_status_changed_event
  after update of status on public.production_jobs
  for each row execute function public.enqueue_production_status_event();

revoke all on function public.enqueue_inventory_change_event() from public,anon,authenticated;
revoke all on function public.enqueue_product_change_event() from public,anon,authenticated;
revoke all on function public.enqueue_order_status_event() from public,anon,authenticated;
revoke all on function public.enqueue_production_status_event() from public,anon,authenticated;
