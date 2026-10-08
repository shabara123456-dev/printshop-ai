-- Keep customer PII and private design work out of roles that do not need it.
-- All writes still go through the validated API; this migration only narrows
-- direct authenticated reads enforced by Supabase RLS.

drop policy if exists users_self_or_admin_read on public.users;
create policy users_self_or_admin_read on public.users
for select to authenticated
using (id = (select auth.uid()) or public.has_any_role(array['admin']::public.app_role[]));

drop policy if exists customers_self_or_staff_read on public.customers;
create policy customers_self_or_manager_sales_admin_read on public.customers
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_any_role(array['manager','sales','admin']::public.app_role[])
);

drop policy if exists design_requests_customer_or_staff_read on public.design_requests;
create policy design_requests_customer_or_operations_read on public.design_requests
for select to authenticated
using (
  public.is_customer_of(customer_id)
  or public.has_any_role(array['manager','sales','production','admin']::public.app_role[])
);

-- Campaign staff should not be able to retrieve customer-uploaded artwork.
create or replace function public.can_access_design_file(_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_any_role(array['manager','sales','production','admin']::public.app_role[])
    or exists (
      select 1 from public.design_requests d
      where public.is_customer_of(d.customer_id)
        and (d.reference_files @> jsonb_build_array(_path) or d.final_design_url = _path)
    );
$$;

revoke all on function public.can_access_design_file(text) from public, anon;
grant execute on function public.can_access_design_file(text) to authenticated;
