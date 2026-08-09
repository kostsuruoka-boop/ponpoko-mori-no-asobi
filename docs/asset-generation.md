# 画像素材の生成と加工

すべてこのゲーム専用のオリジナル素材。OpenAIの画像生成でクロマキー背景のシートを作り、
`remove_chroma_key.py`（imagegenスキル付属）でRGBA PNGに変換した。
生成元は `tmp/imagegen/` に置くが、`tmp/` はGit管理対象外。

## パイプライン

```text
生成（クロマキー） → 透明化 → assets/*.png（元シート・配布しない）
                              ↓ scripts/make-sprites.py
                          assets/sprites/*.png（1件1ファイル・配布する）
                              ↓ scripts/make-icons.py
                          public/apple-touch-icon.png ほか
```

```bash
.venv/bin/python scripts/make-sprites.py
.venv/bin/python scripts/make-icons.py
npm run build
```

## 元シート（`assets/`）

- `tanuki-sprites-v2.png`: たぬき 3列×2行（手を振る／走る／手を伸ばす／かご／押す／跳ぶ）
- `fruit-sprites-v1.png`: 果物9種 3列×3行
- `vegetable-sprites-v1.png`: 野菜9種 3列×3行
- `animal-sprites-v1.png`: 動物12種 3列×4行
- `abc-sprites-v1.png`: **未作成**（下記「追加依頼中」）

すべてのセルは正方形。分割時に拡大縮小しないので、さくらんぼとスイカの大小関係が保たれる。

## なぜ分割するのか

CSSスプライトシートを `background-size: 300% 300%` で切り出すと、
表示サイズが格子の倍数にならない端末で**隣のセルが数ピクセルはみ出す**。
実際に「にんじんの横に大根の白い先端が浮かぶ」不具合として出た。

さらに元シートには、生成時にセル境界をまたいだ描画が残っている。
`make-sprites.py` は連結成分解析で**最大成分の6%未満の孤立した断片を削除**する。
さくらんぼの2粒やバナナの房は連結しているので残る。ねこのヒゲも残る。

分割時に検出された断片: さくらんぼ、にんじん、ねこ、ぶた、たぬき（跳ぶ）。

## 透明化（元シート作成時の記録）

果物と野菜はマゼンタ背景。紫を保護する狭いマット範囲を使用。

```bash
.venv/bin/python /absolute/path/to/remove_chroma_key.py \
  --input tmp/imagegen/<source>.png \
  --out assets/<final>.png \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 10 \
  --opaque-threshold 55
```

動物は緑背景で同じ設定。強い `--despill` は黄・茶系の毛色を損なうため使わない。
変更時は必ず、透明な角・輪郭の色・顔・全身・セル越境を目視検査する。

## 追加依頼中: `abc-sprites-v1.png`

ABCモードは、正解した文字に「A → Apple」のごほうびカードを出す。
既存素材でA/B/C/D/E/G/H/L/M/O/P/S/W/Zの14文字は絵が用意できるが、
**F I J K N Q R T U V X Y の12文字に絵がない**。

このシートが `assets/abc-sprites-v1.png` として置かれれば、
`make-sprites.py` が自動で分割し、ビルドが自動で機能を有効化する（コード変更は不要）。
無い間は、その文字は絵なしの文字カードだけを出すので、壊れた表示にはならない。

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

生成後の手順:

```bash
.venv/bin/python /absolute/path/to/remove_chroma_key.py \
  --input tmp/imagegen/abc-sprites-chroma.png \
  --out assets/abc-sprites-v1.png \
  --auto-key border --soft-matte \
  --transparent-threshold 10 --opaque-threshold 55
.venv/bin/python scripts/make-sprites.py
npm run build
```

`tests/game-core.test.mjs` の `letters that already have shipped artwork never depend on the bonus sheet`
が、既存素材で足りている文字と追加が必要な文字の切り分けを固定している。

## アイコン

`scripts/make-icons.py` がたぬきの「手を振る」ポーズから生成する。

- `public/apple-touch-icon.png` (180×180, 角丸なし・不透明) — iOSはPNGが無いとスクリーンショットをアイコンに使う
- `public/icon-192.png` / `icon-512.png` — マニフェスト用
- `public/icon-maskable-512.png` — 安全領域内に収めたマスカブル版
