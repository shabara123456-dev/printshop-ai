begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data,created_at,updated_at)
values
  ('70000000-0000-4000-8000-000000000001','authenticated','authenticated','hermes-manager@example.invalid','', '{"name":"Hermes Manager"}'::jsonb,now(),now()),
  ('70000000-0000-4000-8000-000000000002','authenticated','authenticated','hermes-customer@example.invalid','', '{"name":"Hermes Customer"}'::jsonb,now(),now());
update public.users set role='manager' where id='70000000-0000-4000-8000-000000000001';

select lives_ok($$select public.create_hermes_action_proposal(
  '70000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000001',
  'update_product_details',
  '{"product_id":"70000000-0000-4000-8000-000000000004","active":false,"reason":"Manager requested hide"}'::jsonb
)$$,'manager can create a durable action proposal');
select is((select status from public.hermes_action_proposals where id='70000000-0000-4000-8000-000000000003'),'pending','new proposal is pending');
select is(public.approve_hermes_action_proposal('70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000002'),false,'another user cannot approve the proposal');
select is(public.approve_hermes_action_proposal('70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001'),true,'owner manager can approve the proposal');
select is(public.claim_hermes_action_proposal(
  '70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','update_product_details',
  '{"product_id":"70000000-0000-4000-8000-000000000004","active":true,"reason":"Manager requested hide"}'::jsonb
),false,'changed action arguments cannot execute');
select is(public.claim_hermes_action_proposal(
  '70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','update_product_details',
  '{"product_id":"70000000-0000-4000-8000-000000000004","active":false,"reason":"Manager requested hide"}'::jsonb
),true,'exact approved action can be claimed');
select is(public.claim_hermes_action_proposal(
  '70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','update_product_details',
  '{"product_id":"70000000-0000-4000-8000-000000000004","active":false,"reason":"Manager requested hide"}'::jsonb
),false,'action claim is single-use');
select lives_ok($$select public.finish_hermes_action_proposal('70000000-0000-4000-8000-000000000003','completed','{"product_id":"70000000-0000-4000-8000-000000000004","changes":{"active":false}}'::jsonb)$$,'completed result is persisted');
select is((select status from public.hermes_action_proposals where id='70000000-0000-4000-8000-000000000003'),'completed','proposal finishes in completed state');
select is((select count(*)::integer from public.audit_logs where entity_type='hermes_action' and entity_id='70000000-0000-4000-8000-000000000003'),4,'proposal lifecycle writes proposal, approval, start, and completion audit records');
select ok(not has_table_privilege('anon','public.hermes_action_proposals','select'),'anonymous users cannot read manager proposals');

select not exists (select 1 from finish() as tap(result) where result like 'not ok%') as pgtap_all_passed;
rollback;
