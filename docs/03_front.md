# 🎨 フロントエンド・ゲーム設計仕様書

## 1. アーキテクチャと責任分界点

WebアプリケーションのUI（React）と、ゲームの描画・演算（KAPLAY）の役割を完全に分離し、単方向のデータフロー（React $\rightarrow$ KAPLAY）およびイベント通知（KAPLAY $\rightarrow$ React）のサイクルを構築します。

* **Reactの管轄 (UI層 / 状態管理)**:
画面全体のレイアウト、メニューUI、Supabase Authを利用した認証状態の管理、Hono（BFF）との非同期通信、およびKAPLAYの起動・停止（ライフサイクル管理）を担います。
* **KAPLAYの管轄 (ゲーム層 / 物理演算)**:
`<canvas>`要素内でのスワイプ操作による風の生成、物理演算、キャラクターやギミックの描画、および当たり判定（ゴール・ゲームオーバー）の検知に特化します。
* **連携インターフェース**:
`useRef`を用いてReactのレンダリングサイクルからKAPLAYのインスタンスを切り離します。KAPLAY側からReactのDOMを直接操作することは禁止し、KAPLAY内で発生した重要イベント（クリア、失敗など）はコールバック関数（`onGameEnd`等）を通じてReact側へ通知するイベント駆動型の設計とします。

## 2. ディレクトリ構成とコンポーネント設計

`apps/frontend/src/` 配下の構造を役割ごとに分割し、モジュールの再利用性と保守性を高めます。

| ディレクトリ | 役割と特徴 | 具体例 |
| --- | --- | --- |
| **`components/ui/`** | アプリケーション全体で使い回せる純粋なUI部品（Presentational Components）。API通信などの副作用を持ちません。 | `Button`, `Modal`, `LoadingSpinner` |
| **`features/`** | 特定のドメイン機能に紐づくモジュール群。API通信（データフェッチ）、状態管理、ビジネスロジックを内包します。 | `StageList` (一覧表示), `GimmickPalette` (エディタUI), `GameCanvas` (KAPLAY制御) |
| **`pages/`** | ルーティングに直接紐づく画面エントリーポイント。`features` や `ui` を組み合わせてページ全体のレイアウトを構成します。 | `HomePage`, `DashboardPage`, `PlayPage` |
| **`utils/`** | アプリケーション全体で共有される純粋関数（ユーティリティ）。 | APIクライアントラッパー、日時フォーマット関数 |

## 3. ルーティングと画面遷移フロー

各画面の役割と、API呼び出し（副作用）が発生するタイミングの定義です。

* **`/` (ホーム)**: 公式アカウントの公開ステージ一覧を取得（`GET /api/stages?author_id=<official>&is_published=true`）し、レンダリングします。
* **`/dashboard` (ダッシュボード)**: ログインユーザー自身の作成ステージ一覧を取得し、新規作成画面（`/create`）への導線を提供します。
* **`/create`, `/edit/[id]` (ステージ制作)**: ギミックの配置エディタを提供します。保存アクション時に `POST /api/stages` または `PUT /api/stages/:id` を呼び出します。
* **`/play/[id]` (プレイ画面)**: 対象ステージのJSONデータを取得（`GET /api/stages/:id`）し、KAPLAYに渡してゲームをマウントします。
* **`/result` (結果画面への遷移フロー)**:
1. KAPLAY内でクリアまたは失敗の判定イベントが発火。
2. Reactがイベントを検知し、バックグラウンドでプレイログを送信（`POST /api/stages/:id/play_logs`）。
3. 処理完了後、React Router等で `/result` へ画面遷移し、結果UIと「リトライ」「別ステージへ」の導線を表示します。



## 4. 状態管理と「クリア制限付き公開機能」のロジック

制作者自身が自作ステージをクリアできた場合のみ、DBへの「公開」を許可するフェイルセーフ機能の設計です。

1. **テストプレイの実行**: 制作画面（`/create`, `/edit/[id]`）から、エディタ上のデータを用いてテストプレイ（KAPLAY）を起動します。
2. **クリアフラグの更新**: KAPLAY内でゴール判定を満たした場合、コールバック経由でReactに通知され、コンポーネント内のローカルステート（例: `isClearChecked`）を `true` に更新します。
3. **公開アクションの制御**: `isClearChecked === true` の状態でのみ、UI上の「公開する」ボタンを活性化（非disabled化）します。
4. **APIペイロードの送信**: 公開実行時、`PUT /api/stages/:id` を呼び出し、`is_published: true` を送信します。
5. **フラグのリセット（重要）**: テストプレイ完了後、ユーザーがエディタ上でギミックを1つでも動かした場合（データの変更検知）、直ちに `isClearChecked` を `false` にリセットし、再テストプレイを強制します。

## 5. KAPLAY制御フック (`useKAPLAY`) とデータ共有

モノレポ（Turborepo等）の `packages/shared` で定義された型情報を活用し、フロントエンド・バックエンド・データベース間のデータ構造の整合性を担保するカスタムフックのインターフェースです。

```typescript
import type { StageData } from '@shared/types';
import { useEffect, useRef } from 'react';

interface UseKAPLAYProps {
  initialStageData?: StageData;     // APIから取得したステージ構成データ
  mode: 'play' | 'edit' | 'test';   // 起動モードの指定
  onGameEnd?: (isCleared: boolean) => void; // リザルト通知用コールバック
}

export const useKAPLAY = ({ initialStageData, mode, onGameEnd }: UseKAPLAYProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameInstanceRef = useRef<any>(null); // KAPLAYインスタンス保持用

  // KAPLAYの初期化とライフサイクル管理
  useEffect(() => {
    if (!canvasRef.current) return;
    // ... KAPLAYの初期化処理と initialStageData のマウント ...

    return () => {
      // アンマウント時のクリーンアップ処理（メモリリーク防止）
    };
  }, [initialStageData, mode]);

  /**
   * エディタ画面用: 現在のキャンバス上のギミック配置を抽出し、
   * DB保存用（stages.stage_data）の StageData 型にシリアライズする
   */
  const exportStageData = (): StageData => {
    // 実装: KAPLAY内のオブジェクト座標・属性をシリアライズ
    return generatedStageData;
  };

  return {
    canvasRef,
    exportStageData
  };
};
