begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select extensions.plan(12);

insert into public.customers(id,name,email)
values ('61000000-0000-4000-8000-000000000001','Event Coverage Customer','event-coverage@example.invalid');

insert into public.materials(id,sku,name,category,unit,current_stock,reserved_stock,reorder_point,reorder_quantity)
values ('61000000-0000-4000-8000-000000000002','TEST-EVENT-MAT','Event Coverage Vinyl','printing','meter',20,0,5,10);
update public.materials set current_stock=4,updated_at=now() where id='61000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.integration_outbox where event_type='inventory.updated' and payload->>'material_id'='61000000-0000-4000-8000-000000000002'),1,'stock changes emit inventory.updated');
select extensions.is((select count(*)::integer from public.integration_outbox where event_type='inventory.low_stock' and payload->>'material_id'='61000000-0000-4000-8000-000000000002'),1,'crossing below threshold emits one low-stock event');
update public.materials set current_stock=3,updated_at=now() where id='61000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.integration_outbox where event_type='inventory.low_stock' and payload->>'material_id'='61000000-0000-4000-8000-000000000002'),1,'continued low stock does not repeatedly alert');
update public.materials set current_stock=12,updated_at=now() where id='61000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.integration_outbox where event_type='inventory.restocked' and payload->>'material_id'='61000000-0000-4000-8000-000000000002'),1,'crossing above threshold emits restocked event');
update public.materials set reorder_point=13,updated_at=now() where id='61000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.integration_outbox where event_type='inventory.low_stock' and payload->>'material_id'='61000000-0000-4000-8000-000000000002'),2,'raising reorder point across available stock emits low-stock event');

insert into public.products(id,sku,name,category,base_unit)
values ('61000000-0000-4000-8000-000000000003','TEST-EVENT-PRODUCT','Event Coverage Product','generic','piece');
select extensions.is((select count(*)::integer from public.integration_outbox where event_type='product.created' and payload->>'product_id'='61000000-0000-4000-8000-000000000003'),1,'product creation emits one event');
update public.products set name='Updated Event Coverage Product' where id='61000000-0000-4000-8000-000000000003';
select extensions.is((select count(*)::integer from public.integration_outbox where event_type='product.updated' and payload->>'product_id'='61000000-0000-4000-8000-000000000003'),1,'product update emits one event');

insert into public.orders(id,customer_id,status,total)
values ('61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000001','confirmed',400);
update public.orders set status='cancelled' where id='61000000-0000-4000-8000-000000000004';
select extensions.is((select count(*)::integer from public.integration_outbox where event_type='order.status_changed' and payload->>'order_id'='61000000-0000-4000-8000-000000000004'),1,'order status transition emits one event');
select extensions.is((select payload->>'to_email' from public.integration_outbox where event_type='order.status_changed' and payload->>'order_id'='61000000-0000-4000-8000-000000000004'),'event-coverage@example.invalid','order status event uses the saved customer email');
insert into public.orders(id,customer_id,status,total)
values ('61000000-0000-4000-8000-000000000006','61000000-0000-4000-8000-000000000001','confirmed',250);
update public.orders set status='ready' where id='61000000-0000-4000-8000-000000000006';
select extensions.is((select count(*)::integer from public.integration_outbox where event_type='order.status_changed' and payload->>'order_id'='61000000-0000-4000-8000-000000000006'),0,'ready transition uses its dedicated event without a duplicate status notification');

insert into public.production_jobs(id,order_id,status)
values ('61000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000004','queued');
update public.production_jobs set status='prepress' where id='61000000-0000-4000-8000-000000000005';
select extensions.is((select count(*)::integer from public.integration_outbox where event_type='production.status_changed' and payload->>'production_job_id'='61000000-0000-4000-8000-000000000005'),1,'production stage transition emits one event');
select extensions.is((select payload->>'previous_status' from public.integration_outbox where event_type='production.status_changed' and payload->>'production_job_id'='61000000-0000-4000-8000-000000000005'),'queued','production event retains the previous stage');

select not exists (select 1 from extensions.finish() as tap(result) where result like 'not ok%') as pgtap_all_passed;
rollback;
