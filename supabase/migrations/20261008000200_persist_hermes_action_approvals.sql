-- Persist manager-visible Hermes proposals and one-time chat approvals.
-- Mutations remain in their existing domain services/RPCs; this table is the
-- durable approval/audit state machine, not a generic SQL execution surface.
create table public.hermes_action_proposals (
  id uuid primary key,
  manager_id uuid not null references public.users(id) on delete restrict,
  action_name text not null check (action_name in (
    'create_material','record_material_receipt','update_product_details',
    'update_order_status','update_production_status'
  )),
  arguments jsonb not null check (jsonb_typeof(arguments) = 'object'),
  status text not null default 'pending' check (status in ('pending','approved','executing','completed','failed','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  execution_started_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  error_code text,
  constraint hermes_action_proposal_expiry check (expires_at > created_at)
);

create index hermes_action_proposals_manager_recent_idx
  on public.hermes_action_proposals(manager_id, created_at desc);
create index hermes_action_proposals_pending_expiry_idx
  on public.hermes_action_proposals(expires_at)
  where status in ('pending','approved');
alter table public.hermes_action_proposals enable row level security;
revoke all on public.hermes_action_proposals from public, anon, authenticated;
grant select, insert, update on public.hermes_action_proposals to service_role;

create function public.create_hermes_action_proposal(
  p_id uuid, p_manager_id uuid, p_action_name text, p_arguments jsonb
)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare expires timestamptz := now() + interval '10 minutes';
begin
  if not exists (select 1 from public.users where id = p_manager_id and role in ('manager','admin')) then
    raise exception 'configured Hermes actor is not an authorized manager' using errcode = '42501';
  end if;
  if p_action_name not in ('create_material','record_material_receipt','update_product_details','update_order_status','update_production_status') then
    raise exception 'unsupported Hermes action' using errcode = '22023';
  end if;
  insert into public.hermes_action_proposals(id,manager_id,action_name,arguments,expires_at)
  values (p_id,p_manager_id,p_action_name,p_arguments,expires);
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values (p_manager_id,'hermes.' || p_action_name || '.proposed','hermes_action',p_id,
    jsonb_build_object('source','hermes','proposed',p_arguments));
  return expires;
end;
$$;

create function public.approve_hermes_action_proposal(p_id uuid, p_manager_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare proposal public.hermes_action_proposals%rowtype;
begin
  select * into proposal from public.hermes_action_proposals where id = p_id for update;
  if not found or proposal.manager_id <> p_manager_id or proposal.status <> 'pending' then return false; end if;
  if proposal.expires_at <= now() then
    update public.hermes_action_proposals set status = 'expired' where id = p_id;
    return false;
  end if;
  update public.hermes_action_proposals set status = 'approved', approved_at = now() where id = p_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values (p_manager_id,'hermes.' || proposal.action_name || '.approved','hermes_action',p_id,
    jsonb_build_object('source','authenticated_manager_chat'));
  return true;
end;
$$;

create function public.claim_hermes_action_proposal(
  p_id uuid, p_manager_id uuid, p_action_name text, p_arguments jsonb
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare proposal public.hermes_action_proposals%rowtype;
begin
  select * into proposal from public.hermes_action_proposals where id = p_id for update;
  if not found or proposal.manager_id <> p_manager_id or proposal.action_name <> p_action_name
     or proposal.arguments <> p_arguments or proposal.status <> 'approved'
     or proposal.expires_at <= now() or proposal.approved_at is null or proposal.approved_at < now() - interval '120 seconds' then
    return false;
  end if;
  update public.hermes_action_proposals set status = 'executing', execution_started_at = now() where id = p_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values (p_manager_id,'hermes.' || p_action_name || '.execution_started','hermes_action',p_id,
    jsonb_build_object('source','hermes'));
  return true;
end;
$$;

create function public.finish_hermes_action_proposal(
  p_id uuid, p_status text, p_result jsonb, p_error_code text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare proposal public.hermes_action_proposals%rowtype;
begin
  if p_status not in ('completed','failed') then raise exception 'invalid Hermes action result state' using errcode = '22023'; end if;
  select * into proposal from public.hermes_action_proposals where id = p_id for update;
  if not found or proposal.status <> 'executing' then raise exception 'Hermes action is not executing' using errcode = '22023'; end if;
  update public.hermes_action_proposals
  set status = p_status, finished_at = now(), result = p_result,
      error_code = case when p_status = 'failed' then left(coalesce(p_error_code,'ACTION_FAILED'),80) else null end
  where id = p_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values (proposal.manager_id,'hermes.' || proposal.action_name || '.' || p_status,'hermes_action',p_id,
    jsonb_build_object('result',p_result,'error_code',case when p_status = 'failed' then left(coalesce(p_error_code,'ACTION_FAILED'),80) else null end));
end;
$$;

revoke all on function public.create_hermes_action_proposal(uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.approve_hermes_action_proposal(uuid,uuid) from public, anon, authenticated;
revoke all on function public.claim_hermes_action_proposal(uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.finish_hermes_action_proposal(uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.create_hermes_action_proposal(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.approve_hermes_action_proposal(uuid,uuid) to service_role;
grant execute on function public.claim_hermes_action_proposal(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.finish_hermes_action_proposal(uuid,text,jsonb,text) to service_role;
