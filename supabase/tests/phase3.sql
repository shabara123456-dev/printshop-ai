begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into public.customers(id,name,email)
values ('30000000-0000-0000-0000-000000000001','Phase 3 Test Customer','phase3-test@example.invalid');
insert into public.products(id,sku,name,category,base_unit,active)
values ('30000000-0000-0000-0000-000000000002','TEST-P3-STICKER','Test Sticker','stickers','piece',true);
insert into public.product_variants(id,product_id,sku,name,material,active)
values ('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002','TEST-P3-STICKER-10X8','Test Sticker 10x8','Waterproof Vinyl',true);
insert into public.materials(id,sku,name,category,unit,current_stock,reserved_stock,reorder_point,reorder_quantity,active)
values ('30000000-0000-0000-0000-000000000004','TEST-P3-VINYL','Test Vinyl','vinyl','meter',30,0,5,10,true);
insert into public.product_material_requirements(product_variant_id,material_id,quantity_per_unit,waste_factor)
values ('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000004',0.01,0.10);

insert into public.quotes(id,customer_id,status,subtotal,total)
values ('30000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001','draft',2100,2100);
insert into public.quote_items(quote_id,product_variant_id,quantity,unit_price,options)
values ('30000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000003',1000,2.10,'{}');

select lives_ok($$select public.transition_quote_status('30000000-0000-0000-0000-000000000005','sent')$$,'draft quote can be sent');
select lives_ok($$select public.transition_quote_status('30000000-0000-0000-0000-000000000005','accepted')$$,'sent quote can be accepted');
select lives_ok($$select public.create_order_from_accepted_quote('30000000-0000-0000-0000-000000000005')$$,'accepted quote creates an order');
select is((select status::text from public.orders where quote_id='30000000-0000-0000-0000-000000000005'),'confirmed','new order starts confirmed');
select is((select reserved_stock::text from public.materials where id='30000000-0000-0000-0000-000000000004'),'11.000','order reserves configured material plus waste');
select throws_ok(
  $$select public.transition_production_job((select id from public.production_jobs where order_id=(select id from public.orders where quote_id='30000000-0000-0000-0000-000000000005')),'printing')$$,
  '22023','invalid production transition: queued -> printing','production cannot skip prepress'
);
select lives_ok(
  $$select public.transition_production_job((select id from public.production_jobs where order_id=(select id from public.orders where quote_id='30000000-0000-0000-0000-000000000005')),'prepress')$$,
  'queued job can enter prepress'
);
select throws_ok(
  $$select public.transition_production_job((select id from public.production_jobs where order_id=(select id from public.orders where quote_id='30000000-0000-0000-0000-000000000005')),'ready')$$,
  '22023','invalid production transition: prepress -> ready','production cannot skip the print stages'
);
select lives_ok(
  $$select public.transition_production_job((select id from public.production_jobs where order_id=(select id from public.orders where quote_id='30000000-0000-0000-0000-000000000005')),'printing')$$,
  'prepress job can enter printing'
);
select lives_ok(
  $$select public.transition_production_job((select id from public.production_jobs where order_id=(select id from public.orders where quote_id='30000000-0000-0000-0000-000000000005')),'finishing')$$,
  'printing job can enter finishing'
);
select lives_ok(
  $$select public.transition_production_job((select id from public.production_jobs where order_id=(select id from public.orders where quote_id='30000000-0000-0000-0000-000000000005')),'quality_check')$$,
  'finishing job can enter quality check'
);
select lives_ok(
  $$select public.transition_production_job((select id from public.production_jobs where order_id=(select id from public.orders where quote_id='30000000-0000-0000-0000-000000000005')),'ready')$$,
  'quality-checked job can become ready'
);
select is((select current_stock::text from public.materials where id='30000000-0000-0000-0000-000000000004'),'19.000','ready job consumes the reserved stock');
select is((select reserved_stock::text from public.materials where id='30000000-0000-0000-0000-000000000004'),'0.000','consumption clears the reservation');
select is((select status::text from public.orders where quote_id='30000000-0000-0000-0000-000000000005'),'ready','order becomes ready with its job');
select lives_ok($$select public.transition_order_status((select id from public.orders where quote_id='30000000-0000-0000-0000-000000000005'),'delivered')$$,'ready order can be delivered');
select is((select status::text from public.orders where quote_id='30000000-0000-0000-0000-000000000005'),'delivered','delivered state is stored');
select throws_ok($$select public.transition_order_status((select id from public.orders where quote_id='30000000-0000-0000-0000-000000000005'),'cancelled')$$,
  '22023','invalid order status transition: delivered -> cancelled','delivered order cannot be cancelled');
select throws_ok($$select public.reserve_inventory('30000000-0000-0000-0000-000000000004',1,(select id from public.orders where quote_id='30000000-0000-0000-0000-000000000005'))$$,
  '22023','inventory can only be reserved for active orders','delivered order cannot reserve stock');

insert into public.quotes(id,customer_id,status,subtotal,total)
values ('30000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000001','sent',2100,2100);
insert into public.quote_items(quote_id,product_variant_id,quantity,unit_price,options)
values ('30000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000003',1000,2.10,'{}');
select lives_ok($$select public.transition_quote_status('30000000-0000-0000-0000-000000000006','accepted')$$,'second quote can be accepted');
select lives_ok($$select public.create_order_from_accepted_quote('30000000-0000-0000-0000-000000000006')$$,'second accepted quote creates an order');
select is((select reserved_stock::text from public.materials where id='30000000-0000-0000-0000-000000000004'),'11.000','second order reserves stock');
select lives_ok($$select public.transition_order_status((select id from public.orders where quote_id='30000000-0000-0000-0000-000000000006'),'cancelled')$$,'active order can be cancelled');
select is((select status::text from public.orders where quote_id='30000000-0000-0000-0000-000000000006'),'cancelled','cancellation is stored');
select is((select reserved_stock::text from public.materials where id='30000000-0000-0000-0000-000000000004'),'0.000','cancellation releases stock');
select is((select status::text from public.production_jobs where order_id=(select id from public.orders where quote_id='30000000-0000-0000-0000-000000000006')),'cancelled','cancellation stops the queued job');

insert into public.quotes(id,customer_id,status,subtotal,total)
values ('30000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000001','sent',4200,4200);
insert into public.quote_items(quote_id,product_variant_id,quantity,unit_price,options)
values ('30000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000003',2000,2.10,'{}');
select lives_ok($$select public.transition_quote_status('30000000-0000-0000-0000-000000000007','accepted')$$,'third quote can be accepted');
select throws_ok($$select public.create_order_from_accepted_quote('30000000-0000-0000-0000-000000000007')$$,
  '23514','insufficient available stock','order creation rejects insufficient stock');
select is((select count(*)::integer from public.orders where quote_id='30000000-0000-0000-0000-000000000007'),0,'failed reservation leaves no partial order');

select * from finish();
rollback;
