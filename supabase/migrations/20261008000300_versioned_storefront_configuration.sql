-- Versioned, constrained storefront settings. Managers publish curated JSON
-- configuration; the frontend never accepts executable code or raw CSS.
create sequence public.storefront_config_version_seq start with 2;

create table public.storefront_config_revisions (
  id uuid primary key default gen_random_uuid(),
  version bigint not null unique,
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index storefront_single_published_revision_idx
  on public.storefront_config_revisions(status) where status = 'published';
create index storefront_drafts_recent_idx
  on public.storefront_config_revisions(created_at desc) where status = 'draft';
alter table public.storefront_config_revisions enable row level security;
revoke all on public.storefront_config_revisions from public, anon, authenticated;
grant select, insert, update on public.storefront_config_revisions to service_role;
grant usage, select on sequence public.storefront_config_version_seq to service_role;

insert into public.storefront_config_revisions(version,config,status,published_at)
values (1, jsonb_build_object(
  'store_name','INKORA',
  'tagline','Create. Print. Grow.',
  'hero_eyebrow','MANSOURA PRINT STUDIO · INKORA',
  'hero_title_en','Make your next idea tangible.',
  'hero_title_ar','أفكارك، مطبوعة بعناية.',
  'hero_description_en','Thoughtful print for ambitious brands. Configure a product and follow every production step from our Mansoura shop.',
  'hero_description_ar','طباعة مخصصة، تصميم مدروس، ومتابعة واضحة من أول طلب حتى التسليم.',
  'announcement_en','',
  'announcement_ar','',
  'accent_color','#6f9fee',
  'featured_product_ids','[]'::jsonb
), 'published', now());

create function public.create_storefront_config_draft(p_actor_id uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare revision_id uuid := gen_random_uuid(); revision_version bigint;
begin
  if not exists (select 1 from public.users where id = p_actor_id and role in ('manager','admin')) then
    raise exception 'Manager permission required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_config) <> 'object' then raise exception 'Storefront config must be an object.' using errcode = '22023'; end if;
  revision_version := nextval('public.storefront_config_version_seq');
  insert into public.storefront_config_revisions(id,version,config,status,created_by)
  values (revision_id,revision_version,p_config,'draft',p_actor_id);
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values (p_actor_id,'storefront.config.draft_created','storefront_config',revision_id,
    jsonb_build_object('version',revision_version,'config',p_config));
  return jsonb_build_object('id',revision_id,'version',revision_version,'status','draft');
end;
$$;

create function public.publish_storefront_config(p_actor_id uuid, p_revision_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare revision public.storefront_config_revisions%rowtype;
begin
  if not exists (select 1 from public.users where id = p_actor_id and role in ('manager','admin')) then
    raise exception 'Manager permission required.' using errcode = '42501';
  end if;
  select * into revision from public.storefront_config_revisions where id = p_revision_id for update;
  if not found or revision.status <> 'draft' then raise exception 'Storefront draft not found or already published.' using errcode = 'P0002'; end if;
  update public.storefront_config_revisions set status = 'archived' where status = 'published';
  update public.storefront_config_revisions set status = 'published', published_at = now() where id = p_revision_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values (p_actor_id,'storefront.config.published','storefront_config',p_revision_id,
    jsonb_build_object('version',revision.version,'previous_version',(select max(version) from public.storefront_config_revisions where status='archived')));
  insert into public.integration_outbox(event_type,payload,idempotency_key)
  values ('storefront.published',jsonb_build_object(
    'type','storefront.published','config_id',p_revision_id,'version',revision.version
  ),'storefront.published:' || p_revision_id::text)
  on conflict (idempotency_key) do nothing;
  return jsonb_build_object('id',p_revision_id,'version',revision.version,'status','published');
end;
$$;

revoke all on function public.create_storefront_config_draft(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.publish_storefront_config(uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_storefront_config_draft(uuid,jsonb) to service_role;
grant execute on function public.publish_storefront_config(uuid,uuid) to service_role;
