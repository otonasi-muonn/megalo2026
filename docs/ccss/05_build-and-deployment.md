# 🚀 CCSSビルド・デプロイ設計

## 1. 目標

- 独立変換器（CCSS Compiler）を単体実行できる状態を維持しつつ、最終的に既存ビルドへ統合する。
- 失敗時に即時ロールバック可能な段階リリースを採用する。

## 2. ビルド段階

1. **検証段階**
   - React入力がCCSSサブセットに適合するか静的検証
   - `style-patch` 契約検証（危険トークン拒否 / レシピ外参照禁止 / `cssText` 非返却）を実施
2. **変換段階**
   - `ui.generated.c` / `ui.generated.css` / `ccss.manifest.json`（`stateId -> recipeIds` 対応を含む）を生成
3. **WASM段階**
   - CコードをWASMへコンパイル
4. **統合段階**
   - フロントに生成物を組み込み、KAPLAY連携テストを実行
5. **配備段階**
   - Vercelへデプロイし、ヘルスチェック実施

## 3. CIジョブ構成（案）

- `lint-and-typecheck`
- `ccss-validate-subset`
- `ccss-style-patch-contract`
- `ccss-recipe-integrity-check`
- `ccss-transpile-build`
- `wasm-build`
- `frontend-build`
- `smoke-test`

## 4. リリース戦略

- **Canary環境**で `style-patch` API（422/403拒否動作含む）とWASM初期化を先行検証
- 問題なければ段階的に本番トラフィックへ展開
- 重大障害時は「生成物差し戻し + 旧manifest復元」で即時復旧

## 5. ロールバック条件

次のいずれかで自動ロールバック対象とする。

- WASM初期化失敗率がしきい値超過
- `style-patch` API 5xx率がしきい値超過
- `CCSS_RECIPE_RESOLUTION_FAILED` が急増（manifest/recipe不整合）
- `game:end` イベント後の結果画面遷移成功率が急落

## 6. 運用チェックリスト

- デプロイ前に manifest と DB `state_id` / `recipe_id` の整合確認
- 危険トークン拒否テスト（`@import` / `url(` / `expression(` / `<style`）を必須化
- レシピ外参照禁止テスト（未定義 `stateId` / 非アクティブ `recipe_id`）を必須化
- `style-patch` 応答に `cssText` が含まれず、`recipeIds` + `classList` のみ返ることを確認
- 生成CSSの危険セレクタ（全称/外部注入）スキャン
- キャッシュ無効化順序（CSS -> WASM -> JS Glue）を固定

## 7. 障害時対応

- 監視アラート受信後、まず `style-patch` API を機能フラグで停止
- 次にWASM生成物を前バージョンへ戻す
- 事後分析で `request_id` / `state_id` / `ccss_style_patches.id`（=`patch_id`）/ `applied_recipe_ids` を相関調査する
