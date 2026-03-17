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

### 2. Supabase ローカル環境の起動

```bash
pnpm supabase:start
pnpm supabase:status
```

- `supabase/config.toml` でローカルの DB/Auth/Studio ポートを管理します。
- `supabase/seed.sql` は `pnpm supabase:reset` 実行時に再投入されます。

### 3. アプリケーション起動

別ターミナルでそれぞれ起動します。

```bash
pnpm --filter hono dev
pnpm --filter frontend dev
```

### 4. DBリセット / 停止

```bash
pnpm supabase:reset
pnpm supabase:stop
```

## ✅ 検証コマンド

```bash
pnpm --filter frontend lint
pnpm --filter frontend build
pnpm --filter hono typecheck
```

## 🧪 CCSSトランスパイラPoC（独立CLI）

CCSS設計（`docs/CCSS_complete.md`, `docs/ccss/`）に基づき、React 1ファイルを `C/CSS/manifest` に変換するPoCを `packages/ccss-compiler` に実装しています。

```bash
pnpm ccss:compiler:typecheck
pnpm ccss:compiler:sample
pnpm ccss:assets:sync
```

`pnpm ccss:compiler:sample` 実行後、以下が生成されます。

- `packages/ccss-compiler/examples/output/ui.generated.c`
- `packages/ccss-compiler/examples/output/ui.generated.css`
- `packages/ccss-compiler/examples/output/ccss.manifest.json`

`pnpm ccss:assets:sync` 実行後、フロントの公開ディレクトリへ同期されます。

- `apps/frontend/public/ccss/ui.generated.c`
- `apps/frontend/public/ccss/ui.generated.css`
- `apps/frontend/public/ccss/ccss.manifest.json`

### 動作確認方法（CCSS compiler + runtime PoC + validate API）

#### 1. 正常系（変換 + 同期 + 画面確認）

```bash
pnpm ccss:compiler:typecheck
pnpm ccss:poc:prepare
pnpm --filter hono dev
pnpm --filter frontend dev
```

期待結果:

- エラー終了しないこと
- `examples/output` と `apps/frontend/public/ccss` に生成物3点が揃うこと
- ブラウザで `http://localhost:5173/ccss-poc` を開き、PoCページが表示されること
- `生成物を読み込む` 後に `style-patch API適用` を押すと、`applied recipes` が表示されること
- `transpile validate API` セクションで `ソース検証を実行` を押すと `OK` 結果が表示されること

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
