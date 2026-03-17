begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  initial_display_name text;
begin
  initial_display_name := nullif(trim(new.raw_user_meta_data->>'name'), '');

  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(initial_display_name, 'user-' || substring(new.id::text from 1 for 8))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

commit;
