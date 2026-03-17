begin;

create table if not exists public.dev_seed_log (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.dev_seed_log (key, value)
values
  ('seed_version', '2026-03-16'),
  ('seed_note', 'profiles/stages テーブル作成後に開発用データを追加')
on conflict (key)
do update set
  value = excluded.value,
  updated_at = now();

do $$
begin
  if to_regclass('public.profiles') is not null then
    raise notice 'profiles テーブルを検知。Issue #12/#13 完了後にユーザー初期データを投入してください。';
  end if;

  if to_regclass('public.stages') is not null then
    raise notice 'stages テーブルを検知。Issue #12 完了後にサンプルステージデータを投入してください。';
  end if;
end $$;

commit;
