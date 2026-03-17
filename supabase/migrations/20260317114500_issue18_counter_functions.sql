create or replace function public.increment_stage_counters(
  p_stage_id uuid,
  p_clear_increment integer default 0
)
returns table (play_count integer, clear_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.stages
  set
    play_count = stages.play_count + 1,
    clear_count = stages.clear_count + greatest(p_clear_increment, 0),
    updated_at = now()
  where stages.id = p_stage_id
  returning stages.play_count, stages.clear_count;
end;
$$;

create or replace function public.recalc_stage_like_count(
  stage_id uuid
)
returns table (like_count integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with counted as (
    select count(*)::integer as total
    from public.likes
    where likes.stage_id = recalc_stage_like_count.stage_id
  )
  update public.stages
  set
    like_count = counted.total,
    updated_at = now()
  from counted
  where stages.id = recalc_stage_like_count.stage_id
  returning stages.like_count, stages.updated_at;
end;
$$;
