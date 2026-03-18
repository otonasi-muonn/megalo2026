create table if not exists public.ccss_state_events (
  id uuid primary key default uuid_generate_v4(),
  session_key text not null,
  state_id text not null,
  event_name text not null,
  request_id text,
  patch_id text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ccss_state_events_session_created_at
  on public.ccss_state_events (session_key, created_at desc);

create index if not exists idx_ccss_state_events_state_created_at
  on public.ccss_state_events (state_id, created_at desc);
