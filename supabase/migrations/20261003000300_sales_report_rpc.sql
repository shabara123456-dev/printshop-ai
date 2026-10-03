-- Aggregate order values in the database so Hermes never reports a truncated page of orders.
-- These are order sales, not cash collected; payment transaction detail is not modeled yet.
create function public.get_sales_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report jsonb;
begin
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'A valid report time range is required.' using errcode = '22023';
  end if;
  if p_to - p_from > interval '366 days' then
    raise exception 'Sales report range cannot exceed 366 days.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'currency', 'EGP',
    'from', p_from,
    'to', p_to,
    'order_count', count(*),
    'cancelled_order_count', count(*) filter (where status = 'cancelled'),
    'delivered_order_count', count(*) filter (where status = 'delivered'),
    'open_order_count', count(*) filter (where status not in ('delivered', 'cancelled')),
    'order_value_egp', coalesce(sum(total) filter (where status <> 'cancelled'), 0)::numeric(14,2),
    'delivered_value_egp', coalesce(sum(total) filter (where status = 'delivered'), 0)::numeric(14,2),
    'fully_paid_order_count', count(*) filter (where payment_status = 'paid' and status <> 'cancelled')
  )
  into report
  from public.orders
  where created_at >= p_from and created_at < p_to;

  return report;
end;
$$;

revoke all on function public.get_sales_report(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_sales_report(timestamptz, timestamptz) to service_role;

-- Hermes may route through providers whose pricing is not known to this backend.
alter table public.ai_runs alter column estimated_cost drop not null;
