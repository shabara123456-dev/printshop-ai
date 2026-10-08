begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select extensions.plan(9);

select extensions.is((select count(*)::integer from public.commerce_verticals where active),6,'printing and five additional store verticals are registered');
select extensions.is((select count(*)::integer from public.products where vertical_key='printing'),(select count(*)::integer from public.products),'legacy products retain the printing default');
select extensions.is((select (capabilities->>'requires_material_requirements')::boolean from public.commerce_verticals where vertical_key='printing'),true,'printing requires production material configuration');
select extensions.is((select (capabilities->>'requires_material_requirements')::boolean from public.commerce_verticals where vertical_key='electronics'),false,'electronics does not require printing material configuration');

insert into public.customers(id,name,email)
values ('62000000-0000-4000-8000-000000000001','Vertical Flow Customer','vertical-flow@example.invalid');
insert into public.products(id,sku,name,category,base_unit,vertical_key,attributes)
values ('62000000-0000-4000-8000-000000000002','TEST-ELECTRONICS-PHONE','Demo Smartphone','mobile','piece','electronics','{"brand":"Demo","specifications":{"storage_gb":256}}');
insert into public.product_variants(id,product_id,sku,name,available_quantity,attributes)
values ('62000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000002','TEST-ELECTRONICS-PHONE-256','256 GB',5,'{"color":"black","warranty_months":12}');
insert into public.quotes(id,customer_id,status,subtotal,total)
values ('62000000-0000-4000-8000-000000000004','62000000-0000-4000-8000-000000000001','accepted',1000,1000);
insert into public.quote_items(quote_id,product_variant_id,quantity,unit_price)
values ('62000000-0000-4000-8000-000000000004','62000000-0000-4000-8000-000000000003',2,500);

select public.create_order_from_accepted_quote('62000000-0000-4000-8000-000000000004','pickup','Store pickup: Samia El-Gamal, Mansoura, Dakahlia',null) is not null as created_nonproduction_order;
select extensions.is((select production_status::text from public.orders where quote_id='62000000-0000-4000-8000-000000000004'),null,'non-production order has no fake production status');
select extensions.is((select count(*)::integer from public.production_jobs pj join public.orders o on o.id=pj.order_id where o.quote_id='62000000-0000-4000-8000-000000000004'),0,'non-production order does not create a production job');
select extensions.is((select available_quantity from public.product_variants where id='62000000-0000-4000-8000-000000000003'),3,'variant availability is reserved transactionally at order creation');
select public.transition_order_status((select id from public.orders where quote_id='62000000-0000-4000-8000-000000000004'),'ready'::public.order_status);
select public.transition_order_status((select id from public.orders where quote_id='62000000-0000-4000-8000-000000000004'),'delivered'::public.order_status);
select extensions.is((select status::text from public.orders where quote_id='62000000-0000-4000-8000-000000000004'),'delivered','non-production order can move through ready to delivered');
select extensions.is((select count(*)::integer from public.integration_outbox where event_type='order.ready' and payload->>'order_id'=(select id::text from public.orders where quote_id='62000000-0000-4000-8000-000000000004')),1,'direct ready transition emits exactly one ready event');

select not exists (select 1 from extensions.finish() as tap(result) where result like 'not ok%') as pgtap_all_passed;
rollback;
