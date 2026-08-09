# 画像素材の生成と加工

すべてこのゲーム専用のオリジナル素材。画像生成でクロマキー背景のシートを作り、
`scripts/remove-chroma.py` でRGBA PNGに変換する。生成元は `tmp/imagegen/` に置くが、
`tmp/` はGit管理対象外。

## パイプライン

```text
生成（クロマキー） → 透明化 → assets/*.png（元シート・配布しない）
                              ↓ scripts/make-sprites.py
                          assets/sprites/*.png（1件1ファイル・配布する）
                              ↓ scripts/make-icons.py
                          public/apple-touch-icon.png ほか
```

```bash
.venv/bin/python scripts/remove-chroma.py \
  --input tmp/imagegen/<sheet>-chroma.png --out assets/<sheet>.png
.venv/bin/python scripts/make-sprites.py
.venv/bin/python scripts/make-icons.py
npm run build
```

## 元シート（`assets/`）

- `tanuki-sprites-v2.png`: たぬき 3列×2行（手を振る／走る／手を伸ばす／かご／押す／跳ぶ）
- `fruit-sprites-v1.png`: 果物9種 3列×3行
- `vegetable-sprites-v1.png`: 野菜9種 3列×3行
- `animal-sprites-v1.png`: 動物12種 3列×4行
- `abc-sprites-v1.png`: ABC用の絵12種 3列×4行（さかな／かまくら／ジュース／たこ／巣／王冠／うさぎ／とら／かさ／バイオリン／木琴／ヨーヨー）

すべてのセルは正方形。分割時に拡大縮小しないので、さくらんぼとスイカの大小関係が保たれる。

## なぜ分割するのか

CSSスプライトシートを `background-size: 300% 300%` で切り出すと、
表示サイズが格子の倍数にならない端末で**隣のセルが数ピクセルはみ出す**。
実際に「にんじんの横に大根の白い先端が浮かぶ」不具合として出た。

さらに元シートには、生成時にセル境界をまたいだ描画が残っている。
`make-sprites.py` は連結成分解析で**最大成分の6%未満の孤立した断片を削除**する。
さくらんぼの2粒やバナナの房は連結しているので残る。ねこのヒゲも残る。

分割時に検出された断片: さくらんぼ、にんじん、ねこ、ぶた、たぬき（跳ぶ）、たこ、巣、うさぎ、バイオリン。

## 透明化（`scripts/remove-chroma.py`）

キー色は既定で**画像の外周から自動サンプリング**する。生成器は依頼した #00ff00 をきっちり出さないため、
決め打ちより安全である（実測 rgb(2,248,3)）。

マットは2つのしきい値で作る。キー色との距離が `--transparent-threshold` 以下なら完全透明、
`--opaque-threshold` 以上なら完全不透明、その間は徐々に薄くする。この帯があるおかげで
アンチエイリアスされた輪郭がギザギザにならない。ディスピルは**この帯の中だけ**に効かせるので、
本物の緑の葉や黄・茶の毛色は一切触らない。

既定値 `95 / 160 / 0.95` は、出荷済みの動物シートを再処理して released 版と輪郭を見比べて決めた。
これより緩いと、輪郭に幅1〜2pxの緑の縁が残る。マゼンタ背景（果物・野菜）でも同じ既定値でよい。

素材を差し替えたら必ず、透明な角・輪郭の色・顔・全身・セル越境を**目視**で検査する。

## ABC用シート（2026-08-09 追加）

ABCモードのごほうびカードで、既存素材に絵がなかった12文字ぶん。

| 文字 | 絵 | 文字 | 絵 |
| --- | --- | --- | --- |
| F | Fish | Q | Queen |
| I | Igloo | R | Rabbit |
| J | Juice | T | Tiger |
| K | Kite | U | Umbrella |
| N | Nest | V | Violin |
|  |  | X | Xylophone |
|  |  | Y | Yoyo |

これで**A〜Z の26文字すべてに絵がある**。ビルドは `assets/sprites/abc-fish.png` の有無を見て
`window.__ponpokoAssets.abc` を切り替えるので、コード側の分岐は不要。

### 生成プロンプト

```text
Use case: stylized-concept
Asset type: production alphabet picture sprite sheet for a toddler iPad web game
Primary request: Create one strict 3-column by 4-row sprite sheet containing exactly twelve isolated objects in this exact cell order.
Row 1: a bright orange goldfish seen from the side; a white and blue domed igloo with an arched entrance; a tall glass of orange juice with a straw.
Row 2: a red diamond kite with a ribbon tail; a round brown twig nest holding three pale blue eggs; a golden crown with red and blue jewels.
Row 3: a white and brown sitting rabbit with upright ears; a friendly orange tiger cub with black stripes, sitting; a bright red open umbrella with a curved handle.
Row 4: a wooden violin with a bow; a colourful toy xylophone with rainbow bars and two mallets; a red and white yo-yo with its string.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for local background removal; one uniform color with no shadows, gradients, texture, floor plane, lighting variation, or frames.
Style/medium: polished rounded 3D children's storybook game art, soft tactile clay-and-felt appearance, friendly and premium, for ages 1-3, matching a cheerful rounded tanuki protagonist and an existing set of clay-style fruit, vegetable and animal sprites.
Composition/framing: exact evenly spaced 3 by 4 grid; every object centered independently in its cell; consistent visual weight and generous padding; full silhouette; no overlap or cell crossing. Keep the umbrella and the kite entirely inside their cells.
Lighting/mood: bright soft studio lighting on the objects only; warm, joyful, immediately recognizable silhouettes.
Constraints: exactly twelve objects and no extras; no grid lines; no scenery; no labels; no text; no letters; no numbers; no cast or contact shadows; no reflections; no watermark; crisp separated edges; do not use #00ff00 anywhere in the objects.
Avoid: realistic photography, scary expressions, thin fragile parts, clutter, cropping, inconsistent style.
```

たこ・うさぎ・バイオリンのセルでは、隣のセルへはみ出した描画が実際に発生した。
`make-sprites.py` の連結成分フィルタがそれだけを除去し、
バイオリンの弓・木琴のばち・たこのリボン・ヨーヨーの紐は残っている（目視確認済み）。

`tests/game-core.test.mjs` の
`every picture the game can name has a sprite file on disk` が、
コードが参照する絵と実ファイルの対応を固定している。

## アイコン

`scripts/make-icons.py` がたぬきの「手を振る」ポーズから生成する。

- `public/apple-touch-icon.png` (180×180, 角丸なし・不透明) — iOSはPNGが無いとスクリーンショットをアイコンに使う
- `public/icon-192.png` / `icon-512.png` — マニフェスト用
- `public/icon-maskable-512.png` — 安全領域内に収めたマスカブル版
