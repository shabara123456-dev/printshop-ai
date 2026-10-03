alter table public.marketing_assets
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists campaign_brief text,
  add column if not exists campaign_type text,
  add column if not exists created_by uuid references public.users(id) on delete set null;


alter table public.marketing_assets
  add constraint marketing_assets_campaign_type_check
  check (campaign_type is null or campaign_type in ('product_showcase','promotion','educational','seasonal','brand','engagement','new_product'));

create index if not exists marketing_assets_product_created_idx on public.marketing_assets(product_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-assets', 'marketing-assets', false, 12582912, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists marketing_assets_staff_storage_read on storage.objects;
create policy marketing_assets_staff_storage_read on storage.objects
for select to authenticated using (
  bucket_id = 'marketing-assets' and public.has_any_role(array['manager','marketing','admin']::public.app_role[])
);
