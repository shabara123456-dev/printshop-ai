begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(6);
insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data,created_at,updated_at)
values ('73000000-0000-4000-8000-000000000001','authenticated','authenticated','options-manager@example.invalid','', '{"name":"Options Manager"}'::jsonb,now(),now());
update public.users set role='manager' where id='73000000-0000-4000-8000-000000000001';
insert into public.products(id,sku,name,category,base_unit)
values ('73000000-0000-4000-8000-000000000002','TEST-GENERIC-OPTIONS','Generic option test','generic','piece');
select throws_ok($$select public.replace_product_options('73000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000002','[]'::jsonb,'unauthorized')$$,'42501',null,'non-manager cannot change product option prices');
select lives_ok($$select public.replace_product_options('73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','[{"key":"color","label_en":"Color","label_ar":"اللون","required":true,"values":[{"key":"black","label_en":"Black","label_ar":"أسود","adjustment_type":"one_time","price_adjustment":"25.00"}]}]'::jsonb,'Manager approved color surcharge')$$,'manager can save validated configurable options');
select is((select count(*)::integer from public.product_option_groups where product_id='73000000-0000-4000-8000-000000000002'),1,'option group persisted for the product');
select is((select price_adjustment from public.product_option_values where option_group_id=(select id from public.product_option_groups where product_id='73000000-0000-4000-8000-000000000002'))::numeric,25.00::numeric,'approved option surcharge stored as fixed decimal');
select is((select count(*)::integer from public.audit_logs where entity_type='product' and entity_id='73000000-0000-4000-8000-000000000002' and metadata->>'reason'='Manager approved color surcharge'),1,'option change includes approval reason in audit record');
select is((select count(*)::integer from public.integration_outbox where event_type='product.options.updated' and payload->>'product_id'='73000000-0000-4000-8000-000000000002'),1,'option changes enqueue a deduplicable n8n event');
select not exists (select 1 from finish() as tap(result) where result like 'not ok%') as pgtap_all_passed;
rollback;
