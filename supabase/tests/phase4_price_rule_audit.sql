begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data,created_at,updated_at)
values
  ('50000000-0000-4000-8000-000000000001','authenticated','authenticated','price-manager@example.invalid','', '{"name":"Price Manager"}'::jsonb,now(),now()),
  ('50000000-0000-4000-8000-000000000002','authenticated','authenticated','price-customer@example.invalid','', '{"name":"Price Customer"}'::jsonb,now(),now());
update public.users set role='manager' where id='50000000-0000-4000-8000-000000000001';
insert into public.products(id,sku,name,category,base_unit,active)
values ('50000000-0000-4000-8000-000000000003','TEST-AUDIT-STICKER','Audit Test Sticker','stickers','piece',true);
insert into public.product_variants(id,product_id,sku,name,material,active)
values ('50000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000003','TEST-AUDIT-STICKER-01','Audit Test Sticker','Waterproof Vinyl',true);

select set_config('test.audit_rule_id', public.create_approved_price_rule(
  '50000000-0000-4000-8000-000000000001',
  '{"product_variant_id":"50000000-0000-4000-8000-000000000004","quantity_min":1000,"unit_price":2.10,"active_from":"2026-10-03"}'::jsonb,
  'Manager-approved test price'
)::text, true);
select is((select user_id from public.audit_logs where entity_type='price_rule' and entity_id=current_setting('test.audit_rule_id')::uuid and action='price_rule.created'),'50000000-0000-4000-8000-000000000001'::uuid,'new price rules record the approving manager');
select is((select metadata->>'reason' from public.audit_logs where entity_id=current_setting('test.audit_rule_id')::uuid and action='price_rule.created'),'Manager-approved test price','new price rules preserve the approval reason');
select lives_ok($$select public.end_approved_price_rule('50000000-0000-4000-8000-000000000001',current_setting('test.audit_rule_id')::uuid,'2026-10-31','Replacing with an updated price')$$,'manager can end a price rule with a reason');
select is((select active_to::text from public.price_rules where id=current_setting('test.audit_rule_id')::uuid),'2026-10-31','price rule effective end is stored');
select ok((select metadata ? 'old' and metadata ? 'new' and metadata->'new'->>'active_to'='2026-10-31' from public.audit_logs where entity_id=current_setting('test.audit_rule_id')::uuid and action='price_rule.ended'),'price rule end audit retains before and after snapshots');
select throws_ok($$select public.create_approved_price_rule('50000000-0000-4000-8000-000000000002','{"product_variant_id":"50000000-0000-4000-8000-000000000004","quantity_min":1000,"unit_price":2.10}'::jsonb,'Customer attempt')$$,'42501','Manager permission required.','customer cannot write an approved price rule');

select * from finish();
rollback;
