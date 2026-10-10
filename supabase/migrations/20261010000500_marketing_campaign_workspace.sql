create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  month date not null,
  objective text not null default '',
  target_audience text not null default '',
  language text not null default 'en' check (language in ('en','ar')),
  tone text not null default '',
  posting_frequency text not null default 'weekly',
  preferred_times text[] not null default array['10:00'],
  platforms text[] not null default array['instagram'],
  product_ids uuid[] not null default '{}',
  requested_posts integer not null check (requested_posts between 1 and 20),
  status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketing_assets
  add column if not exists campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  add column if not exists image_status text not null default 'not_generated'
    check (image_status in ('not_generated','processing','generated','failed')),
  add column if not exists image_error text;

create index if not exists marketing_assets_campaign_idx on public.marketing_assets(campaign_id, created_at);
create index if not exists marketing_campaigns_month_idx on public.marketing_campaigns(month desc, created_at desc);

alter type public.marketing_post_status add value if not exists 'cancelled';

alter table public.marketing_campaigns enable row level security;
create policy marketing_campaigns_staff_read on public.marketing_campaigns
  for select to authenticated
  using (public.has_any_role(array['manager','marketing','admin']::public.app_role[]));

comment on table public.marketing_campaigns is 'Manager-created marketing campaigns. Publishing remains external and must be confirmed by a platform adapter.';

create or replace function public.create_marketing_campaign_with_posts(p_campaign jsonb, p_posts jsonb, p_created_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_id uuid;
  post jsonb;
  asset_ids uuid[] := '{}'::uuid[];
  asset_id uuid;
begin
  if jsonb_typeof(p_posts) <> 'array' or jsonb_array_length(p_posts) < 1 or jsonb_array_length(p_posts) > 20 then
    raise exception 'invalid marketing campaign post list' using errcode = '22023';
  end if;
  insert into public.marketing_campaigns(name, month, objective, target_audience, language, tone, posting_frequency, preferred_times, platforms, product_ids, requested_posts, created_by)
  values (
    p_campaign->>'name', (p_campaign->>'month')::date, p_campaign->>'objective', p_campaign->>'target_audience',
    p_campaign->>'language', p_campaign->>'tone', p_campaign->>'posting_frequency',
    array(select jsonb_array_elements_text(p_campaign->'preferred_times')),
    array(select jsonb_array_elements_text(p_campaign->'platforms')),
    array(select jsonb_array_elements_text(p_campaign->'product_ids')),
    jsonb_array_length(p_posts), p_created_by
  ) returning id into campaign_id;
  for post in select value from jsonb_array_elements(p_posts) loop
    insert into public.marketing_assets(campaign_id, order_id, product_id, campaign_brief, campaign_type, created_by, design_url, image_status, platform, caption, scheduled_at, status)
    values (campaign_id, null, nullif(post->>'product_id','')::uuid, p_campaign->>'objective', post->>'theme', p_created_by, null, 'not_generated', post->>'platform', post->>'caption', (post->>'scheduled_at')::timestamptz, 'pending_approval')
    returning id into asset_id;
    asset_ids := array_append(asset_ids, asset_id);
  end loop;
  return jsonb_build_object('campaign_id', campaign_id, 'asset_ids', to_jsonb(asset_ids));
end;
$$;

revoke all on function public.create_marketing_campaign_with_posts(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_marketing_campaign_with_posts(jsonb, jsonb, uuid) to service_role;

create or replace function public.update_marketing_campaign_draft(p_asset_id uuid, p_caption text, p_scheduled_at timestamptz, p_platform text, p_product_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_row public.marketing_assets%rowtype;
begin
  select * into asset_row from public.marketing_assets where id = p_asset_id and order_id is null for update;
  if not found or asset_row.status not in ('pending_approval','approved') then return false; end if;
  if asset_row.status = 'approved' and not exists (select 1 from public.marketing_posts where marketing_asset_id = p_asset_id and status = 'approved') then return false; end if;
  update public.marketing_assets set caption = p_caption, scheduled_at = p_scheduled_at, platform = p_platform, product_id = p_product_id where id = p_asset_id;
  update public.marketing_posts set scheduled_at = p_scheduled_at, platform = p_platform where marketing_asset_id = p_asset_id and status = 'approved';
  return true;
end;
$$;
revoke all on function public.update_marketing_campaign_draft(uuid, text, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.update_marketing_campaign_draft(uuid, text, timestamptz, text, uuid) to service_role;

create or replace function public.set_marketing_asset_status(p_asset_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_row public.marketing_assets%rowtype;
begin
  if p_new_status not in ('approved', 'rejected') then
    raise exception 'invalid marketing asset status' using errcode = '22023';
  end if;
  select * into asset_row from public.marketing_assets where id = p_asset_id for update;
  if not found then raise exception 'marketing asset not found' using errcode = 'P0002'; end if;
  if asset_row.status = 'pending_approval' then
    update public.marketing_assets set status = p_new_status where id = p_asset_id;
    if p_new_status = 'approved' then
      insert into public.marketing_posts (marketing_asset_id, platform, scheduled_at, status)
      values (p_asset_id, coalesce(asset_row.platform, 'general'), asset_row.scheduled_at, 'approved');
    end if;
    return;
  end if;
  if p_new_status = 'rejected' and asset_row.status = 'approved' then
    update public.marketing_posts set status = 'cancelled' where marketing_asset_id = p_asset_id and status in ('approved','scheduled','pending_approval');
    if exists (select 1 from public.marketing_posts where marketing_asset_id = p_asset_id and status = 'published') then
      raise exception 'published marketing post cannot be cancelled' using errcode = '22023';
    end if;
    update public.marketing_assets set status = 'rejected' where id = p_asset_id;
    return;
  end if;
  raise exception 'marketing asset is not in a changeable state' using errcode = '22023';
end;
$$;
revoke all on function public.set_marketing_asset_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_marketing_asset_status(uuid, text) to service_role;
