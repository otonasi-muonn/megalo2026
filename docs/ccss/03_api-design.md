# 🔌 CCSS API設計

## 1. 設計方針

- API実装基盤はHonoを継続利用する。
- 通常JSON APIに加えて、CCSS向けに「動的CSSパッチ返却API」を追加する。
- 認証はSupabase JWTを前提に統一し、未認証時フォールバックを定義する。

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
| POST | `/api/ccss/style-patch` | UI状態に応じたCSS差分返却 | 任意（状態で分岐） |
| POST | `/api/ccss/transpile/validate` | React入力がCCSSサブセット適合か検証 | 必須（管理者） |

## 3. 動的CSSパッチAPI仕様

### Request

```json
{
  "view": "dashboard",
  "stateId": "ccss:dashboard:stage-card:menu-open",
  "payload": {
    "stageId": "uuid"
  }
}
```

### Response

```json
{
  "cssText": ".panel-menu{display:block}.toast{opacity:1}",
  "ttlMs": 3000,
  "patchId": "ccss_patch_20260317_0001"
}
```

## 4. エラーレスポンス規約

```json
{
  "error": {
    "code": "CCSS_INVALID_STATE",
    "message": "未定義のstateIdです",
    "hint": "ccss.manifest.json を参照してください"
  }
}
```

- `code` は機械判定用固定値
- `message` はユーザー表示可能な日本語
- `hint` は開発者向け補足

## 5. 命名規約（JSON/DB/DOM）

| 層 | 表記 | 例 | ルール |
| --- | --- | --- | --- |
| API入出力JSON | camelCase | `stateId`, `patchId`, `ttlMs` | 外部インターフェースはcamelCaseで統一 |
| DB保存名 | snake_case | `state_id`, `request_id`, `patch_id` | 永続化時にsnake_caseへ正規化 |
| DOM/CSS側識別子 | id属性 | `state-id`（例示） | `stateId` に対応するDOM idを使う |

## 6. セキュリティ要件

- `style-patch` は許可済みセレクタのみ返却（任意CSS注入を禁止）
- レート制限: `style-patch` はIP + session単位で短時間制限
- JWT検証失敗時は即401、黙殺しない

## 7. 監査ログ

- API実行時に `request_id` を発行
- `style-patch` は APIの `stateId` / `patchId` を、監査保存時に `state_id` / `patch_id` として記録
- 失敗時は `code` と入力 `view/stateId` を保存
