-- Shop-level included product image allowance. Failed jobs do not consume a credit;
-- pending jobs reserve one atomically so concurrent requests cannot exceed the limit.
create table if not exists public.product_image_generation_settings (
  id boolean primary key default true check (id = true),
  included_limit integer not null default 3 check (included_limit between 0 and 100),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.product_image_generation_settings add column if not exists updated_by uuid references public.users(id) on delete set null;
insert into public.product_image_generation_settings(id) values (true) on conflict (id) do nothing;

create table if not exists public.product_image_generations (
  id uuid primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete restrict,
  status text not null check (status in ('pending','completed','failed')),
  image_path text,
  model text,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint product_image_generation_path_valid check (image_path is null or image_path like ('products/' || product_id::text || '/%'))
);
create index if not exists product_image_generations_product_idx on public.product_image_generations(product_id, created_at desc);
alter table public.product_image_generation_settings enable row level security;
alter table public.product_image_generations enable row level security;
revoke all on public.product_image_generation_settings, public.product_image_generations from public, anon, authenticated;
grant select, insert, update on public.product_image_generation_settings, public.product_image_generations to service_role;

create or replace function public.reserve_product_image_generation(p_id uuid, p_product_id uuid, p_requested_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare allowance integer; consumed integer;
begin
  select included_limit into allowance from public.product_image_generation_settings where id = true for update;
  if allowance is null then raise exception 'image generation settings missing' using errcode = '55000'; end if;
  update public.product_image_generations set status = 'failed', completed_at = now()
   where status = 'pending' and created_at < now() - interval '10 minutes';
  select count(*)::integer into consumed from public.product_image_generations where status in ('pending','completed');
  if consumed >= allowance then raise exception 'included product image generation allowance exhausted' using errcode = '22023'; end if;
  insert into public.product_image_generations(id, product_id, requested_by, status) values (p_id, p_product_id, p_requested_by, 'pending');
end; $$;

create or replace function public.finish_product_image_generation(p_id uuid, p_status text, p_image_path text default null, p_model text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('completed','failed') then raise exception 'invalid generation status' using errcode = '22023'; end if;
  update public.product_image_generations
     set status = p_status, image_path = case when p_status = 'completed' then p_image_path else null end,
         model = p_model, completed_at = now()
   where id = p_id and status = 'pending';
  if not found then raise exception 'pending generation not found' using errcode = 'P0002'; end if;
end; $$;

create or replace function public.select_product_image_generation(p_actor_id uuid, p_product_id uuid, p_generation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_path text;
begin
  select image_path into selected_path from public.product_image_generations
   where id = p_generation_id and product_id = p_product_id and status = 'completed' for update;
  if selected_path is null then raise exception 'generated image not found' using errcode = 'P0002'; end if;
  update public.products set image_path = selected_path, updated_at = now() where id = p_product_id;
  if not found then raise exception 'product not found' using errcode = 'P0002'; end if;
  update public.product_image_generations set selected = false where product_id = p_product_id and selected;
  update public.product_image_generations set selected = true where id = p_generation_id;
end; $$;

revoke all on function public.reserve_product_image_generation(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.finish_product_image_generation(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.select_product_image_generation(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_product_image_generation(uuid,uuid,uuid) to service_role;
grant execute on function public.finish_product_image_generation(uuid,text,text,text) to service_role;
grant execute on function public.select_product_image_generation(uuid,uuid,uuid) to service_role;
