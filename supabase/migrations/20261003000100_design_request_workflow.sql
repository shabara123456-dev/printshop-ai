-- Design requests move through an explicit review/approval state machine.
create function public.transition_design_request_status(
  p_request_id uuid,
  p_new_status public.design_request_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.design_request_status;
  allowed boolean := false;
begin
  select status into current_status
  from public.design_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'design request not found' using errcode = 'P0002';
  end if;

  allowed :=
    (current_status = 'requested' and p_new_status = 'reviewing') or
    (current_status = 'reviewing' and p_new_status = 'designing') or
    (current_status = 'designing' and p_new_status = 'customer_review') or
    (current_status = 'customer_review' and p_new_status in ('approved', 'rejected')) or
    (current_status = 'approved' and p_new_status = 'completed');

  if not allowed then
    raise exception 'invalid design request transition: % -> %', current_status, p_new_status
      using errcode = '22023';
  end if;

  update public.design_requests
  set status = p_new_status,
      approved_at = case when p_new_status = 'approved' then now() else approved_at end,
      updated_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.transition_design_request_status(uuid, public.design_request_status)
  from public, anon, authenticated;
grant execute on function public.transition_design_request_status(uuid, public.design_request_status)
  to service_role;
