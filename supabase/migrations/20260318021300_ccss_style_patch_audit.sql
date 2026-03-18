create table if not exists public.ccss_style_patches (
  id text primary key,
  request_id text not null,
  view text not null,
  state_id text not null,
  applied_recipe_ids jsonb not null default '[]'::jsonb,
  resolved_class_list jsonb not null default '[]'::jsonb,
  ruleset_version text not null,
  ttl_ms integer not null check (ttl_ms > 0),
  requested_payload jsonb not null default '{}'::jsonb,
  rejection_code text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ccss_style_patches_view_state_created_at
  on public.ccss_style_patches (view, state_id, created_at desc);

create index if not exists idx_ccss_style_patches_request_id
  on public.ccss_style_patches (request_id);

create index if not exists idx_ccss_style_patches_applied_recipe_ids
  on public.ccss_style_patches using gin (applied_recipe_ids);
