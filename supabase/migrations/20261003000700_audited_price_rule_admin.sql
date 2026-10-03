-- Manager-only, transactional price rule writes with an immutable audit snapshot.
create function public.create_approved_price_rule(p_actor_id uuid, p_rule jsonb, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.price_rules;
begin
  if not exists (
    select 1 from public.users
    where id = p_actor_id and role in ('manager'::public.app_role, 'admin'::public.app_role)
  ) then
    raise exception 'Manager permission required.' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'A short price rule reason is required.' using errcode = '22023';
  end if;
  insert into public.price_rules (
    product_variant_id, quantity_min, quantity_max, material, finishing, unit_price,
    fixed_fee, setup_fee, design_fee, installation_fee, delivery_fee, tax_rate, active_from
  ) values (
    (p_rule->>'product_variant_id')::uuid, (p_rule->>'quantity_min')::integer,
    nullif(p_rule->>'quantity_max','')::integer, nullif(p_rule->>'material',''), nullif(p_rule->>'finishing',''),
    (p_rule->>'unit_price')::numeric, coalesce(nullif(p_rule->>'fixed_fee','')::numeric,0),
    coalesce(nullif(p_rule->>'setup_fee','')::numeric,0), coalesce(nullif(p_rule->>'design_fee','')::numeric,0),
    coalesce(nullif(p_rule->>'installation_fee','')::numeric,0), coalesce(nullif(p_rule->>'delivery_fee','')::numeric,0),
    coalesce(nullif(p_rule->>'tax_rate','')::numeric,0), coalesce(nullif(p_rule->>'active_from','')::date,current_date)
  ) returning * into v_rule;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'price_rule.created', 'price_rule', v_rule.id,
    jsonb_build_object('reason', trim(p_reason), 'new', to_jsonb(v_rule)));
  return v_rule.id;
end;
$$;

create function public.end_approved_price_rule(p_actor_id uuid, p_rule_id uuid, p_active_to date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.price_rules;
  v_new public.price_rules;
begin
  if not exists (
    select 1 from public.users
    where id = p_actor_id and role in ('manager'::public.app_role, 'admin'::public.app_role)
  ) then
    raise exception 'Manager permission required.' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'A short price rule reason is required.' using errcode = '22023';
  end if;
  select * into v_old from public.price_rules where id = p_rule_id for update;
  if not found then raise exception 'Price rule not found.' using errcode = 'P0002'; end if;
  if p_active_to < v_old.active_from then
    raise exception 'End date cannot be before the rule start date.' using errcode = '22023';
  end if;
  update public.price_rules set active_to = p_active_to where id = p_rule_id returning * into v_new;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'price_rule.ended', 'price_rule', p_rule_id,
    jsonb_build_object('reason', trim(p_reason), 'old', to_jsonb(v_old), 'new', to_jsonb(v_new)));
end;
$$;

revoke all on function public.create_approved_price_rule(uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.end_approved_price_rule(uuid,uuid,date,text) from public, anon, authenticated;
grant execute on function public.create_approved_price_rule(uuid,jsonb,text) to service_role;
grant execute on function public.end_approved_price_rule(uuid,uuid,date,text) to service_role;
