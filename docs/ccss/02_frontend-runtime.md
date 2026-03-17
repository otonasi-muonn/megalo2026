# 🖥️ CCSSフロントランタイム設計（C/WASM + CSS + KAPLAY）

## 1. 責務分離

- **C/WASM**: HTML文字列生成、データ差し込み、セクション単位の再描画
- **CSS**: UI状態遷移（モーダル、タブ、ローディング、トースト）を制御
- **最小JS Glue**: `#ccss-ui-root` への `innerHTML` 貼り付け、`fetch`、`postMessage`、`canvas` 初期化、差し替え禁止領域チェック
- **KAPLAY**: `#ccss-game-root` 配下キャンバスの物理演算とゲームイベント通知（`onGameEnd`）

## 2. DOMコンテナ物理隔離ルール

- 画面DOMは次の2コンテナで固定する。
  - `#ccss-ui-root`: WASMが生成したHTMLを差し替えるUI領域
  - `#ccss-game-root`: KAPLAYが所有するキャンバス領域
- WASM再描画（`innerHTML` 差し替え・部分更新）は `#ccss-ui-root` のみ許可する。
- `#ccss-game-root` と配下 `canvas` はWASM/HTML差し替え対象外とし、KAPLAY初期化時に一度だけバインドする。

## 3. UI状態管理方式

UI状態は「非表示入力 + CSSセレクタ」で表現します。

- 非表示チェックボックス: `input[type=checkbox].ccss-state`
- 状態変更トリガー: `label[for=state-id]` とJS側 `checked` 書き換え
- 表示制御: `#state-id:checked ~ .panel-result` のような兄弟セレクタ
- `state-id` は説明用プレースホルダ。実装では manifest の `stateId` に対応するDOM id（CSSセレクタで利用可能な形へエスケープ済み）を使う。

## 4. 画面別実行モデル

- **ホーム/ダッシュボード**
  - 初期HTMLをWASM生成
  - 一覧更新はAPI結果で対象セクションだけ差し替え
- **ステージ制作**
  - 左右パネルはWASM+CSS、中央キャンバスはKAPLAY
  - 保存フォームは非表示iframe送信（ハック要件）
- **プレイ/結果**
  - プレイ中はKAPLAY主導
  - 終了イベント受信後、CSS状態を `ccss:play:result:success` または `ccss:play:result:fail` に遷移

## 5. イベント境界契約

| 発火元 | イベント名 | 受信側 | 役割 |
| --- | --- | --- | --- |
| KAPLAY | `game:end` | JS Glue | クリア/失敗情報を受け取り、ログ保存APIを呼ぶ |
| JS Glue | `ui:state:set` | CSS状態管理 | 該当stateチェックボックスを更新 |
| API | `style:patch` | JS Glue | 返却CSSを差し替えてUI再描画を誘導 |
| WASM | `view:rendered` | JS Glue | 次の非同期処理（画像遅延読み込み等）へ移行 |

## 6. アクセシビリティ方針

- CSSハック基盤でも `button` / `label` の役割を維持
- キーボード遷移可能なフォーカス順を定義
- 状態切替時は `aria-live` でメッセージ更新

## 7. 失敗時フォールバック

- WASM初期化失敗時は静的HTMLに退避し、最低限の一覧閲覧を提供
- CSSパッチ取得失敗時は前回キャッシュを維持し、再試行導線を表示
- KAPLAY初期化失敗時は「編集のみ可能」モードへ降格
- 差し替え禁止領域（`#ccss-game-root`）への更新要求を検知した場合は処理を中断し、直前UIを維持したまま `#ccss-ui-root` のみ再描画再試行する

## 8. 実装ガードレール

- UI状態の真実は1つ（状態ID）に限定し、JSで別の状態を持たない
- KAPLAYはDOM操作しない（イベント通知のみ）
- CSSセレクタの深さを3階層以内に抑え、可読性を維持
- JS Glueは差し替え前に「対象が `#ccss-ui-root` か」「断片に `#ccss-game-root` / `canvas` が含まれないか」を必ず検証する
