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
VITE_API_BASE_URL=http://127.0.0.1:8787
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
- 動的OGP（`/play/:id`）でステージ情報を埋め込む場合、フロントの実行環境（Vercel）へ `OGP_STAGE_API_BASE_URL`（例: `https://<backend-domain>`）を設定してください。

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

# frontend (React / Vite)
cd ../..
pnpm frontend:dev:vite
# CCSS関連ルートを確認する場合
pnpm frontend:dev:ccss
```

ブラウザは `http://127.0.0.1:5173` でアクセスしてください。

`frontend:dev:vite` は既存React UI（Vite構成）を表示します。  
`frontend:dev:ccss` も通常UIと同じルーティングで起動し、`/ccss-poc` と `/ccss-audit` を追加で確認できます。
- ホーム（`/`）では、公式アカウントの公開ステージを一覧表示します。
- 画面上部のグローバルヘッダーは廃止し、ホームのボタン（Play/Create/My Stages/ログイン）から遷移します。
- `pnpm --filter hono dev` は現状サーバー待受を行わず、即終了します。
- OAuth 検証時は `127.0.0.1` へ統一してアクセスしてください。

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

## 🔗 動的OGP（Issue #23）

- `apps/frontend/api/ogp/[stageId].ts` が、ステージIDごとの `og:*` / `twitter:*` メタを返します（タイトル・説明・URL・画像）。
- `apps/frontend/api/ogp-image/[stageId].ts` が、ステージID入りの動的OGP画像（SVG）を生成します。
- `apps/frontend/vercel.json` で、SNSクローラー系 User-Agent の `/play/:stageId` リクエストを OGP関数へリライトします。

確認例（ローカルVercel実行時）:

```bash
curl -A "Twitterbot" http://127.0.0.1:5173/play/<stage-id>
curl http://127.0.0.1:5173/api/ogp-image/<stage-id>?title=test-stage
```

期待結果:

- 1つ目のレスポンスHTMLに `og:title` / `twitter:title` / `og:image` が含まれること
- 2つ目が `image/svg+xml` として返ること

## 🧪 CCSSトランスパイラPoC（独立CLI）

CCSS設計（`docs/CCSS_complete.md`, `docs/ccss/`）に基づき、React 1ファイルを `C/CSS/manifest` に変換するPoCを `packages/ccss-compiler` に実装しています。

```bash
pnpm ccss:compiler:typecheck
pnpm ccss:compiler:sample
pnpm ccss:assets:sync
pnpm ccss:manifest-check
pnpm ccss:selector-check
pnpm ccss:html-state-check
pnpm ccss:c-safety
pnpm ccss:css-safety
pnpm ccss:dom-isolation
pnpm ccss:transpile-build
pnpm ccss:style-patch:contract
pnpm ccss:recipe-integrity
pnpm ccss:smoke
pnpm ccss:checks
```

`pnpm ccss:compiler:sample` 実行後、以下が生成されます。

- `packages/ccss-compiler/examples/output/ui.generated.c`
- `packages/ccss-compiler/examples/output/ui.generated.css`
- `packages/ccss-compiler/examples/output/ccss.manifest.json`

`pnpm ccss:assets:sync` 実行後、フロントの公開ディレクトリへ同期されます。

- `apps/frontend/public/ccss/ui.generated.c`
- `apps/frontend/public/ccss/ui.generated.css`
- `apps/frontend/public/ccss/ccss.manifest.json`

`pnpm ccss:style-patch:contract` で、`style-patch` APIの契約（危険トークン拒否・範囲外拒否・`cssText` 非返却）を自動検証できます。
`CCSS_STYLE_PATCH_AUDIT_ENABLED=true` を有効化すると、`style-patch` の成功/失敗が `ccss_style_patches` テーブルへ監査保存されます。
`CCSS_TRANSPILE_AUDIT_ENABLED=true` を有効化すると、`transpile/validate` の成功/失敗が `ccss_transpile_jobs` テーブルへ監査保存されます。
`CCSS_STATE_EVENT_AUDIT_ENABLED=true` を有効化すると、`POST /api/ccss/state-events` でUI状態遷移イベントを `ccss_state_events` テーブルへ監査保存できます。
管理者JWTで `GET /api/ccss/audit/style-patches` / `GET /api/ccss/audit/transpile-jobs` / `GET /api/ccss/audit/state-events` を呼ぶと、監査ログ一覧を参照できます。
`GET /api/ccss/audit/sessions` を呼ぶと、state-events から sessionKey ごとの直近集計を取得できます。
`GET /api/ccss/audit/session-trace?sessionKey=<...>&fromLatest=true` を呼ぶと、`state -> patch -> appliedRecipeIds` の相関済み時系列を取得できます（`fromLatest=true` は最新N件を取得しつつ返却順は時系列順）。
`GET /api/ccss/audit/summary` を呼ぶと、style/transpile/state-events の直近集計を取得できます。
`pnpm ccss:recipe-integrity` で、manifestとレシピ定義の整合（stateId対応・重複・class命名）を自動検証できます。
`pnpm ccss:manifest-check` で、manifestの必須項目/型/重複stateIdに加えて enum の `enumValues` 整合（空配列禁止・重複禁止・初期値包含）を検証できます。
`pnpm ccss:selector-check` で、manifest.stateId とCSSセレクタ（`data-ccss-state` / `:checked` トグル）の対応を検証できます。
`pnpm ccss:html-state-check` で、manifest.stateId（boolean / enum）と生成HTML（`ui.generated.c`）の `id` 対応を検証できます。
`pnpm ccss:c-safety` で、生成Cコードの危険API/不正断片（`malloc`, `strcpy`, `system(`, `<script`）を検出できます。
`pnpm ccss:css-safety` で、生成CSSの危険トークン/危険セレクタ（`@import`, `url(`, `expression(`, `* {`）を検出できます。
`pnpm ccss:dom-isolation` で、生成UIへの `<canvas>` / `#ccss-game-root` 混入を検出できます。
`pnpm ccss:transpile-build` で、生成・同期・レシピ整合検証を一括実行できます。
`pnpm ccss:smoke` で、CCSS APIの最小疎通（style-patch正常系 / transpile validate認証境界）を検証できます。
`pnpm ccss:checks` で、CCSS関連の検証一式（compiler/build/contract/smoke/frontend/backend）をまとめて実行できます。
`.github/workflows/ccss-checks.yml` は PR と `develop` への push で `pnpm ccss:checks` を実行します。
workflow完了時には `apps/frontend/public/ccss` の生成物が `ccss-generated-assets` として7日間保存されます。
フロント表示モードは Vite の実行モードで切替でき、`pnpm frontend:dev:ccss`（`vite --host 127.0.0.1 --mode ccss`）でCCSSモード起動できます。

### 動作確認方法（CCSS compiler + runtime PoC + validate API）

`POST /api/ccss/transpile/validate` は管理者JWTが必要です。`apps/backend/.env` の `CCSS_ADMIN_USER_IDS` に管理者ユーザーID（UUID）を設定してください。
`POST /api/ccss/style-patch` は短時間レート制限があります（既定: 5秒あたり20リクエスト、`CCSS_STYLE_PATCH_RATE_LIMIT_*` で変更可）。匿名キーに `X-Forwarded-For` / `X-Real-IP` を使う場合は `CCSS_TRUST_PROXY_HEADERS=true` を設定してください。

#### 1. 正常系（変換 + 同期 + 画面確認）

```bash
pnpm ccss:compiler:typecheck
pnpm ccss:poc:prepare
pnpm --filter hono dev
pnpm frontend:dev:ccss
```

期待結果:

- エラー終了しないこと
- `examples/output` と `apps/frontend/public/ccss` に生成物3点が揃うこと
- ブラウザで `http://127.0.0.1:5173/ccss-poc` を開き、PoCページが表示されること
- `生成物を読み込む` 後に `対象state` を選択し、`style-patch API適用` を押すと、`applied recipes` と `state-events` の結果が表示されること
- `transpile validate API` セクションの `Bearer token` に管理者JWTを入力して `ソース検証を実行` を押すと `OK` 結果が表示されること
- `http://127.0.0.1:5173/ccss-audit` を開き、管理者Bearer tokenで `style-patch / transpile / state-events` 監査ログ一覧を取得できること
- `recent sessions` に sessionKey 候補と event件数が表示され、`sessionKeyで再取得` を押すと即時に `session trace` が再取得されること
- `state-events フィルタ` の `sessionKey` を入力して取得した場合も、`session trace` に `state -> patch -> recipes` 相関が表示されること
- `audit summary` に `rejectionCodes` / `status` / `eventNames` の集計が表示されること

#### 2. 異常系（サブセット外入力）

`useEffect` などPoCサブセット外構文を含む `.tsx` を入力に指定し、`transform` を実行します。

```bash
pnpm --filter @ccss/compiler run transform -- --input <invalid.tsx> --outDir <outDir>
```

期待結果:

- `CCSS_PARSE_ERROR` が表示され、非0で終了すること

#### 3. 異常系（validate APIの構文エラー）

PoCページの `transpile validate API` セクションで、入力ソースに `useEffect` などサブセット外構文を含めて `ソース検証を実行` します。

期待結果:

- `NG: サブセット外構文があります。` が表示されること
- 行・列付きでエラーが表示されること（例: `L3:C3 ...`）

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
