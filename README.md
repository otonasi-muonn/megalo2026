# 🚀 megalo2026

スワイプで風を起こしてキャラクターを運ぶ、物理演算アクション + ステージ作成/共有ゲームのモノレポです。  
フロントエンド（React + Vite）とバックエンド（Hono）で役割を分離し、`packages/shared` で型を共有しています。

## 📚 ドキュメント導線

主要な設計ドキュメントは `docs/` にあります。

| ファイル | 内容 |
| --- | --- |
| `docs/_complete.md` | プロジェクト全体像（コンセプト、機能、画面、構成） |
| `docs/01_api-design.md` | API設計（エンドポイント、認可、イベント処理） |
| `docs/02_db-design.md` | DB設計（テーブル、制約、統計カラム） |
| `docs/03_front.md` | フロント/ゲーム設計（責任分界、状態遷移、`useKAPLAY` 方針） |

## 💻 開発環境セットアップ

### 前提ツール

- Node.js
- pnpm
- Docker Desktop
- Supabase CLI

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 環境変数を設定

用途ごとに配置先が異なります。

```bash
# フロントエンド
# apps/frontend/.env
VITE_API_BASE_URL=http://localhost:8787
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<publishable_key>

# バックエンド
# apps/backend/.env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<secret_key>
SUPABASE_JWT_AUDIENCE=authenticated

# Supabase CLI（Google OAuth Provider）
# supabase/.env（またはリポジトリ直下 .env）
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<google_client_id>
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=<google_client_secret>
```

- `publishable_key` / `secret_key` は `pnpm dlx supabase status` で確認できます。
- `apps/backend/.env` は `apps/backend/.env.example` から作成できます。

### 3. Supabase ローカル環境の起動

```bash
pnpm supabase:start
pnpm supabase:status
```

- `supabase/config.toml` でローカルの DB/Auth/Studio ポートを管理します。
- `supabase/seed.sql` は `pnpm supabase:reset` 実行時に再投入されます。

### 4. アプリケーション起動

別ターミナルでそれぞれ起動します。

```bash
# backend (Hono)
cd apps/backend
pnpm dlx vercel dev --listen 8787

# frontend (React)
cd apps/frontend
pnpm dev -- --host 127.0.0.1 --port 5173
```

- `pnpm --filter hono dev` は現状サーバー待受を行わず、即終了します。
- OAuth 検証時は `localhost` と `127.0.0.1` を混在させず、同じホストでアクセスしてください。

### 5. DBリセット / 停止

```bash
pnpm supabase:reset
pnpm supabase:stop
```

### トラブルシュート（OAuth）

- `Unsupported provider: provider is not enabled` が出る場合
  - `supabase/.env`（または `.env`）に Google Client ID/Secret が設定されているか確認
  - `pnpm dlx supabase stop && pnpm dlx supabase start` で再起動
- `supabase_vector_megalo2026` のコンテナ競合が出る場合
  - `docker ps -a --filter "label=com.supabase.cli.project=megalo2026" --format "{{.ID}}" | % { docker rm -f $_ }`
  - その後に `pnpm dlx supabase start`

## ✅ 検証コマンド

```bash
pnpm --filter frontend lint
pnpm --filter frontend build
pnpm --filter hono typecheck
```

## 📁 主要ディレクトリ

```text
.
├── .github/          # GitHub Actions / Issue・PRテンプレート
├── apps/
│   ├── frontend/     # React (Vite)
│   └── backend/      # Hono API
├── packages/
│   └── shared/       # フロント・バック共通型
├── supabase/         # Supabase CLI設定 / migrations / seed
├── docs/             # 設計ドキュメント
└── README.md
```

## 🤝 コントリビューション

開発フロー・ブランチ命名・PRルールは [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## 📄 ライセンス

[MIT License](LICENSE)
