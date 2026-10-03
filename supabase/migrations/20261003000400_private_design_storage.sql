-- Private artwork storage. Object paths begin with the owning auth user ID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-files', 'design-files', false, 20971520,
  array['image/png','image/jpeg','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_design_file(_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_any_role(array['manager','sales','production','marketing','admin']::public.app_role[])
    or exists (
      select 1 from public.design_requests d
      where public.is_customer_of(d.customer_id)
        and (d.reference_files @> jsonb_build_array(_path) or d.final_design_url = _path)
    );
$$;
revoke all on function public.can_access_design_file(text) from public, anon;
grant execute on function public.can_access_design_file(text) to authenticated;

create policy design_files_read_owner_or_staff on storage.objects
for select to authenticated
using (
  bucket_id = 'design-files' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or
    public.can_access_design_file(name)
  )
);

create policy design_files_insert_owner_or_staff on storage.objects
for insert to authenticated
with check (
  bucket_id = 'design-files' and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy design_files_update_owner_or_staff on storage.objects
for update to authenticated
using (
  bucket_id = 'design-files' and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'design-files' and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy design_files_delete_owner_or_staff on storage.objects
for delete to authenticated
using (
  bucket_id = 'design-files' and (storage.foldername(name))[1] = (select auth.uid())::text
);
