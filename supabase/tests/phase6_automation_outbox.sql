begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.customers(id,name,email)
values ('60000000-0000-4000-8000-000000000001','Outbox Test Customer','outbox-test@example.invalid');
insert into public.orders(id,customer_id,status,total)
values ('60000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','confirmed',123.45);
select is((select count(*)::integer from public.integration_outbox where idempotency_key='order.created:60000000-0000-4000-8000-000000000002'),1,'order insert writes one durable outbox event');
select is((select payload->>'to_email' from public.integration_outbox where idempotency_key='order.created:60000000-0000-4000-8000-000000000002'),'outbox-test@example.invalid','order event is addressed to the saved customer email');

insert into public.production_jobs(id,order_id,status)
values ('60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000002','quality_check');
update public.production_jobs set status='ready' where id='60000000-0000-4000-8000-000000000003';
select is((select count(*)::integer from public.integration_outbox where idempotency_key='order.ready:60000000-0000-4000-8000-000000000003'),1,'production ready transition writes one durable event');

insert into public.marketing_assets(id,caption,platform,status)
values ('60000000-0000-4000-8000-000000000004','Approved campaign','instagram','pending_approval');
update public.marketing_assets set status='approved' where id='60000000-0000-4000-8000-000000000004';
select is((select count(*)::integer from public.integration_outbox where idempotency_key='marketing.approved:60000000-0000-4000-8000-000000000004'),1,'marketing approval writes one durable event');

select is((select count(*)::integer from public.claim_integration_events(10)),3,'worker can atomically claim the pending events');
select is((select count(*)::integer from public.integration_outbox where status='processing'),3,'claimed events have processing leases');
select lives_ok($$select public.complete_integration_event((select id from public.integration_outbox where event_type='order.created'))$$,'worker can acknowledge a delivered event');
select is((select status from public.integration_outbox where event_type='order.created'),'delivered','acknowledgement marks the event delivered');

select not exists (select 1 from finish() as tap(result) where result like 'not ok%') as pgtap_all_passed;
rollback;
