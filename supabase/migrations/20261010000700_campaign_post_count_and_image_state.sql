alter table public.marketing_campaigns drop constraint if exists marketing_campaigns_requested_posts_check;
alter table public.marketing_campaigns add constraint marketing_campaigns_requested_posts_check check (requested_posts between 0 and 20);

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
    0, p_created_by
  ) returning id into campaign_id;
  for post in select value from jsonb_array_elements(p_posts) loop
    insert into public.marketing_assets(campaign_id, order_id, product_id, campaign_brief, campaign_type, created_by, design_url, image_status, image_error, platform, caption, scheduled_at, status)
    values (
      campaign_id, null, nullif(post->>'product_id','')::uuid, p_campaign->>'objective', post->>'theme', p_created_by,
      nullif(post->>'design_path',''), coalesce(post->>'image_status','not_generated'), nullif(post->>'image_error',''),
      post->>'platform', post->>'caption', (post->>'scheduled_at')::timestamptz, 'pending_approval'
    ) returning id into asset_id;
    asset_ids := array_append(asset_ids, asset_id);
  end loop;
  return jsonb_build_object('campaign_id', campaign_id, 'asset_ids', to_jsonb(asset_ids));
end;
$$;
revoke all on function public.create_marketing_campaign_with_posts(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_marketing_campaign_with_posts(jsonb, jsonb, uuid) to service_role;

create or replace function public.track_marketing_campaign_post_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.campaign_id is not null then
    update public.marketing_campaigns set requested_posts = requested_posts + 1, updated_at = now() where id = new.campaign_id;
    return new;
  elsif tg_op = 'DELETE' and old.campaign_id is not null then
    update public.marketing_campaigns set requested_posts = greatest(0, requested_posts - 1), updated_at = now() where id = old.campaign_id;
    return old;
  elsif tg_op = 'UPDATE' and old.campaign_id is distinct from new.campaign_id then
    if old.campaign_id is not null then update public.marketing_campaigns set requested_posts = greatest(0, requested_posts - 1), updated_at = now() where id = old.campaign_id; end if;
    if new.campaign_id is not null then update public.marketing_campaigns set requested_posts = requested_posts + 1, updated_at = now() where id = new.campaign_id; end if;
    return new;
  end if;
  return null;
end;
$$;
revoke all on function public.track_marketing_campaign_post_count() from public, anon, authenticated;
drop trigger if exists marketing_assets_campaign_count on public.marketing_assets;
create trigger marketing_assets_campaign_count after insert or update or delete on public.marketing_assets
for each row execute function public.track_marketing_campaign_post_count();
