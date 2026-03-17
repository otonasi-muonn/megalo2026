begin;

create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stages (
  id uuid primary key default uuid_generate_v4(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  stage_data jsonb not null,
  is_published boolean not null default false,
  play_count integer not null default 0 check (play_count >= 0),
  clear_count integer not null default 0 check (clear_count >= 0),
  like_count integer not null default 0 check (like_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.play_logs (
  id uuid primary key default uuid_generate_v4(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  player_id uuid references public.profiles (id) on delete cascade,
  is_cleared boolean not null,
  retry_count integer not null default 0 check (retry_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  stage_id uuid not null references public.stages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (stage_id, user_id)
);

create index if not exists idx_stages_author_id on public.stages (author_id);
create index if not exists idx_stages_is_published on public.stages (is_published);
create index if not exists idx_stages_updated_at on public.stages (updated_at desc);
create index if not exists idx_play_logs_stage_id on public.play_logs (stage_id);
create index if not exists idx_play_logs_player_id on public.play_logs (player_id);
create index if not exists idx_likes_user_id on public.likes (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_stages_updated_at on public.stages;
create trigger set_stages_updated_at
before update on public.stages
for each row
execute procedure public.set_updated_at();

commit;
