begin;

insert into public.stages (id, author_id, title, stage_data, is_published, created_at, updated_at)
values (
  'b0000000-0000-4000-8000-000000000101',
  'a0000000-0000-4000-8000-000000000001',
  'チュートリアル1 - はじめての風',
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
      "position": { "x": 1720, "y": 440 },
      "size": { "width": 120, "height": 120 }
    },
    "gimmicks": [
      {
        "id": "wall-ceiling",
        "kind": "wall",
        "position": { "x": 0, "y": 0 },
        "size": { "width": 1920, "height": 60 }
      },
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
        "id": "vwall-1-top",
        "kind": "wall",
        "position": { "x": 540, "y": 60 },
        "size": { "width": 40, "height": 400 }
      },
      {
        "id": "vwall-1-bottom",
        "kind": "wall",
        "position": { "x": 540, "y": 560 },
        "size": { "width": 40, "height": 400 }
      },
      {
        "id": "vwall-2-top",
        "kind": "wall",
        "position": { "x": 1020, "y": 60 },
        "size": { "width": 40, "height": 280 }
      },
      {
        "id": "vwall-2-bottom",
        "kind": "wall",
        "position": { "x": 1020, "y": 480 },
        "size": { "width": 40, "height": 480 }
      },
      {
        "id": "vwall-3-top",
        "kind": "wall",
        "position": { "x": 1500, "y": 60 },
        "size": { "width": 40, "height": 120 }
      },
      {
        "id": "vwall-3-bottom",
        "kind": "wall",
        "position": { "x": 1500, "y": 320 },
        "size": { "width": 40, "height": 640 }
      }
    ]
  }'::jsonb,
  true,
  now(),
  now()
)
on conflict (id) do update set
  title = excluded.title,
  stage_data = excluded.stage_data,
  is_published = excluded.is_published,
  updated_at = now();

insert into public.stages (id, author_id, title, stage_data, is_published, created_at, updated_at)
values (
  'b0000000-0000-4000-8000-000000000102',
  'a0000000-0000-4000-8000-000000000001',
  'チュートリアル2 - トゲをよけろ',
  '{
    "version": "1.0.0",
    "world": { "width": 1920, "height": 1080, "gridSize": 16 },
    "physics": {
      "gravity": { "x": 0, "y": 9.8 },
      "airDrag": 0.012,
      "windDecay": 0.08,
      "windForceScale": 1
    },
    "spawn": { "position": { "x": 160, "y": 500 } },
    "goal": {
      "position": { "x": 1720, "y": 160 },
      "size": { "width": 120, "height": 120 }
    },
    "gimmicks": [
      {
        "id": "wall-ceiling",
        "kind": "wall",
        "position": { "x": 0, "y": 0 },
        "size": { "width": 1920, "height": 60 }
      },
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
        "id": "wall-div-1-top",
        "kind": "wall",
        "position": { "x": 500, "y": 60 },
        "size": { "width": 40, "height": 540 }
      },
      {
        "id": "wall-div-1-bottom",
        "kind": "wall",
        "position": { "x": 500, "y": 740 },
        "size": { "width": 40, "height": 220 }
      },
      {
        "id": "wall-div-2-top",
        "kind": "wall",
        "position": { "x": 1000, "y": 60 },
        "size": { "width": 40, "height": 220 }
      },
      {
        "id": "wall-div-2-bottom",
        "kind": "wall",
        "position": { "x": 1000, "y": 420 },
        "size": { "width": 40, "height": 540 }
      },
      {
        "id": "wall-div-3-top",
        "kind": "wall",
        "position": { "x": 1400, "y": 60 },
        "size": { "width": 40, "height": 540 }
      },
      {
        "id": "wall-div-3-bottom",
        "kind": "wall",
        "position": { "x": 1400, "y": 740 },
        "size": { "width": 40, "height": 220 }
      },
      {
        "id": "spike-zone2-ceil",
        "kind": "spike",
        "position": { "x": 560, "y": 60 },
        "size": { "width": 400, "height": 100 },
        "damage": 1
      },
      {
        "id": "spike-zone2-floor",
        "kind": "spike",
        "position": { "x": 560, "y": 860 },
        "size": { "width": 400, "height": 100 },
        "damage": 1
      },
      {
        "id": "spike-zone3-floor",
        "kind": "spike",
        "position": { "x": 1060, "y": 860 },
        "size": { "width": 300, "height": 100 },
        "damage": 1
      },
      {
        "id": "spring-launch",
        "kind": "spring",
        "position": { "x": 1460, "y": 820 },
        "size": { "width": 200, "height": 80 },
        "power": 1800
      }
    ]
  }'::jsonb,
  true,
  now(),
  now()
)
on conflict (id) do update set
  title = excluded.title,
  stage_data = excluded.stage_data,
  is_published = excluded.is_published,
  updated_at = now();

commit;
