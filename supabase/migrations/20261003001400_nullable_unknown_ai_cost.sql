-- Keep unknown provider pricing distinct from a confirmed zero-cost AI run.
alter table public.ai_runs alter column estimated_cost drop not null;
