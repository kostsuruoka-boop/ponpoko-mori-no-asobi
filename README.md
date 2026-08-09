# ぽんぽこ もりの だいぼうけん

たぬきと一緒に、のうえん・どうぶつ・ひらがな・ABCで遊ぶiPad向けの静的Webゲーム。
対象は**1歳10ヶ月**。読字も言語理解も前提にせず、**操作はタップだけ**。

公開版: https://kostsuruoka-boop.github.io/ponpoko-mori-no-asobi/

iPadではSafariの共有メニューから「ホーム画面に追加」を選ぶと、アプリのように全画面で遊べます。
縦向き・横向きの両方に対応し、一度読み込めばオフラインでも起動します。

## 4つのあそび

| あそび | 知育目標 | やること |
| --- | --- | --- |
| **のうえん** | 果物・野菜の名前を音と絵で結びつける／どこで育つか | たぬきが頼んだものを畑から探して押す。木・棚・茂み・つる・土の中と、実際の育ち方どおりに実っている |
| **どうぶつ** | 輪郭だけで対象を見分ける／動物の名前と鳴き声 | 黒い影がひとつ出る。合う動物を選んで押す。2択→3択→4択と難しくなる |
| **ひらがな** | 文字の形と音／五十音表という地図 | 五十音表が全部並ぶ。頼まれた文字を探して押す。見つけた文字は金色に残る |
| **ABC** | 大文字と小文字／文字の音と単語 | A〜Zが全部並ぶ。各升は `Aa` と併記。見つけた文字は色が付いて残る |

**遊ぶたびに盤面と出題順が変わります。** それでも「3ラウンドで18種類ぜんぶ出る」「同じ文字は1回のあそびで二度出ない」といった保証は崩れません。

どのあそびにも**減点・制限時間・ゲームオーバーはありません**。
まちがえて押しても叱られず、**押したものが自分の名前を教えてくれます**。
何をすればいいか分からないときは、待っているだけで誘導が段階的に強くなり、最後は**押すべきものの上に指が出ます**。

## 収録内容

- 果物: りんご、みかん、ぶどう、もも、さくらんぼ、レモン、いちご、すいか、バナナ
- 野菜: だいこん、キャベツ、かぼちゃ、にんじん、たまねぎ、えだまめ、きゅうり、なす、さつまいも
- 動物: いぬ、ねこ、ぱんだ、ライオン、ぞう、キリン、かば、さる、しまうま、ラクダ、ぶた、とり
- 文字: ひらがな46文字（五十音図）、アルファベットA〜Z

たぬきは動物一覧には含めない、独立した主役です。

## ドキュメント

- [`docs/product-requirements.md`](./docs/product-requirements.md) — 施主要求の正本。迷ったらここに戻る
- [`docs/game-design.md`](./docs/game-design.md) — 4つのあそびの設計、誘導、音、完成条件
- [`docs/implementation-guide.md`](./docs/implementation-guide.md) — なぜこの実装なのか（iPad対応、シーン寿命、素材、試験）
- [`docs/asset-generation.md`](./docs/asset-generation.md) — 画像素材の生成と加工の記録
- [`AGENTS.md`](./AGENTS.md) — コーディングエージェント向けの規約

## 開発

Node.js 20以上。アプリ本体に外部ランタイム依存はありません。

```bash
npm test        # ゲームルールの試験（DOM不要）
npm run lint    # 全ソースの構文検査
npm run build   # dist/ を生成
npm run dev     # ビルドして http://localhost:4173 で配信
```

実ブラウザでの通し確認:

```bash
npm run build
python3 -m http.server 4173 -d dist &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9250 \
  --user-data-dir=/tmp/ponpoko-profile --window-size=1194,834 \
  http://127.0.0.1:4173/index.html &
node scripts/browser-smoke.mjs 9250 landscape
```

画像素材を作り直したとき:

```bash
.venv/bin/python scripts/remove-chroma.py \
  --input tmp/imagegen/<sheet>-chroma.png --out assets/<sheet>.png  # 背景を透明化
.venv/bin/python scripts/make-sprites.py   # シートを1件1ファイルに分割
.venv/bin/python scripts/make-icons.py     # ホーム画面アイコンを生成
```

## 構成

```text
src/       index.html / styles.css / content.js / game-core.js / audio.js / scenery.js / app.js
assets/    元のスプライトシート（配布しない）
assets/sprites/  分割済みスプライト（配布する）
public/    マニフェスト、アイコン、Service Worker
scripts/   ビルド、素材生成、ブラウザ通し試験
tests/     DOMに依存しないゲームルール試験
docs/      要求、設計、実装引き継ぎ、素材記録
```

`dist/` は生成物です。直接編集しません。
`main` への push で GitHub Actions が試験・ビルドし、GitHub Pages へ公開します。

設定・完了回数・文字カリキュラム位置は端末の `localStorage` だけに保存します。
外部送信、広告、解析、課金は一切ありません。
