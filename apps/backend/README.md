# Backend（Hono API）

`Issue #14` 対応として、backend は Supabase DB への CRUD と JWT 検証（JWKS）を実装しています。

## 前提

- Node.js / pnpm
- Docker Desktop
- Supabase CLI（グローバル）または `pnpm dlx supabase`
- Vercel CLI（`vercel dev` を使う場合）

## 環境変数

PowerShell例:

```powershell
$env:SUPABASE_URL="http://127.0.0.1:54321"
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
$env:SUPABASE_JWT_AUDIENCE="authenticated"
```

- `SUPABASE_URL`: Supabase API URL
- `SUPABASE_SERVICE_ROLE_KEY`: サービスロールキー（DB操作用）
- `SUPABASE_JWT_AUDIENCE`: JWTの `aud` 検証値（未指定時 `authenticated`）

## ローカル起動手順

1. 依存インストール

```powershell
Set-Location C:\.program_code\megalo2026
pnpm install
```

2. Supabase 起動・DB反映

```powershell
pnpm dlx supabase start
pnpm dlx supabase db reset
pnpm dlx supabase status
```

3. backend 起動（Vercel dev）

```powershell
Set-Location C:\.program_code\megalo2026\apps\backend
pnpm dlx vercel dev --listen 8787
```

補助として、Hono を直接起動する場合:

```powershell
pnpm dev
```

## API認証メモ

- `Authorization: Bearer <JWT>` を必要とするAPIは、Supabase JWKSで署名検証します。
- トークンなし/無効トークンの場合は `401 Unauthorized` を返します。
- `POST /api/stages/:id/play_logs` のみ認証任意です（未認証時 `player_id = null`）。
