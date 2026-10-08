-- Allow Hermes to create a manager-approved catalog draft. The API forces
-- active=false; product variants, approved prices, and stock remain separate
-- manager-controlled steps before a product can be purchased.
alter table public.hermes_action_proposals
  drop constraint if exists hermes_action_proposals_action_name_check;

alter table public.hermes_action_proposals
  add constraint hermes_action_proposals_action_name_check check (action_name in (
    'create_material','record_material_receipt','create_product_draft',
    'update_product_details','update_order_status','update_production_status'
  ));

create or replace function public.create_hermes_action_proposal(
  p_id uuid,
  p_manager_id uuid,
  p_action_name text,
  p_arguments jsonb
) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare expires timestamptz := now() + interval '10 minutes';
begin
  if not exists (select 1 from public.users where id = p_manager_id and role in ('manager','admin')) then
    raise exception 'configured Hermes actor is not an authorized manager' using errcode = '42501';
  end if;
  if p_action_name not in ('create_material','record_material_receipt','create_product_draft','update_product_details','update_order_status','update_production_status') then
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

revoke all on function public.create_hermes_action_proposal(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_hermes_action_proposal(uuid,uuid,text,jsonb) to service_role;
