create table if not exists public.marketing_plan_settings (
  id boolean primary key default true check (id = true),
  goals text not null default 'Build local brand awareness and generate qualified print enquiries.',
  target_audience text not null default 'Small businesses, cafes, and local organizations in Mansoura.',
  product_ids uuid[] not null default '{}'::uuid[],
  platforms text[] not null default array['instagram']::text[],
  campaign_themes text[] not null default array['product_showcase','educational','brand','engagement']::text[],
  posts_per_month integer not null default 4 check (posts_per_month between 1 and 12),
  important_dates jsonb not null default '[]'::jsonb check (jsonb_typeof(important_dates) = 'array'),
  brand_voice text not null default 'Warm, confident, clear, and locally relevant.',
  visual_preferences text not null default 'Professional product photography with realistic print materials and restrained brand colors.',
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint marketing_platforms_valid check (platforms <@ array['instagram','facebook','linkedin','x','general']::text[]),
  constraint marketing_themes_count check (cardinality(campaign_themes) between 1 and 10),
  constraint marketing_platforms_count check (cardinality(platforms) between 1 and 5)
);

insert into public.marketing_plan_settings(id) values (true) on conflict (id) do nothing;
alter table public.marketing_plan_settings enable row level security;
revoke all on public.marketing_plan_settings from public, anon, authenticated;
grant select, insert, update on public.marketing_plan_settings to service_role;
