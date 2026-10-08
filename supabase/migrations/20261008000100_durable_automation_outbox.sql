-- Durable delivery boundary between INKORA's source-of-truth transactions and n8n.
-- Events are inserted by database triggers in the same transaction as the change.
create table public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','delivered','dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  claimed_until timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index integration_outbox_pending_idx
  on public.integration_outbox (available_at, created_at)
  where status in ('pending','processing');

alter table public.integration_outbox enable row level security;
revoke all on public.integration_outbox from public, anon, authenticated;
grant select, insert, update on public.integration_outbox to service_role;

create function public.enqueue_order_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient text;
begin
  select c.email into recipient from public.customers c where c.id = new.customer_id;
  insert into public.integration_outbox(event_type, payload, idempotency_key)
  values ('order.created', jsonb_build_object(
    'type','order.created','to_email',recipient,'order_id',new.id,
    'customer_id',new.customer_id,'status',new.status,'total',new.total,'currency','EGP'
  ), 'order.created:' || new.id::text)
  on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

create trigger orders_enqueue_created_event
  after insert on public.orders for each row execute function public.enqueue_order_event();

create function public.enqueue_order_ready_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient text; customer_name text;
begin
  if new.status <> 'ready' or old.status = 'ready' then return new; end if;
  select c.email, c.name into recipient, customer_name
  from public.orders o join public.customers c on c.id = o.customer_id
  where o.id = new.order_id;
  insert into public.integration_outbox(event_type, payload, idempotency_key)
  values ('order.ready', jsonb_build_object(
    'type','order.ready','to_email',recipient,'customer_name',customer_name,
    'order_id',new.order_id,'production_job_id',new.id
  ), 'order.ready:' || new.id::text)
  on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

create trigger production_enqueue_ready_event
  after update of status on public.production_jobs
  for each row when (new.status = 'ready') execute function public.enqueue_order_ready_event();

create function public.enqueue_marketing_approved_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'approved' or old.status = 'approved' then return new; end if;
  insert into public.integration_outbox(event_type, payload, idempotency_key)
  values ('marketing.approved', jsonb_build_object(
    'type','marketing.approved','asset_id',new.id,'platform',new.platform,
    'caption',new.caption
  ), 'marketing.approved:' || new.id::text)
  on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

create trigger marketing_enqueue_approved_event
  after update of status on public.marketing_assets
  for each row when (new.status = 'approved') execute function public.enqueue_marketing_approved_event();

-- Atomic queue claim; expired leases are reclaimable after a worker crash.
create function public.claim_integration_events(p_limit integer default 10)
returns setof public.integration_outbox language plpgsql security definer set search_path = '' as $$
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid event batch size' using errcode = '22023'; end if;
  return query
  with candidates as (
    select id from public.integration_outbox
    where (status = 'pending' and available_at <= now())
       or (status = 'processing' and claimed_until < now())
    order by created_at, id
    for update skip locked
    limit p_limit
  )
  update public.integration_outbox e
  set status = 'processing', attempt_count = e.attempt_count + 1,
      claimed_until = now() + interval '60 seconds'
  from candidates c where e.id = c.id
  returning e.*;
end;
$$;

create function public.complete_integration_event(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.integration_outbox set status = 'delivered', delivered_at = now(), claimed_until = null, last_error = null
  where id = p_id and status = 'processing';
$$;

create function public.retry_integration_event(p_id uuid, p_delay_seconds integer, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_delay_seconds < 1 or p_delay_seconds > 86400 then raise exception 'invalid retry delay' using errcode = '22023'; end if;
  update public.integration_outbox set
    status = case when attempt_count >= 10 then 'dead' else 'pending' end,
    available_at = now() + make_interval(secs => p_delay_seconds),
    claimed_until = null,
    last_error = left(coalesce(p_error, 'delivery failed'), 500)
  where id = p_id and status = 'processing';
end;
$$;

revoke all on function public.enqueue_order_event() from public, anon, authenticated;
revoke all on function public.enqueue_order_ready_event() from public, anon, authenticated;
revoke all on function public.enqueue_marketing_approved_event() from public, anon, authenticated;
revoke all on function public.claim_integration_events(integer) from public, anon, authenticated;
revoke all on function public.complete_integration_event(uuid) from public, anon, authenticated;
revoke all on function public.retry_integration_event(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.claim_integration_events(integer) to service_role;
grant execute on function public.complete_integration_event(uuid) to service_role;
grant execute on function public.retry_integration_event(uuid,integer,text) to service_role;
