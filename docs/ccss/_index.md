# 📚 CCSS設計ドキュメント目次

## 目的

本ディレクトリは、`docs/CCSS_complete.md` で定義した構想を実装可能な設計粒度へ分解した詳細設計書群です。  
既存の `docs/01_api-design.md` など（現行プロダクト向け）は変更せず、CCSSプロダクト向け設計を独立管理します。

## 関連ドキュメント

- [構想書（起点）: ../CCSS_complete.md](../CCSS_complete.md)
- [01. アーキテクチャ・変換器設計](./01_architecture-and-compiler.md)
- [02. フロントランタイム設計](./02_frontend-runtime.md)
- [03. API設計](./03_api-design.md)
- [04. DB設計](./04_db-design.md)
- [05. ビルド・デプロイ設計](./05_build-and-deployment.md)
- [06. リスク・検証設計](./06_risk-and-validation.md)

## 読み順（推奨）

1. `01_architecture-and-compiler.md`
2. `02_frontend-runtime.md`
3. `03_api-design.md`
4. `04_db-design.md`
5. `05_build-and-deployment.md`
6. `06_risk-and-validation.md`

## 設計ポリシー

- 「技術の無駄遣い」コンセプトは保持する。
- ただし、実装時に破綻しないよう入力制約・責務境界・失敗時挙動を明記する。
- UI層（C/WASM + CSS）とゲーム層（KAPLAY JS）とAPI層（Hono）の接続点はイベント契約で固定する。
