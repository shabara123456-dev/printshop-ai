begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.customers(id,name,email)
values ('40000000-0000-0000-0000-000000000001','Analytics Test','analytics-test@example.invalid');
insert into public.products(id,sku,name,category,base_unit,active)
values ('40000000-0000-0000-0000-000000000002','TEST-ANALYTICS','Analytics Test Product','stickers','piece',true);
insert into public.product_variants(id,product_id,sku,name,material,active)
values ('40000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000002','TEST-ANALYTICS-01','Analytics Test Product','Waterproof Vinyl',true);
insert into public.orders(id,customer_id,status,payment_status,total,created_at)
values
  ('40000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000001','delivered','paid',2100,'2026-09-15T12:00:00Z'),
  ('40000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000001','delivered','paid',1000,'2026-08-15T12:00:00Z');
insert into public.order_items(order_id,product_variant_id,quantity,unit_price)
values
  ('40000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000003',1000,2.10),
  ('40000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000003',500,2.00);

select is((public.get_business_analytics('2026-09-01','2026-10-01')->'current'->>'order_count')::integer,1,'current period order count is exact');
select is((public.get_business_analytics('2026-09-01','2026-10-01')->'current'->>'revenue_egp')::numeric,2100::numeric,'current period order value uses saved order totals');
select is((public.get_business_analytics('2026-09-01','2026-10-01')->'previous'->>'revenue_egp')::numeric,1000::numeric,'previous equal-length period is compared');
select is((public.get_business_analytics('2026-09-01','2026-10-01')->'top_products'->0->>'units')::integer,1000,'product units aggregate from order items');
select throws_ok($$select public.get_business_analytics('2026-10-01','2026-09-01')$$,'22023','A valid analytics time range is required.','inverted time range is rejected');

select * from finish();
rollback;
