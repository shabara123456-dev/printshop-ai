-- Production-ready already has a dedicated customer notification event.
-- Avoid enqueuing a second customer-facing order.status_changed message.
create or replace function public.enqueue_order_status_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient text;
begin
  if new.status is not distinct from old.status or new.status = 'ready' then return new; end if;
  select c.email into recipient from public.customers c where c.id = new.customer_id;
  insert into public.integration_outbox(event_type,payload,idempotency_key)
  values ('order.status_changed',jsonb_build_object('type','order.status_changed','order_id',new.id,
    'customer_id',new.customer_id,'to_email',recipient,'previous_status',old.status,'status',new.status,
    'total',new.total,'currency','EGP'),
    'order.status_changed:' || new.id::text || ':' || gen_random_uuid()::text);
  return new;
end;
$$;
