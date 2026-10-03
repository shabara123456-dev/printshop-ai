-- Phase 1: core PrintShop AI schema, access helpers, indexes, and RLS.
-- Run with Supabase CLI after linking a Supabase project; never apply directly from a browser.
create extension if not exists pgcrypto;

create type public.app_role as enum ('customer', 'manager', 'sales', 'production', 'marketing', 'admin');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'rejected', 'expired');
create type public.order_status as enum ('draft', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled');
create type public.payment_status as enum ('unpaid', 'partial', 'paid', 'refunded');
create type public.production_status as enum ('queued', 'prepress', 'printing', 'finishing', 'quality_check', 'ready', 'cancelled');
create type public.design_request_status as enum ('requested', 'reviewing', 'designing', 'customer_review', 'approved', 'rejected', 'completed');
create type public.purchase_order_status as enum ('draft', 'sent', 'partially_received', 'received', 'cancelled');
create type public.inventory_transaction_type as enum ('purchase', 'consumption', 'adjustment', 'return', 'reservation', 'release');
create type public.marketing_post_status as enum ('draft', 'pending_approval', 'approved', 'scheduled', 'published', 'failed');

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  constraint users_email_lowercase check (email = lower(email))
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), user_id uuid unique references public.users(id) on delete set null,
  name text not null, company_name text, phone text, email text, address text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(), sku text not null unique, name text not null, category text not null,
  description text, base_unit text not null, active boolean not null default true,
  requires_design boolean not null default false, requires_size boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete restrict,
  sku text not null unique, name text not null, width_cm numeric(10,2), height_cm numeric(10,2), material text, finishing text,
  public_price numeric(12,2), price_type text, source_name text, source_url text, source_date date, active boolean not null default true,
  constraint product_variants_dimensions_positive check ((width_cm is null or width_cm > 0) and (height_cm is null or height_cm > 0)),
  constraint product_variants_public_price_nonnegative check (public_price is null or public_price >= 0)
);
-- Public listings are reference data, never internal cost or quote authority.
create table public.market_references (
  id uuid primary key default gen_random_uuid(), product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null, min_price numeric(12,2) not null, max_price numeric(12,2) not null,
  currency char(3) not null default 'EGP', source_name text not null, source_url text,
  source_date date, created_at timestamptz not null default now(),
  constraint market_references_quantity_positive check (quantity > 0),
  constraint market_references_valid_range check (min_price >= 0 and max_price >= min_price)
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(), name text not null, contact_name text, phone text, email text,
  address text, lead_time_days integer, notes text, active boolean not null default true,
  constraint suppliers_lead_time_nonnegative check (lead_time_days is null or lead_time_days >= 0)
);
create table public.materials (
  id uuid primary key default gen_random_uuid(), sku text not null unique, name text not null, category text not null, unit text not null,
  current_stock numeric(14,3) not null default 0, reserved_stock numeric(14,3) not null default 0,
  reorder_point numeric(14,3) not null default 0, reorder_quantity numeric(14,3) not null default 0,
  cost_per_unit numeric(12,4), supplier_id uuid references public.suppliers(id) on delete set null,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint materials_nonnegative_stock check (current_stock >= 0 and reserved_stock >= 0 and reserved_stock <= current_stock),
  constraint materials_nonnegative_reorder check (reorder_point >= 0 and reorder_quantity >= 0),
  constraint materials_nonnegative_cost check (cost_per_unit is null or cost_per_unit >= 0)
);
create table public.price_rules (
  id uuid primary key default gen_random_uuid(), product_variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity_min integer not null, quantity_max integer, material text, finishing text, unit_price numeric(12,2) not null,
  fixed_fee numeric(12,2) not null default 0, setup_fee numeric(12,2) not null default 0, design_fee numeric(12,2) not null default 0,
  installation_fee numeric(12,2) not null default 0, delivery_fee numeric(12,2) not null default 0,
  tax_rate numeric(7,5) not null default 0, active_from date not null default current_date, active_to date,
  constraint price_rules_quantity_valid check (quantity_min > 0 and (quantity_max is null or quantity_max >= quantity_min)),
  constraint price_rules_amounts_nonnegative check (unit_price >= 0 and fixed_fee >= 0 and setup_fee >= 0 and design_fee >= 0 and installation_fee >= 0 and delivery_fee >= 0),
  constraint price_rules_tax_valid check (tax_rate >= 0 and tax_rate <= 1),
  constraint price_rules_dates_valid check (active_to is null or active_to >= active_from)
);
create table public.quotes (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete restrict,
  status public.quote_status not null default 'draft', currency char(3) not null default 'EGP',
  subtotal numeric(12,2) not null default 0, discount numeric(12,2) not null default 0, tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0, valid_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint quotes_amounts_nonnegative check (subtotal >= 0 and discount >= 0 and tax >= 0 and total >= 0)
);
create table public.quote_items (
  id uuid primary key default gen_random_uuid(), quote_id uuid not null references public.quotes(id) on delete cascade,
  product_variant_id uuid not null references public.product_variants(id) on delete restrict, quantity integer not null,
  unit_price numeric(12,2) not null, options jsonb not null default '{}'::jsonb, design_required boolean not null default false, notes text,
  constraint quote_items_quantity_positive check (quantity > 0), constraint quote_items_unit_price_nonnegative check (unit_price >= 0)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete restrict,
  quote_id uuid unique references public.quotes(id) on delete set null, status public.order_status not null default 'draft',
  payment_status public.payment_status not null default 'unpaid', production_status public.production_status,
  delivery_method text, delivery_address text, due_at timestamptz, subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0, tax numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint orders_amounts_nonnegative check (subtotal >= 0 and discount >= 0 and tax >= 0 and total >= 0)
);
create table public.design_requests (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null, brief text not null, reference_files jsonb not null default '[]'::jsonb,
  design_fee numeric(12,2) not null default 0, status public.design_request_status not null default 'requested',
  assigned_to uuid references public.users(id) on delete set null, ai_draft_url text, final_design_url text,
  customer_notes text, approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint design_requests_fee_nonnegative check (design_fee >= 0)
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  product_variant_id uuid not null references public.product_variants(id) on delete restrict, quantity integer not null,
  unit_price numeric(12,2) not null, options jsonb not null default '{}'::jsonb, notes text,
  design_request_id uuid references public.design_requests(id) on delete set null,
  constraint order_items_quantity_positive check (quantity > 0), constraint order_items_unit_price_nonnegative check (unit_price >= 0)
);
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(), material_id uuid not null references public.materials(id) on delete restrict,
  transaction_type public.inventory_transaction_type not null, quantity numeric(14,3) not null, unit_cost numeric(12,4),
  reference_type text, reference_id uuid, created_at timestamptz not null default now(),
  constraint inventory_transactions_quantity_nonzero check (quantity <> 0),
  constraint inventory_transactions_cost_nonnegative check (unit_cost is null or unit_cost >= 0)
);
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(), supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status public.purchase_order_status not null default 'draft', expected_date date, total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(), constraint purchase_orders_total_nonnegative check (total >= 0)
);
create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(), purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict, quantity numeric(14,3) not null,
  unit_cost numeric(12,4) not null, constraint purchase_order_items_quantity_positive check (quantity > 0),
  constraint purchase_order_items_cost_nonnegative check (unit_cost >= 0)
);
create table public.machines (
  id uuid primary key default gen_random_uuid(), name text not null, machine_type text not null,
  capacity numeric(14,3), status text not null default 'available', location text,
  constraint machines_capacity_positive check (capacity is null or capacity > 0)
);
create table public.production_jobs (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete restrict,
  machine_id uuid references public.machines(id) on delete set null, status public.production_status not null default 'queued',
  priority integer not null default 0, scheduled_at timestamptz, started_at timestamptz, completed_at timestamptz,
  waste_quantity numeric(14,3) not null default 0, operator_id uuid references public.users(id) on delete set null, notes text,
  constraint production_jobs_waste_nonnegative check (waste_quantity >= 0)
);
create table public.marketing_assets (
  id uuid primary key default gen_random_uuid(), order_id uuid references public.orders(id) on delete set null,
  design_url text, caption text, platform text, status text not null default 'draft', created_at timestamptz not null default now()
);
create table public.marketing_posts (
  id uuid primary key default gen_random_uuid(), marketing_asset_id uuid not null references public.marketing_assets(id) on delete cascade,
  platform text not null, scheduled_at timestamptz, published_at timestamptz, external_id text,
  status public.marketing_post_status not null default 'draft', metrics jsonb not null default '{}'::jsonb
);
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(), feature text not null, model text,
  input_tokens integer not null default 0, output_tokens integer not null default 0, estimated_cost numeric(12,6) not null default 0,
  latency_ms integer, success boolean not null, created_at timestamptz not null default now(),
  constraint ai_runs_nonnegative_metrics check (input_tokens >= 0 and output_tokens >= 0 and estimated_cost >= 0 and (latency_ms is null or latency_ms >= 0))
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.users(id) on delete set null,
  action text not null, entity_type text not null, entity_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create function public.has_any_role(_roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = any (_roles));
$$;
revoke all on function public.has_any_role(public.app_role[]) from public;
grant execute on function public.has_any_role(public.app_role[]) to authenticated;
grant execute on function public.has_any_role(public.app_role[]) to anon;
create function public.is_customer_of(_customer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.customers c where c.id = _customer_id and c.user_id = (select auth.uid()));
$$;
revoke all on function public.is_customer_of(uuid) from public;
grant execute on function public.is_customer_of(uuid) to authenticated;
create function public.is_customer_of_order(_order_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders o join public.customers c on c.id = o.customer_id where o.id = _order_id and c.user_id = (select auth.uid()));
$$;
revoke all on function public.is_customer_of_order(uuid) from public;
grant execute on function public.is_customer_of_order(uuid) to authenticated;
create function public.is_customer_of_quote(_quote_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.quotes q join public.customers c on c.id = q.customer_id where q.id = _quote_id and c.user_id = (select auth.uid()));
$$;
revoke all on function public.is_customer_of_quote(uuid) from public;
grant execute on function public.is_customer_of_quote(uuid) to authenticated;
create function public.is_customer_of_design_request(_request_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.design_requests d where d.id = _request_id and public.is_customer_of(d.customer_id));
$$;
revoke all on function public.is_customer_of_design_request(uuid) from public;
grant execute on function public.is_customer_of_design_request(uuid) to authenticated;

create function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, name, role)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'name', ''), 'customer');
  insert into public.customers (user_id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), lower(new.email));
  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create index customers_user_id_idx on public.customers(user_id);
create index product_variants_product_active_idx on public.product_variants(product_id, active);
create index market_references_variant_quantity_idx on public.market_references(product_variant_id, quantity);
create index materials_active_reorder_idx on public.materials(active, reorder_point) where active;
create index price_rules_lookup_idx on public.price_rules(product_variant_id, quantity_min, quantity_max);
create index quotes_customer_created_idx on public.quotes(customer_id, created_at desc);
create index quotes_status_validity_idx on public.quotes(status, valid_until);
create index quote_items_quote_idx on public.quote_items(quote_id);
create index orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index orders_status_due_idx on public.orders(status, due_at);
create index order_items_order_idx on public.order_items(order_id);
create index design_requests_customer_status_idx on public.design_requests(customer_id, status);
create index inventory_transactions_material_created_idx on public.inventory_transactions(material_id, created_at desc);
create index purchase_orders_supplier_status_idx on public.purchase_orders(supplier_id, status);
create index purchase_order_items_order_idx on public.purchase_order_items(purchase_order_id);
create index production_jobs_status_schedule_idx on public.production_jobs(status, scheduled_at);
create index production_jobs_order_idx on public.production_jobs(order_id);
create index marketing_posts_status_schedule_idx on public.marketing_posts(status, scheduled_at);
create index ai_runs_feature_created_idx on public.ai_runs(feature, created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger materials_set_updated_at before update on public.materials for each row execute function public.set_updated_at();
create trigger quotes_set_updated_at before update on public.quotes for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger design_requests_set_updated_at before update on public.design_requests for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['users','customers','products','product_variants','market_references','suppliers','materials','price_rules','quotes','quote_items','orders','design_requests','order_items','inventory_transactions','purchase_orders','purchase_order_items','machines','production_jobs','marketing_assets','marketing_posts','ai_runs','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

create policy products_public_read on public.products for select to anon, authenticated using (active or public.has_any_role(array['manager','sales','production','marketing','admin']::public.app_role[]));
create policy variants_public_read on public.product_variants for select to anon, authenticated using (active or public.has_any_role(array['manager','sales','production','marketing','admin']::public.app_role[]));
create policy market_references_public_read on public.market_references for select to anon, authenticated using (true);
create policy price_rules_staff_read on public.price_rules for select to authenticated using (public.has_any_role(array['manager','sales','admin']::public.app_role[]));
create policy users_self_or_admin_read on public.users for select to authenticated using (id = (select auth.uid()) or public.has_any_role(array['manager','admin']::public.app_role[]));
create policy customers_self_or_staff_read on public.customers for select to authenticated using (user_id = (select auth.uid()) or public.has_any_role(array['manager','sales','production','marketing','admin']::public.app_role[]));
create policy quotes_customer_or_staff_read on public.quotes for select to authenticated using (public.is_customer_of(customer_id) or public.has_any_role(array['manager','sales','admin']::public.app_role[]));
create policy quote_items_customer_or_staff_read on public.quote_items for select to authenticated using (public.is_customer_of_quote(quote_id) or public.has_any_role(array['manager','sales','admin']::public.app_role[]));
create policy orders_customer_or_staff_read on public.orders for select to authenticated using (public.is_customer_of(customer_id) or public.has_any_role(array['manager','sales','production','admin']::public.app_role[]));
create policy order_items_customer_or_staff_read on public.order_items for select to authenticated using (public.is_customer_of_order(order_id) or public.has_any_role(array['manager','sales','production','admin']::public.app_role[]));
create policy design_requests_customer_or_staff_read on public.design_requests for select to authenticated using (public.is_customer_of(customer_id) or public.has_any_role(array['manager','sales','production','marketing','admin']::public.app_role[]));
create policy suppliers_staff_read on public.suppliers for select to authenticated using (public.has_any_role(array['manager','admin']::public.app_role[]));
create policy materials_staff_read on public.materials for select to authenticated using (public.has_any_role(array['manager','production','admin']::public.app_role[]));
create policy inventory_transactions_staff_read on public.inventory_transactions for select to authenticated using (public.has_any_role(array['manager','production','admin']::public.app_role[]));
create policy purchase_orders_staff_read on public.purchase_orders for select to authenticated using (public.has_any_role(array['manager','admin']::public.app_role[]));
create policy purchase_order_items_staff_read on public.purchase_order_items for select to authenticated using (public.has_any_role(array['manager','admin']::public.app_role[]));
create policy machines_staff_read on public.machines for select to authenticated using (public.has_any_role(array['manager','production','admin']::public.app_role[]));
create policy production_jobs_staff_read on public.production_jobs for select to authenticated using (public.has_any_role(array['manager','production','admin']::public.app_role[]));
create policy marketing_assets_staff_read on public.marketing_assets for select to authenticated using (public.has_any_role(array['manager','marketing','admin']::public.app_role[]));
create policy marketing_posts_staff_read on public.marketing_posts for select to authenticated using (public.has_any_role(array['manager','marketing','admin']::public.app_role[]));
create policy ai_runs_admin_read on public.ai_runs for select to authenticated using (public.has_any_role(array['manager','admin']::public.app_role[]));
create policy audit_logs_admin_read on public.audit_logs for select to authenticated using (public.has_any_role(array['admin']::public.app_role[]));
-- No client write policies: mutations must pass through validated server-side services.
