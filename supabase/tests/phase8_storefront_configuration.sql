begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(8);
insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data,created_at,updated_at)
values ('71000000-0000-4000-8000-000000000001','authenticated','authenticated','storefront-manager@example.invalid','', '{"name":"Storefront Manager"}'::jsonb,now(),now());
update public.users set role='manager' where id='71000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.storefront_config_revisions where status='published'),1,'a default public storefront config exists');
select ok(not has_table_privilege('anon','public.storefront_config_revisions','select'),'anonymous users cannot inspect revision history');
select lives_ok($$select public.create_storefront_config_draft('71000000-0000-4000-8000-000000000001','{"store_name":"INKORA Test","tagline":"Test","hero_eyebrow":"TEST","hero_title_en":"Title","hero_title_ar":"عنوان","hero_description_en":"Description","hero_description_ar":"وصف","announcement_en":"","announcement_ar":"","accent_color":"#6f9fee","featured_product_ids":[]}'::jsonb)$$,'a manager can save a storefront draft');
select is((select count(*)::integer from public.storefront_config_revisions where status='draft'),1,'saved storefront change remains a draft');
select lives_ok($$select public.publish_storefront_config('71000000-0000-4000-8000-000000000001',(select id from public.storefront_config_revisions where status='draft' order by version desc limit 1))$$,'manager can publish the saved draft');
select is((select count(*)::integer from public.storefront_config_revisions where status='published'),1,'publishing keeps exactly one live revision');
select is((select count(*)::integer from public.integration_outbox where event_type='storefront.published'),1,'publishing emits an automation outbox event');
select is((select count(*)::integer from public.audit_logs where entity_type='storefront_config'),2,'draft and publish actions are audited');
select not exists (select 1 from finish() as tap(result) where result like 'not ok%') as pgtap_all_passed;
rollback;
