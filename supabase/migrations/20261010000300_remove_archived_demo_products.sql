-- Remove archived, seeded catalog samples so the shop starts with the owner's
-- actual catalog. Real manager-created products and materials are preserved.
begin;

delete from public.product_material_requirements pmr
using public.product_variants v, public.products p
where pmr.product_variant_id = v.id and v.product_id = p.id
  and (p.demo_only = true or p.sku = 'DEMO-STICKER');

delete from public.product_option_groups g
using public.products p
where g.product_id = p.id and (p.demo_only = true or p.sku = 'DEMO-STICKER');

delete from public.product_image_generations ig
using public.products p
where ig.product_id = p.id and (p.demo_only = true or p.sku = 'DEMO-STICKER');

delete from public.price_rules pr
using public.product_variants v, public.products p
where pr.product_variant_id = v.id and v.product_id = p.id
  and (p.demo_only = true or p.sku = 'DEMO-STICKER');

delete from public.market_references mr
using public.product_variants v, public.products p
where mr.product_variant_id = v.id and v.product_id = p.id
  and (p.demo_only = true or p.sku = 'DEMO-STICKER');

delete from public.product_variants v
using public.products p
where v.product_id = p.id and (p.demo_only = true or p.sku = 'DEMO-STICKER');

delete from public.products where demo_only = true or sku = 'DEMO-STICKER';

commit;
