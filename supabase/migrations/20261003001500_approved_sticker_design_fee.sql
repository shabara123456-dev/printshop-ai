-- The manager-approved shop design service is a one-time EGP 50 fee.
-- Keep it attached only to the already-approved 1,000-piece, 10x8 cm
-- waterproof-vinyl sticker rule; customer-supplied artwork remains free.
do $$
declare
  v_old public.price_rules;
  v_new public.price_rules;
begin
  select rule.* into strict v_old
  from public.price_rules rule
  join public.product_variants variant on variant.id = rule.product_variant_id
  where variant.sku = 'DEMO-STICKER-10X8'
    and rule.quantity_min = 1000
    and rule.quantity_max = 1000
    and rule.material = 'Waterproof Vinyl'
    and rule.finishing is null
    and rule.pricing_basis = 'user_approved_market_midpoint'
    and rule.active_to is null
  for update of rule;

  if v_old.design_fee <> 50 then
    update public.price_rules
    set design_fee = 50
    where id = v_old.id
    returning * into v_new;

    insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    values (
      null,
      'price_rule.updated',
      'price_rule',
      v_new.id,
      jsonb_build_object(
        'reason', 'Manager-approved EGP 50 design service for customer-selected shop design.',
        'old', to_jsonb(v_old),
        'new', to_jsonb(v_new)
      )
    );
  end if;
end;
$$;
