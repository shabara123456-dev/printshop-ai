-- Reorder-policy edits may create or clear a shortage without a stock movement.
-- Keep the already-applied 006 migration immutable and cover that case additively.
create function public.enqueue_inventory_policy_change_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  available numeric(14,3) := new.current_stock - new.reserved_stock;
  event_id uuid := gen_random_uuid();
  event_payload jsonb;
begin
  -- A simultaneous stock change is handled by enqueue_inventory_change_event.
  if old.current_stock is distinct from new.current_stock
     or old.reserved_stock is distinct from new.reserved_stock then return new; end if;
  if old.reorder_point is not distinct from new.reorder_point
     and old.reorder_quantity is not distinct from new.reorder_quantity then return new; end if;

  event_payload := jsonb_build_object(
    'type','inventory.updated','material_id',new.id,'sku',new.sku,'name',new.name,'unit',new.unit,
    'current_stock',new.current_stock,'reserved_stock',new.reserved_stock,'available_stock',available,
    'reorder_point',new.reorder_point,'reorder_quantity',new.reorder_quantity
  );
  insert into public.integration_outbox(event_type,payload,idempotency_key)
    values ('inventory.updated',event_payload,'inventory.policy.updated:' || new.id::text || ':' || event_id::text);

  if old.reorder_point < available and new.reorder_point >= available then
    insert into public.integration_outbox(event_type,payload,idempotency_key)
      values ('inventory.low_stock',event_payload || jsonb_build_object('type','inventory.low_stock'),
        'inventory.low_stock.policy:' || new.id::text || ':' || event_id::text);
  elsif old.reorder_point >= available and new.reorder_point < available then
    insert into public.integration_outbox(event_type,payload,idempotency_key)
      values ('inventory.restocked',event_payload || jsonb_build_object('type','inventory.restocked'),
        'inventory.restocked.policy:' || new.id::text || ':' || event_id::text);
  end if;
  return new;
end;
$$;

create trigger materials_enqueue_inventory_policy_change
  after update of reorder_point,reorder_quantity on public.materials
  for each row execute function public.enqueue_inventory_policy_change_event();

revoke all on function public.enqueue_inventory_policy_change_event() from public,anon,authenticated;
