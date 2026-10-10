alter table public.product_image_generation_settings
  add column if not exists updated_by uuid references public.users(id) on delete set null;
