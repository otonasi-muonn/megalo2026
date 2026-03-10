# 🔌 API設計仕様書

## 1. RESTful エンドポイント一覧 (Hono)

フロントエンドからバックエンド（Hono）へのリクエストを処理するエンドポイント群です。認可が必要なリソースへのアクセスは、HTTPリクエストヘッダー（`Authorization: Bearer <token>`）に含まれるSupabaseのJWTを検証して制御します。

| HTTPメソッド | エンドポイント | 役割 | 認可・セキュリティ要件 |
| --- | --- | --- | --- |
| **`GET`** | `/api/profiles/me` | 認証済ユーザー自身のプロフィール取得 | JWT検証必須 |
| **`PUT`** | `/api/profiles/me` | プロフィール情報の更新（表示名など） | JWT検証必須（※レコードの初回生成はDBトリガーへ委譲） |
| **`GET`** | `/api/profiles/me/likes` | 自身が高評価したステージ一覧の取得 | JWT検証必須 |
| **`GET`** | `/api/stages` | ステージ一覧の取得（クエリパラメータによるフィルタ・ページネーション対応） | パブリックアクセス可（認証不要） |
| **`POST`** | `/api/stages` | ステージの新規作成（下書き保存・UUID発行） | JWT検証必須（ペイロードの `author_id` にJWTの `sub` を紐付け） |
| **`GET`** | `/api/stages/:id` | 特定ステージの詳細データ取得 | パブリックアクセス可（認証不要） |
| **`PUT`** | `/api/stages/:id` | ステージデータの更新・公開ステータスの変更 | JWT検証必須 ＋ JWTのユーザーIDと `stages.author_id` の一致検証必須 |
| **`DELETE`** | `/api/stages/:id` | ステージの削除処理 | JWT検証必須 ＋ JWTのユーザーIDと `stages.author_id` の一致検証必須 |
| **`POST`** | `/api/stages/:id/play_logs` | プレイリザルトの記録および統計データの更新 | 任意（未認証時は `player_id` を `null` として記録） |
| **`POST`** | `/api/stages/:id/likes` | ステージに対する「いいね」のトグル処理（登録/解除） | JWT検証必須（DB側の複合主キー制約により重複評価を防止） |

## 2. 外部サービス連携 (3rd Party APIs)

システムを構成する外部クラウドサービスの役割と、各環境で必要となる環境変数の定義です。

| サービス名 | システム上の役割 | 必要な環境変数（キー名） |
| --- | --- | --- |
| **Supabase (Auth)** | Google OAuth連携・JWT発行・セッション管理 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (フロントエンド用) |
| **Supabase (Database)** | PostgreSQLへのデータ永続化（Honoからの接続） | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (バックエンド用) |
| **Google Cloud (OAuth)** | GoogleアカウントによるIdP（Identity Provider）機能 | なし（Supabaseダッシュボード上でClient ID / Secretを設定） |

## 3. イベント駆動処理 (Webhook / DBトリガー)

APIレイヤーを介さず、データベースのイベントを起点として自律的に実行されるバックグラウンド処理の定義です。

* **イベントトリガー**: Supabase Auth (認証基盤)
* **フック対象**: `on_auth_user_created` (新規ユーザーのサインアップ完了時)
* **実行処理 (PostgreSQL Function/Trigger)**:
* `auth.users` テーブルへのINSERTを検知し、同一トランザクション内で `public.profiles` テーブルへレコードを自動生成する。
* Google OAuthから取得したメタデータ（`raw_user_meta_data->>name`）を抽出し、プロフィール用の表示名として初期設定する。


* **設計上の利点**: アプリケーション（Hono）側での複雑なトランザクション管理が不要となり、ネットワークエラー等による「アカウントは存在するがプロフィールが存在しない」というデータ不整合をデータベースレベルで完全に排除できる。