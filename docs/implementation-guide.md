# 実装・引き継ぎガイド

この文書は、別のコーディングエージェントまたは開発者が、安全にゲームを改修するための技術的な入口である。体験仕様は `docs/game-design.md`、作業上の品質基準は `AGENTS.md` を正とする。

## 実行モデル

アプリはサーバー処理を持たないES Modulesベースの静的PWAである。

- `src/game-core.js`: DOMに依存しないテーマ、ラウンド、進行、保存値の検証
- `src/app.js`: 画面状態、Pointer Events、演出、Web Audio、保護者設定
- `src/index.html`: 固定画面、HUD、ダイアログ、共通レイヤー
- `src/styles.css`: 全画面シーン、スプライト、レスポンシブ、安全領域、アニメーション
- `assets/`: 画像スプライト
- `public/service-worker.js`: オフラインキャッシュ
- `scripts/build.mjs`: `src`、`assets`、`public`から`dist`を生成
- `tests/game-core.test.mjs`: ラウンドデータと進行の回帰試験

`dist/`は生成物であり、直接編集しない。

## 状態遷移

```text
home
  └─ startSession
      └─ activity intro
          └─ round 0 → round 1 → round 2
              ├─ next activity intro
              └─ finish

parent dialog は home / game / finish の上に独立して開く。
```

ゲーム内の一時状態はアクティビティごとにDOM要素へ保持せず、`state`とラウンドデータを基準にする。ラウンド切替時はイベント、タイマー、ヒントを必ず破棄する。

## 入力実装の規則

- `pointerdown`で操作開始、`pointermove`で即時追従、`pointerup`/`pointercancel`で確定または安全に復帰する。
- 子どもの指は大きく、座標は不正確である。見た目より広いヒット領域を用意する。
- ドラッグ距離はCSSピクセルの固定値だけでなく、対象サイズとviewportの小さい方を使って正規化する。
- タップ救済は本来の操作を置き換えず、同じ物理表現を短縮して実行する。
- 連続タッチや2本指で状態が壊れないよう、アクティブなpointerIdを1つに限定する。
- ラウンド完了中は入力をロックし、演出終了後に明示的に解除する。

## アニメーション実装の規則

- 重要な移動はWeb Animations APIで完了イベントを受け、タイマーだけに依存しない。
- 装飾的な反復はCSS animationを使用する。
- `reduceMotion`では移動距離と粒子数を減らすが、操作と結果の順番は保持する。
- たぬきの位置はアクティビティ開始時に名前付きのホーム位置へ設定する。pointer座標へ追従させない。

## スプライト規約

たぬきは3列×2行、果物と野菜は3列×3行、動物は3列×4行である。CSSの背景サイズはそれぞれ`300% 200%`、`300% 300%`、`300% 400%`にする。たぬきの例は以下のとおり。

```css
.sprite {
  background-repeat: no-repeat;
  background-size: 300% 200%;
}

.cell-0 { background-position: 0% 0%; }
.cell-1 { background-position: 50% 0%; }
.cell-2 { background-position: 100% 0%; }
.cell-3 { background-position: 0% 100%; }
.cell-4 { background-position: 50% 100%; }
.cell-5 { background-position: 100% 100%; }
```

3列×3行は縦位置を`0% / 50% / 100%`、3列×4行は`0% / 33.333% / 66.667% / 100%`として、`src/styles.css`の名前付きセルクラスで管理する。ゲームロジックから数値セルを直接CSSへ渡さず、`cell-apple`や`cell-elephant`のような意味のあるクラスを使う。

画像生成後は透明角、被写体占有率、各セルのはみ出し、色かぶりを検査する。スプライト位置が不均等な場合はCSSで無理に補正せず、素材を再生成する。

## テスト追加の目安

最低限、次を純粋関数の試験で固定する。

- アクティビティ順と保護者設定のテーマ絞り込み
- 各ラウンドの種類、個数、IDの一意性
- 3ラウンドで指定された動物12種が重複なくすべて登場すること
- 全ラウンドおよび全アクティビティの遷移
- 旧設定値を含む保存データの安全な読み込み
- ドラッグ進捗の境界値を計算する補助関数

ブラウザ試験では、正規ジェスチャーとタップ救済の両方、途中で離した場合、連打、全完了、設定画面を確認する。

## リリース手順

1. `docs/game-design.md`を実装に合わせる。
2. Service Workerの`CACHE_NAME`を新しい版へ上げ、追加アセットを`APP_FILES`へ登録する。
3. `npm test`
4. `npm run lint`
5. `npm run build`
6. `git diff --check`
7. iPad相当の横向き・縦向きで全操作試験とスクリーンショット確認
8. 意図したファイルだけをcommit/push
9. GitHub Actions完了を確認
10. 公開URLを新規ブラウザプロファイルで通し試験

## 既知の設計上の判断

- フレームワークを使用していないのは、依存を減らすこと自体が目的ではなく、現在の規模ではブラウザー標準だけで明快に保守できるため。
- ゲームは正解選択式ではない。教育要素は探索、因果関係、方向性、経路追従に置く。
- 音声を使用しないため、ヒントの視覚同期を変更する場合は必ず幼児目線で再検証する。
