-- Add manager-controlled product uploads and storefront media without changing
-- existing order snapshots, quote rules, or the production material ledger.
alter table public.products
  add column if not exists allow_customer_design_upload boolean not null default false,
  add column if not exists material_description text not null default '',
  add column if not exists image_path text not null default '';

create index if not exists products_customer_upload_idx
  on public.products(allow_customer_design_upload) where active = true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('storefront-assets','storefront-assets',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storefront_assets_public_read on storage.objects;
create policy storefront_assets_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'storefront-assets');
drop policy if exists storefront_assets_manager_insert on storage.objects;
create policy storefront_assets_manager_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'storefront-assets'
    and (storage.foldername(name))[1] in ('products','storefront')
    and public.has_any_role(array['manager','admin']::public.app_role[])
  );
drop policy if exists storefront_assets_manager_update on storage.objects;
create policy storefront_assets_manager_update on storage.objects
  for update to authenticated using (
    bucket_id = 'storefront-assets'
    and (storage.foldername(name))[1] in ('products','storefront')
    and public.has_any_role(array['manager','admin']::public.app_role[])
  ) with check (
    bucket_id = 'storefront-assets'
    and (storage.foldername(name))[1] in ('products','storefront')
    and public.has_any_role(array['manager','admin']::public.app_role[])
  );
drop policy if exists storefront_assets_manager_delete on storage.objects;
create policy storefront_assets_manager_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'storefront-assets'
    and (storage.foldername(name))[1] in ('products','storefront')
    and public.has_any_role(array['manager','admin']::public.app_role[])
  );
