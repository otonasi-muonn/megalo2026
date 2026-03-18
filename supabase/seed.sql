begin;

-- 公式アカウント用ユーザー（auth.usersに先に挿入）
insert into auth.users (
  id,
  email,
  encrypted_password,
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

-- チュートリアルステージ
-- スポーン左上 → 棚を右に下りながら → ゴール右下
insert into public.stages (id, author_id, title, stage_data, is_published, created_at, updated_at)
values (
  'b0000000-0000-4000-8000-000000000101',
  'a0000000-0000-4000-8000-000000000001',
  'チュートリアル - 風を使ってみよう',
  '{
    "version": "1.0.0",
    "world": { "width": 1920, "height": 1080, "gridSize": 16 },
    "physics": {
      "gravity": { "x": 0, "y": 9.8 },
      "airDrag": 0.012,
      "windDecay": 0.08,
      "windForceScale": 1
    },
    "spawn": { "position": { "x": 160, "y": 200 } },
    "goal": {
      "position": { "x": 1720, "y": 900 },
      "size": { "width": 120, "height": 120 }
    },
    "gimmicks": [
      {
        "id": "wall-floor",
        "kind": "wall",
        "position": { "x": 0, "y": 960 },
        "size": { "width": 1920, "height": 120 }
      },
      {
        "id": "wall-left",
        "kind": "wall",
        "position": { "x": 0, "y": 0 },
        "size": { "width": 60, "height": 1080 }
      },
      {
        "id": "wall-right",
        "kind": "wall",
        "position": { "x": 1860, "y": 0 },
        "size": { "width": 60, "height": 1080 }
      },
      {
        "id": "wall-shelf-1",
        "kind": "wall",
        "position": { "x": 60, "y": 480 },
        "size": { "width": 600, "height": 40 }
      },
      {
        "id": "wall-shelf-2",
        "kind": "wall",
        "position": { "x": 800, "y": 680 },
        "size": { "width": 600, "height": 40 }
      },
      {
        "id": "wall-shelf-3",
        "kind": "wall",
        "position": { "x": 1400, "y": 760 },
        "size": { "width": 460, "height": 40 }
      }
    ]
  }'::jsonb,
  true,
  now(),
  now()
)
on conflict (id) do nothing;

commit;
