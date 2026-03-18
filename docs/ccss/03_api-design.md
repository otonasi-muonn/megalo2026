# 🔌 CCSS API設計

## 1. 設計方針

- API実装基盤はHonoを継続利用する。
- 通常JSON APIに加えて、CCSS向けに「動的CSSパッチ返却API」を追加する。
- 認証はSupabase JWTを前提に統一し、未認証時フォールバックを定義する。
- `style-patch` は「構造的無害化」を前提とし、ユーザー入力文字列をCSSプロパティ値/セレクタへ直接連結しない。

## 2. エンドポイント一覧

| メソッド | パス | 用途 | 認証 |
| --- | --- | --- | --- |
| GET | `/api/stages` | 公開ステージ一覧取得 | 不要 |
| GET | `/api/stages/:id` | ステージ詳細取得 | 不要 |
| POST | `/api/stages` | ステージ作成 | 必須 |
| PUT | `/api/stages/:id` | ステージ更新/公開 | 必須（作者一致） |
| DELETE | `/api/stages/:id` | ステージ削除 | 必須（作者一致） |
| POST | `/api/stages/:id/play_logs` | プレイログ記録 | 任意 |
| POST | `/api/stages/:id/likes` | いいねトグル | 必須 |
| GET | `/api/ccss/style-patch/states` | `style-patch` で適用可能な state 一覧取得 | 任意 |
| POST | `/api/ccss/style-patch` | UI状態に応じた安全レシピ差分返却 | 任意（状態で分岐） |
| POST | `/api/ccss/transpile/validate` | React入力がCCSSサブセット適合か検証 | 必須（管理者） |

## 3. 動的CSSパッチAPI仕様（構造的無害化）

### 3.1 原則

- Hono側は `view` / `stateId` / `payload` の入力文字列をCSS文字列へ直接反映しない。
- `stateId` を `ccss.manifest.json` とサーバー定義済みレシピレジストリへ照合し、許可済み組み合わせのみ解決する。
- レスポンスは `recipeIds` と `classList`（適用対象クラス + 付与クラス）のみを返し、`cssText` は返却しない。

### 3.2 Request

```json
{
  "view": "dashboard",
  "stateId": "ccss:dashboard:stage-card:menu-open",
  "payload": {
    "stageId": "uuid"
  }
}
```

- `payload` はドメインデータのみを許可し、スタイル値・セレクタ文字列は受理しない。
- 危険トークン（`@import` / `url(` / `expression(` / `<style` など）を含む文字列は422で拒否する。

### 3.3 Response

```json
{
  "patchId": "ccss_patch_20260317_0001",
  "stateId": "ccss:dashboard:stage-card:menu-open",
  "ttlMs": 3000,
  "recipeIds": [
    "rcpDashboardStageCardMenuOpenV1",
    "rcpSharedToastVisibleV1"
  ],
  "classList": [
    {
      "targetClass": "ccss-dashboard-stage-card",
      "add": ["is-menu-open"]
    },
    {
      "targetClass": "ccss-toast",
      "add": ["is-visible"]
    }
  ],
  "rulesetVersion": "2026-03-17"
}
```

- `recipeIds` / `classList` はサーバー定義済みセットのみ返却する。
- クライアントは `recipeIds` を監査相関キーとして保持する。

## 4. エラーレスポンス規約

```json
{
  "error": {
    "code": "CCSS_UNSAFE_INPUT_REJECTED",
    "message": "payloadに危険トークンが含まれています",
    "hint": "url( / @import / expression( / <style を除去してください"
  }
}
```

| code | HTTP | 条件 |
| --- | --- | --- |
| `CCSS_INVALID_STATE` | 400 | 未定義の `stateId` |
| `CCSS_UNSAFE_INPUT_REJECTED` | 422 | 危険トークンを含む入力 |
| `CCSS_RECIPE_OUT_OF_SCOPE` | 403 | `stateId` に対応しないレシピ参照 |
| `CCSS_RECIPE_RESOLUTION_FAILED` | 500 | manifest とレシピ定義の不整合 |

- `code` は機械判定用固定値
- `message` はユーザー表示可能な日本語
- `hint` は開発者向け補足

## 5. 命名規約（JSON/DB/DOM）

| 層 | 表記 | 例 | ルール |
| --- | --- | --- | --- |
| API入出力JSON | camelCase | `stateId`, `patchId`, `ttlMs`, `recipeIds` | 外部インターフェースはcamelCaseで統一 |
| DB保存名 | snake_case | `state_id`, `request_id`, `patch_id` | 永続化時にsnake_caseへ正規化 |
| DOM/CSS側識別子 | id属性 | `state-id`（例示） | `stateId` に対応するDOM idを使う |

## 6. セキュリティ要件

- `style-patch` はサーバー定義済み `recipeIds` + `classList` のみ返却（任意CSS注入を禁止）
- Hono層で入力値をCSSプロパティ値へ直接連結しない（構造的無害化）
- 危険トークン検出時は `CCSS_UNSAFE_INPUT_REJECTED` を返して処理中断
- レート制限: `style-patch` は認証ユーザー単位 + 匿名共有キーで短時間制限（`CCSS_TRUST_PROXY_HEADERS=true` 時のみ信頼プロキシ経由のIPヘッダーを利用）
- JWT検証失敗時は即401、黙殺しない

## 7. 監査ログ

- API実行時に `request_id` を発行
- `style-patch` は APIの `stateId` / `patchId` / `recipeIds` を、監査保存時に `state_id` / `patch_id` / `applied_recipe_ids` として記録
- 失敗時は `code` と入力 `view/stateId`、拒否理由（`rejection_code`）を保存
