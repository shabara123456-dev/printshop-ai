-- Atomically persist server-calculated quotes and their line items.
-- Only the backend service role may call this function; clients cannot choose prices.
create function public.create_quote_with_items(
  p_customer_id uuid,
  p_currency char(3),
  p_subtotal numeric,
  p_discount numeric,
  p_tax numeric,
  p_total numeric,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_quote_id uuid;
  item jsonb;
begin
  if coalesce(jsonb_typeof(p_items), '') <> 'array' then
    raise exception 'Quote must contain between 1 and 20 items.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'Quote must contain between 1 and 20 items.' using errcode = '22023';
  end if;
  if p_subtotal < 0 or p_discount < 0 or p_tax < 0 or p_total < 0 then
    raise exception 'Quote amounts must be nonnegative.' using errcode = '22023';
  end if;

  insert into public.quotes (customer_id, status, currency, subtotal, discount, tax, total)
  values (p_customer_id, 'draft', p_currency, p_subtotal, p_discount, p_tax, p_total)
  returning id into created_quote_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.quote_items (quote_id, product_variant_id, quantity, unit_price, options, design_required, notes)
    values (
      created_quote_id,
      (item ->> 'product_variant_id')::uuid,
      (item ->> 'quantity')::integer,
      (item ->> 'unit_price')::numeric,
      coalesce(item -> 'options', '{}'::jsonb),
      coalesce((item ->> 'design_required')::boolean, false),
      item ->> 'notes'
    );
  end loop;
  return created_quote_id;
end;
$$;

revoke all on function public.create_quote_with_items(uuid, char, numeric, numeric, numeric, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.create_quote_with_items(uuid, char, numeric, numeric, numeric, numeric, jsonb) to service_role;
