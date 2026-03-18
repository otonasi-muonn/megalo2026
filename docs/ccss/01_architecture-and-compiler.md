# 🧠 CCSSアーキテクチャ・独立変換器設計

## 1. システム全体像

CCSSは次の3層を明確に分離して構成します。

- **変換層（独立コンパイラ）**: Reactソースを解析し、Cコード・CSS・メタ情報へ変換する。
- **UI実行層（C/WASM + CSS）**: HTML文字列を生成し、状態遷移はCSSセレクタで実現する。
- **ゲーム実行層（KAPLAY JS）**: キャンバス領域のみで物理演算と入力処理を行う。
- **DOM境界層**: `#ccss-ui-root`（WASM差し替え専用）と `#ccss-game-root`（KAPLAY専用）を物理分離する。

## 2. 変換対象Reactサブセット

ハッカソン期間で破綻させないため、入力Reactを次に制限します。

- 関数コンポーネントのみ（Class Component不可）
- JSXは `div/button/input/label/section/main/nav/canvas` のみ許可
- `useState` は boolean / enum文字列のみ許可（数値計算・関数更新は禁止）
- 条件分岐は `state === literal` と三項演算の限定パターンのみ
- `map` は静的配列またはAPIレスポンスの単純反復のみ
- 任意の副作用フック（`useEffect`）はUI遷移に関与しない用途へ限定

## 3. 変換パイプライン

1. **Parse**: TypeScript ASTを生成
2. **Normalize**: JSXと状態表現を中間表現（IR）へ正規化
3. **Analyze**: UI状態遷移グラフを構築し、未定義遷移を検出
4. **Emit C**: HTML断片生成用のC関数群を出力
5. **Emit CSS**: 状態遷移を表すチェックボックス/擬似クラスCSSを出力
6. **Emit Manifest**: ルート情報、状態ID、API連携点をJSONで出力

## 4. 出力構造

```text
packages/
  ccss-compiler/
    dist/
      ccss.manifest.json
      ui.generated.c
      ui.generated.css
      warnings.json
```

- `ui.generated.c`: 画面断片描画と差し替え関数
- `ui.generated.css`: 状態切り替え・表示制御ルール
- `ccss.manifest.json`: 状態ID、イベント名、APIエンドポイント対応表

## 5. 状態ID規約

- 形式: `ccss:<page>:<component>:<state>`
- 例: `ccss:dashboard:stage-card:menu-open`
- CSSセレクタ競合を防ぐため、ビルド時に重複ID検査を必須化

## 6. DOMコンテナ物理隔離規約

- ランタイムDOMは `#ccss-ui-root`（WASM UI差し替え専用）と `#ccss-game-root`（KAPLAYキャンバス専用）に分離する。
- WASMが生成する再描画断片・差し替え関数は `#ccss-ui-root` 配下のみを対象とし、他コンテナを書き換えない。
- `#ccss-game-root` の所有権はKAPLAYに固定し、WASM出力HTML・API由来HTMLの差し替え対象外とする。
- 最小JS Glueは差し替え前に禁止領域（`#ccss-game-root` とその子孫）を検査し、検知時は差し替えを中断する。
- 中断時は既存DOMを保持し、`#ccss-ui-root` のみ再描画再試行を許可する（KAPLAYキャンバス再生成は禁止）。

## 7. エラー設計

- 変換不能構文はエラー停止（警告で継続しない）
- 警告は `warnings.json` に記録し、CIで閾値超過時に失敗
- 例外発生時は「入力ファイル・ノード位置・代替提案」を必ず返す

## 8. 非目標（今回やらないこと）

- React全構文の網羅変換
- 双方向データバインディング
- ランタイムでの動的コンパイル
- SSR互換の完全保証

## 9. 実装開始前チェック

- サブセット仕様が `06_risk-and-validation.md` の検証項目と一致していること
- `02_frontend-runtime.md` の状態遷移規約とID命名規約が一致していること
