-- Accurate order analytics are calculated from persisted orders and line items.
-- They are order value, not collected cash or profit (payment/COGS ledgers do not exist yet).
create index if not exists orders_created_status_analytics_idx
  on public.orders(created_at, status) include (total, payment_status, customer_id);

create function public.get_business_analytics(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report jsonb;
  period_length interval;
  previous_from timestamptz;
begin
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'A valid analytics time range is required.' using errcode = '22023';
  end if;
  period_length := p_to - p_from;
  if period_length > interval '366 days' then
    raise exception 'Analytics range cannot exceed 366 days.' using errcode = '22023';
  end if;
  previous_from := p_from - period_length;

  select jsonb_build_object(
    'currency', 'EGP',
    'from', p_from,
    'to', p_to,
    'previous_from', previous_from,
    'previous_to', p_from,
    'current', jsonb_build_object(
      'order_count', count(*)::integer,
      'cancelled_order_count', count(*) filter (where status = 'cancelled')::integer,
      'delivered_order_count', count(*) filter (where status = 'delivered')::integer,
      'open_order_count', count(*) filter (where status not in ('delivered','cancelled'))::integer,
      'revenue_egp', coalesce(sum(total) filter (where status <> 'cancelled'),0)::numeric(14,2),
      'delivered_value_egp', coalesce(sum(total) filter (where status = 'delivered'),0)::numeric(14,2),
      'average_order_value_egp', coalesce(avg(total) filter (where status <> 'cancelled'),0)::numeric(14,2),
      'paid_order_count', count(*) filter (where payment_status = 'paid' and status <> 'cancelled')::integer,
      'repeat_customers', (select count(*) from (select customer_id from public.orders where created_at >= p_from and created_at < p_to and status <> 'cancelled' group by customer_id having count(*) > 1) returning_customers)::integer
    ),
    'previous', (
      select jsonb_build_object(
        'order_count', count(*)::integer,
        'cancelled_order_count', count(*) filter (where status = 'cancelled')::integer,
        'delivered_order_count', count(*) filter (where status = 'delivered')::integer,
        'open_order_count', count(*) filter (where status not in ('delivered','cancelled'))::integer,
        'revenue_egp', coalesce(sum(total) filter (where status <> 'cancelled'),0)::numeric(14,2),
        'delivered_value_egp', coalesce(sum(total) filter (where status = 'delivered'),0)::numeric(14,2),
        'average_order_value_egp', coalesce(avg(total) filter (where status <> 'cancelled'),0)::numeric(14,2),
        'paid_order_count', count(*) filter (where payment_status = 'paid' and status <> 'cancelled')::integer,
        'repeat_customers', (select count(*) from (select customer_id from public.orders where created_at >= previous_from and created_at < p_from and status <> 'cancelled' group by customer_id having count(*) > 1) returning_customers)::integer
      ) from public.orders where created_at >= previous_from and created_at < p_from
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('date', day, 'orders', order_count, 'revenue_egp', revenue) order by day)
      from (
        select (created_at at time zone 'Africa/Cairo')::date as day,
          count(*)::integer as order_count,
          coalesce(sum(total) filter (where status <> 'cancelled'),0)::numeric(14,2) as revenue
        from public.orders where created_at >= p_from and created_at < p_to group by 1
      ) daily_rows
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object('product', product_name, 'category', category, 'units', units, 'revenue_egp', revenue) order by revenue desc)
      from (
        select pv.name as product_name, p.category, sum(oi.quantity)::integer as units,
          coalesce(sum(oi.quantity * oi.unit_price),0)::numeric(14,2) as revenue
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        join public.product_variants pv on pv.id = oi.product_variant_id
        join public.products p on p.id = pv.product_id
        where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
        group by pv.name,p.category order by revenue desc limit 10
      ) product_rows
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'units', units, 'revenue_egp', revenue) order by revenue desc)
      from (
        select p.category, sum(oi.quantity)::integer as units,
          coalesce(sum(oi.quantity * oi.unit_price),0)::numeric(14,2) as revenue
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        join public.product_variants pv on pv.id = oi.product_variant_id
        join public.products p on p.id = pv.product_id
        where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
        group by p.category order by revenue desc
      ) category_rows
    ), '[]'::jsonb)
  ) into report
  from public.orders where created_at >= p_from and created_at < p_to;

  return report;
end;
$$;

revoke all on function public.get_business_analytics(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.get_business_analytics(timestamptz,timestamptz) to service_role;
