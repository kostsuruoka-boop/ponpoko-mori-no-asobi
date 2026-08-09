# 画像素材の生成記録

すべてこのゲーム専用のオリジナル素材である。OpenAIの組み込み画像生成機能を使用し、平坦なクロマキー背景で生成後、imagegenスキル付属の`remove_chroma_key.py`でRGBA PNGへ変換した。生成元は`tmp/imagegen/`に置くが、`tmp/`はGit管理対象外である。

## 配置

- `assets/tanuki-sprites-v2.png`: 主役のたぬき、3列×2行、6ポーズ
- `assets/fruit-sprites-v1.png`: 果物9種、3列×3行
- `assets/vegetable-sprites-v1.png`: 野菜9種、3列×3行
- `assets/animal-sprites-v1.png`: 動物12種、3列×4行

## 透明化

果物と野菜はマゼンタ背景のため、紫色を保護する狭いマット範囲を使用した。

```bash
.venv/bin/python /absolute/path/to/remove_chroma_key.py \
  --input tmp/imagegen/<source>.png \
  --out assets/<final>.png \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 10 \
  --opaque-threshold 55
```

動物は緑背景で同じ狭いマット範囲を使用した。強い`--despill`は黄・茶系の毛色を損なうため採用していない。変更時は必ず透明角、輪郭の色、顔、全身、セル越境を目視検査する。

## 果物プロンプト

```text
Use case: stylized-concept
Asset type: production fruit sprite sheet for a toddler iPad web game
Primary request: Create one strict 3-column by 3-row sprite sheet containing exactly nine isolated fruits in this exact cell order.
Row 1: red apple with one green leaf; round orange mandarin with one green leaf; compact purple grape bunch with one green leaf.
Row 2: pink peach with one green leaf; pair of bright red cherries joined by green stems; yellow lemon with one small green leaf.
Row 3: red strawberry with green crown; single round dark-green watermelon with lighter stripes, not a slice; curved yellow banana bunch with three bananas.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for local background removal; one uniform color with no shadows, gradients, texture, floor plane, lighting variation, or frames.
Style/medium: polished rounded 3D children's storybook game art, soft tactile clay-and-felt appearance, friendly and premium, for ages 1–2, matching a cheerful rounded tanuki.
Composition/framing: exact evenly spaced 3 by 3 grid; each fruit centered independently in its cell; consistent visual scale and generous padding; full silhouette; no overlaps or cell crossing.
Lighting/mood: bright soft studio lighting on the fruit only; joyful, saturated, immediately recognizable.
Constraints: exactly nine fruits and no extras; no grid lines; no labels; no text; no numbers; no faces; no cast or contact shadows; no reflections; no watermark; crisp separated edges; do not use #ff00ff in any fruit.
Avoid: realistic photography, baskets, plates, cut fruit except natural stems, clutter, cropping, inconsistent style.
```

## 野菜プロンプト

```text
Use case: stylized-concept
Asset type: production vegetable sprite sheet for a toddler iPad web game
Primary request: Create one strict 3-column by 3-row sprite sheet containing exactly nine isolated vegetables in this exact cell order.
Row 1: long white Japanese daikon radish with a leafy green top; round green cabbage; squat orange kabocha pumpkin with green stem.
Row 2: orange carrot with leafy green top; golden onion bulb with green shoots; bright green edamame pod showing three bean bumps.
Row 3: single curved dark-green cucumber; glossy purple eggplant with green cap; reddish-purple Japanese sweet potato.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for local background removal; one uniform color with no shadows, gradients, texture, floor plane, lighting variation, or frames.
Style/medium: polished rounded 3D children's storybook game art, soft tactile clay-and-felt appearance, friendly and premium, for ages 1–2, matching a cheerful rounded tanuki.
Composition/framing: exact evenly spaced 3 by 3 grid; each vegetable centered independently in its cell; consistent visual scale and generous padding; full silhouette; no overlaps or cell crossing. Keep the full daikon and carrot inside their cells.
Lighting/mood: bright soft studio lighting on the vegetables only; joyful, saturated, immediately recognizable.
Constraints: exactly nine vegetables and no extras; no grid lines; no labels; no text; no numbers; no faces; no cast or contact shadows; no reflections; no watermark; crisp separated edges; do not use #ff00ff in any vegetable.
Avoid: realistic photography, baskets, plates, cut vegetables, clutter, cropping, inconsistent style.
```

## 動物プロンプト

```text
Use case: stylized-concept
Asset type: production animal character sprite sheet for a toddler iPad web game
Primary request: Create one strict 3-column by 4-row sprite sheet containing exactly twelve isolated cute animals in this exact cell order.
Row 1: friendly brown floppy-eared dog; friendly orange tabby cat; round black-and-white giant panda.
Row 2: golden lion with a soft round mane; small gray elephant with large ears and visible trunk; yellow giraffe with brown spots and full long neck.
Row 3: round gray-purple hippopotamus; cheerful brown monkey with curled tail; black-and-white zebra with clear stripes.
Row 4: tan camel with one hump; round pink pig; small blue-and-brown songbird.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for local background removal; one uniform color with no shadows, gradients, texture, floor plane, lighting variation, or frames.
Style/medium: polished rounded 3D children's storybook game characters, soft tactile clay-and-felt appearance, friendly and premium, for ages 1–2, matching a cheerful rounded tanuki protagonist.
Composition/framing: exact evenly spaced 3 by 4 grid; every animal centered independently in its cell; all facing slightly to the right; full body and feet visible; consistent visual weight and generous padding; no overlap or cell crossing. Fit the giraffe completely inside its cell.
Lighting/mood: bright soft studio lighting on the animals only; warm, joyful, gentle expressions, immediately recognizable silhouettes.
Constraints: exactly twelve animals and no extras; no grid lines; no scenery; no props; no collars; no labels; no text; no numbers; no cast or contact shadows; no reflections; no watermark; crisp separated edges; do not use #00ff00 anywhere in the animals.
Avoid: realistic photography, aggressive teeth, scary expressions, thin fragile limbs, costumes, cropping, inconsistent style.
```

## たぬきプロンプトの要旨

同一の丸く親しみやすいたぬきを3列×2行に配置し、手を振る、走る、手を伸ばす、かごを持つ、押す、跳ぶの6ポーズを生成した。黄色い葉の首飾りを全ポーズで統一し、1〜2歳向けの明るい絵本調、文字・影・余分な物なし、単色マゼンタ背景とした。
