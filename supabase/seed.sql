begin;

-- 公式アカウント用ユーザー（auth.usersに先に挿入）
-- NOTE: このseed.sqlはローカル開発専用。本番・ステージング環境には投入しないこと。
insert into auth.users (
  id,
  email,
  encrypted_password, -- ローカル開発用のため空文字。本番には投入しないこと
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role,
  aud
)
values (
  'a0000000-0000-4000-8000-000000000001',
  'official@megalo2026.local',
  '',
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"公式"}',
  false,
  'authenticated',
  'authenticated'
)
on conflict (id) do nothing;

-- 公式アカウント用プロフィール
insert into public.profiles (id, display_name, created_at)
values (
  'a0000000-0000-4000-8000-000000000001',
  '公式',
  now()
)
on conflict (id) do nothing;

commit;
