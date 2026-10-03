begin;
select plan(11);

select is((select count(*)::integer from public.products where sku like 'INK-%'),18,'INKORA demo catalog has 18 product families');
select is((select count(*)::integer from public.product_variants where sku like 'INK-%'),54,'INKORA demo catalog has 54 product variants');
select is((select count(*)::integer from public.customers where email like 'demo+customer%@example.invalid'),18,'demo customer fixtures are present');
select is((select count(*)::integer from public.quotes where id::text like '00000000-0000-4000-8000-%'),24,'sample quote fixtures are present');
select is((select count(*)::integer from public.orders where quote_id::text like '00000000-0000-4000-8000-%'),24,'sample order fixtures are present');
select is((select count(*)::integer from public.order_items oi join public.orders o on o.id=oi.order_id where o.quote_id::text like '00000000-0000-4000-8000-%'),24,'every sample order has a historical line snapshot');
select is((select count(*)::integer from public.production_jobs j join public.orders o on o.id=j.order_id where o.quote_id::text like '00000000-0000-4000-8000-%'),24,'every sample order has a production job');
select is((select count(*)::integer from public.materials where sku like 'DEMO-%'),8,'demo materials are present');
select is((select count(*)::integer from public.inventory_transactions where reference_type='demo_seed_opening_balance'),8,'demo opening stock is recorded in the inventory ledger');
select ok(exists(select 1 from public.suppliers where notes like 'DEMO / SEED DATA%'),'suppliers are labeled as fictional seed data');
select is((select r.unit_price from public.price_rules r join public.product_variants v on v.id=r.product_variant_id where v.sku='DEMO-STICKER-10X8' and r.quantity_min=1000 and r.quantity_max=1000 and r.material='Waterproof Vinyl' and r.active_to is null),2.10::numeric,'the owner-approved sticker unit price remains EGP 2.10');

select * from finish();
rollback;
