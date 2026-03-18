create table if not exists public.ccss_transpile_jobs (
  id uuid primary key default uuid_generate_v4(),
  requested_by uuid not null references public.profiles (id) on delete cascade,
  source_path text not null,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_ccss_transpile_jobs_status_created_at
  on public.ccss_transpile_jobs (status, created_at desc);
