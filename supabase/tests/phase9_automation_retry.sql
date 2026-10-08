
begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(5);
insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data,created_at,updated_at)
values ('72000000-0000-4000-8000-000000000001','authenticated','authenticated','automation-manager@example.invalid','', '{"name":"Automation Manager"}'::jsonb,now(),now());
update public.users set role='manager' where id='72000000-0000-4000-8000-000000000001';
insert into public.integration_outbox(id,event_type,payload,idempotency_key,status,attempt_count,last_error)
values ('72000000-0000-4000-8000-000000000002','order.created','{}'::jsonb,'test:phase9:retry','dead',10,'temporary failure');
select throws_ok($$select public.retry_dead_integration_event('72000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000002')$$,'42501',null,'non-manager cannot retry dead events');
select is(public.retry_dead_integration_event('72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002'),true,'manager can replay a dead event');
select is((select status from public.integration_outbox where id='72000000-0000-4000-8000-000000000002'),'pending','replayed event returns to pending queue');
select is((select attempt_count from public.integration_outbox where id='72000000-0000-4000-8000-000000000002'),0,'new delivery attempt counter resets');
select is((select count(*)::integer from public.audit_logs where entity_type='integration_outbox' and entity_id='72000000-0000-4000-8000-000000000002'),1,'replay writes an audit entry');
select not exists (select 1 from finish() as tap(result) where result like 'not ok%') as pgtap_all_passed;
rollback;
