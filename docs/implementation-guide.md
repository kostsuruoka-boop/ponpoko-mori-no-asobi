# 実装引き継ぎ

設計の正本は [`game-design.md`](./game-design.md)、要求の正本は [`product-requirements.md`](./product-requirements.md)。
このファイルは**なぜこの実装になっているか**を残す。特に、見た目からは理由がわからない決定を書く。

---

## 1. iPadで「画面は出るがタップが全部効かない」問題

v5 の最大の不具合。原因は**JavaScriptが1行も走っていなかった**こと。
HTMLとCSSだけで画面は完成するので、描画は正常に見えたまま全ボタンが死ぬ。

対策は4段構えで、どれか1つが外れても復旧できるようにしてある。

### 1.1 ES Modules をやめ、単一のクラシックスクリプトにする

`scripts/build.mjs` が `src/*.js` を依存順に連結し、`import` / `export` を剥がして
1つのIIFEにまとめて `dist/app.js` を出力する。`index.html` は `<script defer src="./app.js">` で読む。

理由: 古いiPadOSでは Service Worker 経由の `type="module"` 読み込みが失敗する事例があり、
その場合モジュールが1つも評価されずイベント登録が全滅する。モジュール読み込みという失敗経路自体を消した。

ビルドは出力を `node --check` にかけ、`import` が残っていないかも検査する。壊れたバンドルは娘のiPadではなくCIで落ちる。

### 1.2 構文の下限を Safari 13.4 に固定

使わないもの: `||=` `&&=` `??=`、`Array.prototype.at`、`replaceChildren`、
`addEventListener` の `signal`、`Object.hasOwn`、`structuredClone`、`<dialog>`。
CSSでは `inset` 短縮形、`aspect-ratio`、flexboxの `gap`、`translate`/`rotate`/`scale` 単独プロパティ、
`:is()` `:where()` `:has()`、`color-mix()`、`svh`/`dvh` を使わない。

古い1台のためにモダン構文を捨てるのは安い取引である。このゲームに新しいAPIが必要な処理はない。

### 1.3 起動監視と自己修復

`index.html` の先頭に、モダン構文を使わないクラシックスクリプトを置いている。
エラーを記録し、5秒経っても `window.__ponpokoBooted` が立たなければ**画面に理由を出す**。
「なおして もういちど」ボタンは Cache Storage と Service Worker を消して再読込する。

これで「黙って動かない」状態が原理的になくなる。保護者メニューにも同じ再インストールボタンがある。

### 1.4 Service Worker をアプリシェルだけ network-first にする

HTML/CSS/JS はネットワーク優先、画像はキャッシュ優先。
壊れたビルドがキャッシュに焼き付いて、外から直せなくなる事故を防ぐ。

キャッシュ名は**ビルドが出力内容のSHA-256から自動生成**する（`ponpoko-<hash>`）。
手でバージョンを上げ忘れて古い絵が出続ける事故を、人間の記憶に頼らず防ぐ。

`localStorage` へのアクセスはすべて try/catch。Cookie ブロック環境で例外を投げても起動を止めない。

---

## 1.5 アニメーションの完了は2重に保証する

シーンの進行は「収穫 → 飛ぶ → 着地 → 次のお願い」とアニメーションの完了で繋がっている。
ところが**ページが非表示のあいだ、ブラウザは Web Animations の `finish` を配送しない**。
iPadで途中でアプリを切り替えると、戻ってきた盤面が反応しなくなる。

`animate()` は `onfinish` に加えて**所要時間＋140msのタイマーでも同じコールバックを武装**し、
先に来たほうが1回だけ実行する。ブラウザの通知に頼らないので、盤面が止まることがない。

## 1.6 引っ張る操作

`installPull()` が Pointer Events で実装する。

- 生育地ごとに向きが決まっている（`scenery.js` の `pull`）。頭上は下へ、地面は上へ。
- **正しい向きの移動量しか見ない**ので、逆に引いてもスプライトは動かない。この「動かなさ」が教え方になる。
- しきい値は44px。届かずに離すとCSSトランジションでバネのように戻る（掴んでいる間だけ `transition: none`）。
- `.produce` は `touch-action: none`。ブラウザに縦ドラッグを取られないため。
- 各作物に `.pull-cue`（矢印）を常時出す。向きは同じ `data-pull` から決まる。
  全部に出るので答えのヒントにならず、指を置くと消える。
- 誘導の指も同じ `data-pull` を読んで引っ張る動きをする。
  **向きの宣言は `content.js` の `HABITAT_PULL` 1箇所だけ**で、入力・矢印・誘導の指・盤面の列がすべてそこから出る。ズレようがない。
- 同じものを3回タップしたら収穫する。詰まったまま進めない事故を防ぐ逃げ道。

## 2. シーンの寿命

`state.lifecycle` が世代番号。`clearRuntime()` がこれを進め、
登録済みの `setTimeout` / `setInterval` / イベントリスナーをすべて破棄する。

- `schedule()` はコールバック実行時に世代を照合し、古い世代なら何もしない。
- `on()` で登録したリスナーは配列に控え、`clearRuntime()` で確実に外す（`AbortController` は使えないため）。
- `animate()` も世代を照合してから `onFinish` を呼ぶ。

アニメーション中にホームへ戻り、別モードを開く操作をブラウザ試験に含めている。

---

## 2.5 ビルド版数

`scripts/build.mjs` が入力（`src/`＋`assets/sprites/`）のSHA-256から版数を作り、
**バンドル内の `BUILD_REVISION`・Service Workerのキャッシュ名・保護者メニューの表示**に同じ値を入れる。

ブラウザ試験は `dist/app.js` の版数と `window.__ponpoko.revision` を突き合わせ、
食い違えば1度だけ強制リロードし、それでも違えば落ちる。
**古いビルドを検証してしまう事故**は実際に2回起きたので、構造で防いでいる。

## 3. 質問（Quest）という単位

「いま何を頼んでいるか」を `state.quest` が持つ。中身は
対象ID、誤タップ数、最終操作時刻、ヒント段階、そして4つのコールバック
（`announce` / `findTarget` / `onCorrect` / `onWrong`）。

4種類の出題モードはこの1つの仕組みに乗っている。ヒント段階の計算は `hintStage()` として
DOMなしで試験できる純関数に切り出してある。

`free: true` の質問は「お願いがない盤面」を表す。文字ばたけがこれで、
どれを取っても正解として扱われる。

**1問終わってから次の問題が出るまでの間、`state.quest` は `null`**。
この空白がないと、答え終わった問題に対して次のタップが採点されてしまう
（実際にブラウザ試験で見つけた不具合）。

---

## 4. 画像素材

### 4.1 スプライトシートを分割している理由

元素材は3×3や3×4のシートだが、CSS の `background-size: 300% 300%` で切り出すと
端末の実サイズが格子の倍数にならないとき**隣のセルが数ピクセルはみ出す**。
にんじんの横に大根の白い先端が浮かぶ、という形で実際に出た。

`scripts/make-sprites.py` が1件1ファイルに切り出し、`background-size: contain` で使う。
さらに、セル境界をまたいだ**孤立した断片を連結成分解析で除去**する
（最大成分の6%未満を破棄）。さくらんぼの2粒やバナナの房は連結しているので残る。

### 4.2 配布物

`assets/*.png`（元シート）はリポジトリに残すが**配布しない**。
`dist` には `assets/sprites/` だけを入れる。オフライン配信量が倍になるのを避けるため。

### 4.3 アイコン

`scripts/make-icons.py` がたぬきから `apple-touch-icon.png` と各サイズを生成する。
iOSはPNGが無いとホーム画面アイコンにスクリーンショットを使う。

---

## 5. 生育地SVG

`src/scenery.js` に手書きSVG。各生育地は 200×200 のビューボックスで、
`height:100%; width:auto` で描くので**どんな区画の縦横比でも歪まない**。

- `back`: 作物の背面（幹・樹冠・棚・土の奥）
- `front`: 作物の前面（土の畝・手前の葉）
- `anchorX` / `anchorY`: 作物を置く位置（％）
- `scale`: 区画に対する作物の大きさ
- `rise`: 収穫時に持ち上がる量（土物だけ大きい）

作物ボタンは正方形（区画のSVGが正方形なので幅％＝高さ％が正方形になる）。

---

## 6. 試験

| 種別 | コマンド | 見るもの |
| --- | --- | --- |
| ルール試験 | `npm test` | 出題内容、カリキュラム、ヒント段階、保存データの正規化。DOM不要 |
| 構文検査 | `npm run lint` | 全ソースと Service Worker |
| ビルド検査 | `npm run build` | バンドルの構文、`import` 残存、`type="module"` 混入 |
| ブラウザ試験 | `node scripts/browser-smoke.mjs` | 実ブラウザで全6モードを**各モードの本来の操作で**完走、コンソールエラー、はみ出し、タップ対象の大きさ、**誘導が指す先＝触るべき要素**かつ**指の動き＝必要な操作**、誤選択で進行が壊れないこと、古いビルドでないこと |

ブラウザ試験は毎回 Cache Storage と Service Worker を消してから始める。
古いキャッシュが不具合を隠すのを防ぐため（実際に隠していた）。

### ブラウザ試験の動かし方

```bash
npm run build
python3 -m http.server 4173 -d dist &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9250 --mute-audio \
  --user-data-dir=/tmp/ponpoko-profile --window-size=1194,834 \
  http://127.0.0.1:4173/index.html &
node scripts/browser-smoke.mjs 9250 landscape
```

縦向きは `--window-size=834,1194` で同じことをする。

---

## 7. 公開

`main` への push で GitHub Actions が試験・ビルドし、`dist/` を GitHub Pages へ出す。
公開後は**実機のホーム画面アイコンから**開いて確認する。ブラウザで開けたことは確認にならない。
