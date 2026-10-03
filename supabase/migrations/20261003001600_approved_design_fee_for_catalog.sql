-- Manager-approved EGP 50 shop design service across the customer catalog.
-- Preserve the established product prices and apply only to live rules for
-- products explicitly marked as supporting design.
do $$
declare
  v_changed integer;
begin
  with changed as (
    update public.price_rules rule
    set design_fee = 50
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where rule.product_variant_id = variant.id
      and product.requires_design = true
      and rule.active_to is null
      and rule.design_fee is distinct from 50
    returning rule.id, rule.product_variant_id, rule.design_fee
  )
  select count(*) into v_changed from changed;

  if v_changed > 0 then
    insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    values (
      null,
      'price_rule.design_fee_catalog_updated',
      'price_rule',
      null,
      jsonb_build_object(
        'reason', 'Manager-approved fixed EGP 50 shop-design fee applied to active rules for products supporting shop design.',
        'updated_rule_count', v_changed,
        'design_fee_egp', 50
      )
    );
  end if;
end;
$$;
