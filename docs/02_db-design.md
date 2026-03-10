# 🗄️ データベース設計

### 1. `profiles`（ユーザー情報）

Supabaseの認証データ（`auth.users`）から分離し、アプリケーション側で利用するユーザーのプロフィール情報を管理するテーブルです。

| カラム名 | データ型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, FK(`auth.users.id`) | Supabase Authと紐づく一意のユーザーID |
| `display_name` | `text` | Not Null | ゲーム内で表示されるユーザー名（作者名・プレイヤー名） |
| `created_at` | `timestamptz` | Default `now()` | アカウント作成日時 |

### 2. `stages`（ステージ情報・統計）

ステージの構成データと、一覧表示のパフォーマンスを考慮した統計（非正規化）データを管理するテーブルです。

| カラム名 | データ型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, Default `uuid_generate_v4()` | ステージを一意に識別するID（シェア用URL等に利用） |
| `author_id` | `uuid` | Not Null, FK(`profiles.id`) ON DELETE CASCADE | ステージ作成者のユーザーID |
| `title` | `text` | Not Null | ステージ名 |
| `stage_data` | `jsonb` | Not Null | KAPLAYに渡すギミック配置などの構造化データ |
| `is_published` | `boolean` | Default `false` | 公開状態（true: 制作者によるクリアチェック完了・公開済） |
| `play_count` | `integer` | Default `0` | 累計プレイ回数 |
| `clear_count` | `integer` | Default `0` | 累計クリア回数 |
| `like_count` | `integer` | Default `0` | 累計いいね数 |
| `created_at` | `timestamptz` | Default `now()` | 作成日時 |
| `updated_at` | `timestamptz` | Default `now()` | 最終更新日時 |

### 3. `play_logs`（プレイ履歴）

ユーザーごとのプレイセッションの結果を記録するテーブルです。クリア率の算出や「最近遊んだステージ」機能のデータ基盤となります。

| カラム名 | データ型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, Default `uuid_generate_v4()` | プレイログを一意に識別するID |
| `stage_id` | `uuid` | Not Null, FK(`stages.id`) ON DELETE CASCADE | プレイされたステージのID |
| `player_id` | `uuid` | FK(`profiles.id`) ON DELETE CASCADE | プレイヤーのユーザーID（未ログイン時はnull許容） |
| `is_cleared` | `boolean` | Not Null | セッションの最終結果（true: クリア, false: ギブアップ等） |
| `retry_count` | `integer` | Default `0` | 1回のプレイセッション内で発生したリトライ回数 |
| `created_at` | `timestamptz` | Default `now()` | プレイ終了（リザルト到達）日時 |

### 4. `likes`（評価）

ユーザーとステージ間の「多対多」関係を管理する交差テーブルです。複合主キーにより、同一ユーザーによる重複評価を防止します。

| カラム名 | データ型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `stage_id` | `uuid` | PK(複合), FK(`stages.id`) ON DELETE CASCADE | いいねされたステージのID |
| `user_id` | `uuid` | PK(複合), FK(`profiles.id`) ON DELETE CASCADE | いいねしたユーザーのID |
| `created_at` | `timestamptz` | Default `now()` | いいねが行われた日時 |