-- Manager-safe controls for viewing recent automation delivery and replaying dead events.
create function public.retry_dead_integration_event(p_actor_id uuid, p_event_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare event_row public.integration_outbox%rowtype;
begin
  if not exists (select 1 from public.users where id=p_actor_id and role in ('manager','admin')) then
    raise exception 'Manager permission required.' using errcode='42501';
  end if;
  select * into event_row from public.integration_outbox where id=p_event_id for update;
  if not found or event_row.status <> 'dead' then return false; end if;
  update public.integration_outbox set status='pending',attempt_count=0,available_at=now(),claimed_until=null,last_error=null where id=p_event_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values (p_actor_id,'automation.event.retried','integration_outbox',p_event_id,
    jsonb_build_object('event_type',event_row.event_type,'previous_attempt_count',event_row.attempt_count));
  return true;
end;
$$;

revoke all on function public.retry_dead_integration_event(uuid,uuid) from public, anon, authenticated;
grant execute on function public.retry_dead_integration_event(uuid,uuid) to service_role;
