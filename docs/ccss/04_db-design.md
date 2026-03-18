# 🗄️ CCSS DB設計

## 1. 方針

- 既存の `profiles` / `stages` / `play_logs` / `likes` を基盤として再利用する。
- CCSS固有要件（変換管理・CSSパッチ監査）を追加テーブルで拡張する。
- 「誰が・どの状態遷移を・いつ発火したか」を追跡可能にする。
- `style-patch` は任意CSS文字列を保持せず、`recipe_id` ベースで適用履歴を監査する。

## 2. 既存テーブル再利用

- `profiles`: ユーザー情報
- `stages`: ステージ本体（`stage_data`）
- `play_logs`: プレイ結果
- `likes`: いいね

## 3. 追加テーブル案

### 3.1 `ccss_transpile_jobs`

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | 変換ジョブID |
| `requested_by` | `uuid` | FK(`profiles.id`) | 実行ユーザー |
| `source_path` | `text` | Not Null | 入力Reactファイル |
| `status` | `text` | Not Null | `queued/running/succeeded/failed` |
| `warnings` | `jsonb` | Default `[]` | 警告一覧 |
| `errors` | `jsonb` | Default `[]` | 失敗詳細 |
| `created_at` | `timestamptz` | Default `now()` | 作成日時 |
| `finished_at` | `timestamptz` |  | 完了日時 |

### 3.2 `ccss_style_recipes`

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `recipe_id` | `text` | PK | サーバー定義済みレシピID |
| `view` | `text` | Not Null | 対象画面 |
| `state_id` | `text` | Not Null | 紐づく状態ID |
| `target_class` | `text` | Not Null | 適用対象クラス |
| `add_classes` | `jsonb` | Default `[]` | 付与クラス配列 |
| `ruleset_version` | `text` | Not Null | 生成ルールセット版 |
| `is_active` | `boolean` | Default `true` | 利用可否 |
| `created_at` | `timestamptz` | Default `now()` | 作成日時 |
| `updated_at` | `timestamptz` | Default `now()` | 更新日時 |

### 3.3 `ccss_style_patches`

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `text` | PK | パッチID（API `patchId` をそのまま保存） |
| `request_id` | `text` | Not Null | APIリクエスト相関ID |
| `view` | `text` | Not Null | 対象画面 |
| `state_id` | `text` | Not Null | 変更対象状態 |
| `applied_recipe_ids` | `jsonb` | Not Null | 適用した `recipe_id` 一覧 |
| `resolved_class_list` | `jsonb` | Not Null | 返却した `classList` の監査スナップショット |
| `ruleset_version` | `text` | Not Null | 解決に使ったルールセット版 |
| `ttl_ms` | `integer` | Not Null | 有効期限 |
| `requested_payload` | `jsonb` | Default `{}` | 受信payload（監査用） |
| `rejection_code` | `text` |  | 拒否時エラーコード（成功時null） |
| `created_by` | `uuid` | FK(`profiles.id`) | 実行ユーザー（null可） |
| `created_at` | `timestamptz` | Default `now()` | 作成日時 |

### 3.4 `ccss_state_events`

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | イベントID |
| `session_key` | `text` | Not Null | セッション識別子 |
| `state_id` | `text` | Not Null | 発火状態 |
| `event_name` | `text` | Not Null | `ui:state:set` 等 |
| `request_id` | `text` |  | APIリクエスト紐付け |
| `patch_id` | `text` | FK(`ccss_style_patches.id`) | 適用パッチ紐付け |
| `payload` | `jsonb` | Default `{}` | 付帯データ |
| `created_at` | `timestamptz` | Default `now()` | 記録時刻 |

## 4. インデックス・制約

- `ccss_state_events(session_key, created_at desc)` インデックス
- `ccss_style_recipes(view, state_id, is_active)` インデックス
- `ccss_style_patches(view, state_id, created_at desc)` インデックス
- `ccss_style_patches(applied_recipe_ids)` GINインデックス
- `ccss_transpile_jobs(status, created_at desc)` インデックス
- `state_id` の正規表現制約（`^ccss:[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$`）
- `recipe_id` の正規表現制約（`^rcp[A-Za-z0-9]+V[0-9]+$`）

## 5. データライフサイクル

- `ccss_state_events`: 30日保持後アーカイブ
- `ccss_style_recipes`: 現行 + 1世代前の `ruleset_version` を保持
- `ccss_style_patches`: 14日保持（短命データ）
- `ccss_transpile_jobs`: 90日保持（検証/監査用途）

## 6. 不整合防止

- API層で受信した `stateId` を manifest照合し、`ccss_style_recipes`（`is_active = true`）から `recipe_id` を解決して保存時に `state_id` へ正規化する
- `applied_recipe_ids` の各要素は `ccss_style_recipes.recipe_id` に存在する値のみ許可する
- APIの `patchId` は `ccss_style_patches.id`（監査表記 `patch_id`）と1対1対応させる
- 失敗ログは `rejection_code` と `requested_payload` を保存し、成功と同じ追跡軸で分析する
- 物理削除前に集計済みメトリクスへ転記
