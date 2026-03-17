begin;

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
