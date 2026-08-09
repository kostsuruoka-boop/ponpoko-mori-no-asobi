# 実装・引き継ぎガイド

この文書は、別のコーディングエージェントまたは開発者が現行ゲームを安全に改修するための技術的な入口である。体験仕様は`docs/game-design.md`、品質基準は`AGENTS.md`を正とする。

## 実行モデル

サーバー処理やランタイム外部依存を持たないES Modulesベースの静的PWAである。

- `src/game-core.js`: 4モードのカタログ、ラウンド、文字カリキュラム、保存値検証、座標補助
- `src/audio.js`: Web Audio効果音とSpeech Synthesis音声を担当する`AudioDirector`
- `src/app.js`: 画面状態、シーン寿命、Pointer Events、DOM、演出、保存、保護者設定
- `src/index.html`: ホーム、ゲーム、完成、保護者ダイアログの固定骨格
- `src/styles.css`: 4モード、スプライト、縦横レイアウト、安全領域、アニメーション
- `assets/`: たぬき、果物、野菜、動物の画像スプライト
- `public/service-worker.js`: オフラインキャッシュ
- `scripts/build.mjs`: `src`、`assets`、`public`から`dist`を生成
- `tests/game-core.test.mjs`: DOM非依存のデータと進行の回帰試験

`dist/`は生成物なので直接編集しない。

## 状態遷移

```text
home
  └─ mode card (farm | animal | hiragana | alphabet)
      └─ activity intro
          └─ round 0 complete board ─ user next
              └─ round 1 complete board ─ user next
                  └─ round 2 complete board ─ user finish
                      └─ mode-specific finish
                          ├─ replay same mode
                          └─ home / choose another mode

parent dialogはhome / gameの上に独立して開く。
```

モードを連結した長い自動セッションにはしない。子どもがホームの4カードから直接選び、3ラウンドで一度完結させる。

## シーンライフサイクル

複数回プレイ時の画面破綻を防ぐ最重要部分である。

`clearRuntime()`は次の順で旧シーンを無効化する。

1. `state.lifecycle`を増加する。
2. 現在の`AbortController`をabortし、Pointer Eventを解除する。
3. 追跡中の全`setTimeout`をclearする。
4. 追跡中の全Web Animationをcancelする。
5. ヒント、粒子、ラウンド完了UIを消す。
6. 再生中の効果音とSpeech Synthesisキューを止める。

`schedule()`は作成時のlifecycleを閉包し、番号が一致する場合だけcallbackを実行する。Web Animationも同じ番号を確認してから完了処理を呼ぶ。画面切替後の古い処理を直接呼ぶタイマーや`animation.finished`を追加してはいけない。

## ラウンド生成

`createRound(activity, roundIndex, options)`だけを入口にする。

- `farm`: 6個の作物と生育場所を返す。3ラウンドで18種類を重複なく扱う。
- `animal`: 4匹と、別順序へshuffleした4個の影を返す。
- `hiragana` / `alphabet`: 保存された開始位置から3文字と、各文字の3択を返す。

文字カリキュラムはセッション完了時だけ`nextCurriculumIndex()`で9進める。途中離脱では進めない。

## Pointer Eventの規則

- `pointerdown`で1つの`pointerId`を保持し、`setPointerCapture()`する。
- `pointermove`では`--drag-x`と`--drag-y`だけを更新し、指へ即時追従させる。
- `pointerup` / `pointercancel`の両方を同じ終了関数へ接続する。
- 正解判定後は`state.busy`で並行入力を止め、永続表示先へ移動してから解除する。
- ドロップ判定は`isPointInsideRect()`のpaddingを使い、見た目より24〜35px広くする。
- 操作不足は元の場所へ戻し、減点しない。
- 全ラウンドイベントへ`state.roundAbort.signal`を渡す。

### 救済入力

- 農園: 同じ作物を2回タップ
- 動物: 同じ動物を2回タップ
- 文字: 見本と同じ文字を1回タップ

救済入力は本来のドラッグを置き換える主操作ではない。最初のアイドルヒントは必ずドラッグを実演する。

## 永続する完成盤

操作対象を消して終わらせない。

- 農園: `harvest-slot`へ作物のクローンを追加する。
- 動物: `animal-home`内の影を消し、カラー動物を表示する。
- 文字: `letter-slot`へ字形を追加する。

最後の1個が入った後もDOMを維持し、`#round-complete`の大きな次ボタンだけを重ねる。自動で`renderRound()`を呼ばない。

## AudioDirector

`src/audio.js`は設定値をgetterで受け取り、効果音と音声を分離する。

- `play(kind)`: Web Audio APIで短い音を生成する。
- `speak(text, lang)`: 対象言語のローカルvoiceを優先し、Speech Synthesisへ1件だけ送る。
- `stop()`: 追跡中sourceと音声キューを停止する。

音声は学習対象の名前・文字だけに使う。操作説明文を読み上げない。ABCへは`en-US`、それ以外へは`ja-JP`を指定する。

## たぬき配置

モードごとの基準位置は`ACTIVITY_META`に置く。`positionActor()`が実際のsprite幅とviewport幅から左右8pxの安全域へclampする。端末回転時にも再計算する。

ポーズは`setPose()`を通して入れ替え、古い`pose-*`を必ず除去する。成功時の`reactTanuki()`はポーズ、ジャンプ、感情バブルを同期させる。対象物をpointer座標へ追従させる用途には使わない。

## スプライト規約

- たぬき: 3列×2行、`background-size: 300% 200%`
- 果物・野菜: 3列×3行、`background-size: 300% 300%`
- 動物: 3列×4行、`background-size: 300% 400%`

ゲームロジックから数値セルを渡さず、`cell-apple`、`cell-elephant`の意味クラスを使う。文字は画像にせず、端末の丸ゴシック系fontで描画する。

## 保存形式

現在のキーは次のとおり。

- `ponpoko-adventure-settings-v5`: `effects`、`voice`、`reduceMotion`
- `ponpoko-adventure-progress-v5`: `sessions`、モード別`completed`、`curriculum.hiragana`、`curriculum.alphabet`

`loadSavedState()`で旧v3の`sound`を`effects`と`voice`へ移行する。壊れたJSON、負数、範囲外カリキュラムを常に正規化する。

## テスト

純粋関数試験では最低限次を固定する。

- 指定された果物9、野菜9、動物12の完全な一覧
- 3農園ラウンドで18種類が1回ずつ登場すること
- きゅうり・ぶどうが棚、根菜だけが土中などの生育場所
- 3動物ラウンドで12種類が1回ずつ登場し、影との集合が一致すること
- ひらがな46文字、英字26文字と大文字・小文字
- 全文字の3択に正解が1個だけ含まれること
- カリキュラムの周回、保存値移行、ドラッグ座標境界

ブラウザ通し試験では次を縦横両方で実行する。

1. 4モードを正規ドラッグと救済入力の両方で完走。
2. 各完成盤に6作物、4動物、3文字が残ること。
3. 農園18、動物12、ひらがな9、ABC9を1セッションで処理。
4. 収集アニメーション中にホームへ戻り、別モードを開始。
5. 旧callbackが新モードへ割り込まないこと。
6. たぬきの全身、overflow、保護者ゲート、保存回数を確認。

## リリース手順

1. `docs/game-design.md`を実装に合わせる。
2. Service Workerの`CACHE_NAME`を上げ、追加モジュールを`APP_FILES`へ登録する。
3. `npm test`
4. `npm run lint`
5. `npm run build`
6. `git diff --check`
7. iPad相当の横向き・縦向きで完全通し試験とスクリーンショット確認
8. 意図したファイルだけをcommit / push
9. GitHub Actions完了を確認
10. 公開URLを新規ブラウザプロファイルで再度完走
