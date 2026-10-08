-- Generic, manager-configured product choices with deterministic EGP surcharges.
create table public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  option_key text not null check (option_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label_en text not null check (length(trim(label_en)) between 1 and 80),
  label_ar text not null check (length(trim(label_ar)) between 1 and 80),
  required boolean not null default false,
  active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  unique (product_id, option_key)
);

create table public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_group_id uuid not null references public.product_option_groups(id) on delete cascade,
  value_key text not null check (value_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label_en text not null check (length(trim(label_en)) between 1 and 80),
  label_ar text not null check (length(trim(label_ar)) between 1 and 80),
  adjustment_type text not null default 'per_unit' check (adjustment_type in ('per_unit','one_time')),
  price_adjustment numeric(12,2) not null default 0 check (price_adjustment >= 0),
  active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  unique (option_group_id, value_key)
);

create index product_option_groups_product_idx on public.product_option_groups(product_id, display_order) where active;
create index product_option_values_group_idx on public.product_option_values(option_group_id, display_order) where active;
alter table public.product_option_groups enable row level security;
alter table public.product_option_values enable row level security;
revoke all on public.product_option_groups, public.product_option_values from public, anon, authenticated;
grant select, insert, update, delete on public.product_option_groups, public.product_option_values to service_role;

create function public.replace_product_options(p_actor_id uuid, p_product_id uuid, p_options jsonb, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare group_data jsonb; value_data jsonb; group_id uuid; group_order integer := 0; value_order integer; old_config jsonb;
begin
  if not exists (select 1 from public.users where id=p_actor_id and role in ('manager','admin')) then
    raise exception 'Manager permission required.' using errcode='42501';
  end if;
  if not exists (select 1 from public.products where id=p_product_id) then
    raise exception 'Product not found.' using errcode='P0002';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'A change reason is required.' using errcode='22023'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) > 30 then
    raise exception 'Options must be an array with at most 30 groups.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('key',g.option_key,'label_en',g.label_en,'label_ar',g.label_ar,'required',g.required,
    'values',(select coalesce(jsonb_agg(jsonb_build_object('key',v.value_key,'label_en',v.label_en,'label_ar',v.label_ar,'adjustment_type',v.adjustment_type,'price_adjustment',v.price_adjustment) order by v.display_order),'[]'::jsonb) from public.product_option_values v where v.option_group_id=g.id))) ,'[]'::jsonb)
    into old_config from public.product_option_groups g where g.product_id=p_product_id;
  delete from public.product_option_groups where product_id=p_product_id;
  for group_data in select value from jsonb_array_elements(p_options) loop
    if jsonb_typeof(group_data) <> 'object' or coalesce(group_data->>'key','') !~ '^[a-z][a-z0-9_]{0,39}$'
      or length(trim(coalesce(group_data->>'label_en',''))) not between 1 and 80
      or length(trim(coalesce(group_data->>'label_ar',''))) not between 1 and 80
      or jsonb_typeof(group_data->'required') <> 'boolean'
      or jsonb_typeof(group_data->'values') <> 'array'
      or jsonb_array_length(group_data->'values') < 1 or jsonb_array_length(group_data->'values') > 50 then
      raise exception 'Invalid product option group.' using errcode='22023';
    end if;
    insert into public.product_option_groups(product_id,option_key,label_en,label_ar,required,display_order)
    values (p_product_id,group_data->>'key',trim(group_data->>'label_en'),trim(group_data->>'label_ar'),(group_data->>'required')::boolean,group_order)
    returning id into group_id;
    value_order := 0;
    for value_data in select value from jsonb_array_elements(group_data->'values') loop
      if jsonb_typeof(value_data) <> 'object' or coalesce(value_data->>'key','') !~ '^[a-z][a-z0-9_]{0,39}$'
        or length(trim(coalesce(value_data->>'label_en',''))) not between 1 and 80
        or length(trim(coalesce(value_data->>'label_ar',''))) not between 1 and 80
        or coalesce(value_data->>'adjustment_type','') not in ('per_unit','one_time')
        or coalesce(value_data->>'price_adjustment','') !~ '^([0-9]{1,10})([.][0-9]{1,2})?$' then
        raise exception 'Invalid product option value.' using errcode='22023';
      end if;
      insert into public.product_option_values(option_group_id,value_key,label_en,label_ar,adjustment_type,price_adjustment,display_order)
      values (group_id,value_data->>'key',trim(value_data->>'label_en'),trim(value_data->>'label_ar'),value_data->>'adjustment_type',(value_data->>'price_adjustment')::numeric,value_order);
      value_order := value_order + 1;
    end loop;
    group_order := group_order + 1;
  end loop;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values(p_actor_id,'product.options.replaced','product',p_product_id,jsonb_build_object('before',old_config,'after',p_options,'reason',trim(p_reason)));
  insert into public.integration_outbox(event_type,payload,idempotency_key)
  values ('product.options.updated',jsonb_build_object('type','product.options.updated','product_id',p_product_id,'option_group_count',jsonb_array_length(p_options)),
    'product.options.updated:' || p_product_id::text || ':' || gen_random_uuid()::text);
  return jsonb_build_object('product_id',p_product_id,'option_groups',jsonb_array_length(p_options));
end;
$$;

revoke all on function public.replace_product_options(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.replace_product_options(uuid,uuid,jsonb,text) to service_role;
