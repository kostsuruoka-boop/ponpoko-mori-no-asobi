/*
 * Content catalogue for ぽんぽこ もりの だいぼうけん.
 *
 * Everything a child can see, hear or collect is declared here so that game
 * rules (game-core.js) and presentation (app.js) never hard-code vocabulary.
 * Sprite ids match the `cell-*` classes in styles.css.
 */

export const ACTIVITY_ORDER = ["farm", "animal", "hiragana", "alphabet"];
export const ROUNDS_PER_ACTIVITY = 3;

/* ------------------------------------------------------------------ farm */
/*
 * `habitat` decides which piece of scenery is drawn behind the produce and how
 * the harvest animation starts: buried roots rise out of the soil, tree fruit
 * drops, trellis fruit unhooks. It is learning content, not decoration.
 */
export const FRUITS = [
  { id: "apple", label: "りんご", kind: "fruit", habitat: "tree" },
  { id: "orange", label: "みかん", kind: "fruit", habitat: "tree" },
  { id: "peach", label: "もも", kind: "fruit", habitat: "tree" },
  { id: "cherry", label: "さくらんぼ", kind: "fruit", habitat: "tree" },
  { id: "lemon", label: "レモン", kind: "fruit", habitat: "tree" },
  { id: "grape", label: "ぶどう", kind: "fruit", habitat: "trellis" },
  { id: "strawberry", label: "いちご", kind: "fruit", habitat: "bush" },
  { id: "watermelon", label: "すいか", kind: "fruit", habitat: "vine" },
  { id: "banana", label: "バナナ", kind: "fruit", habitat: "palm" },
];

export const VEGETABLES = [
  { id: "daikon", label: "だいこん", kind: "vegetable", habitat: "soil" },
  { id: "carrot", label: "にんじん", kind: "vegetable", habitat: "soil" },
  { id: "onion", label: "たまねぎ", kind: "vegetable", habitat: "soil" },
  { id: "sweet-potato", label: "さつまいも", kind: "vegetable", habitat: "soil" },
  { id: "cabbage", label: "キャベツ", kind: "vegetable", habitat: "ground" },
  { id: "pumpkin", label: "かぼちゃ", kind: "vegetable", habitat: "vine" },
  { id: "edamame", label: "えだまめ", kind: "vegetable", habitat: "bush" },
  { id: "eggplant", label: "なす", kind: "vegetable", habitat: "bush" },
  { id: "cucumber", label: "きゅうり", kind: "vegetable", habitat: "trellis" },
];

export const FARM_ITEMS = FRUITS.concat(VEGETABLES);

/* The order every habitat is dealt out in. Rounds are built by walking these
 * groups in turn, which is what keeps a randomly dealt board from turning into
 * six identical trees. */
export const FARM_HABITATS = ["tree", "soil", "bush", "trellis", "vine", "ground", "palm"];

/* --------------------------------------------------------------- animals */
/* `cry` is optional: only animals with an iconic Japanese onomatopoeia have one. */
export const ANIMALS = [
  { id: "dog", label: "いぬ", cry: "ワンワン" },
  { id: "cat", label: "ねこ", cry: "ニャーオ" },
  { id: "pig", label: "ぶた", cry: "ブーブー" },
  { id: "bird", label: "とり", cry: "ピピピ" },
  { id: "lion", label: "ライオン", cry: "ガオー" },
  { id: "elephant", label: "ぞう", cry: "パオーン" },
  { id: "monkey", label: "さる", cry: "ウキキ" },
  { id: "zebra", label: "しまうま" },
  { id: "panda", label: "パンダ" },
  { id: "giraffe", label: "キリン" },
  { id: "hippo", label: "かば" },
  { id: "camel", label: "ラクダ" },
];

/*
 * Silhouette rounds get harder by widening the choice row only: two candidates
 * in the first round, four in the last. Which animals appear is randomised per
 * session; only this progression is fixed.
 */
export const ANIMAL_CHOICE_PROGRESSION = [2, 3, 4];

/* -------------------------------------------------------------- hiragana */
/*
 * The classic 五十音図: ten 行 (columns) by five 段 (rows), with ん sitting in
 * the わ column on the い段 exactly as printed charts do. `null` marks the
 * historical gaps so the chart keeps its recognisable shape.
 */
const HIRAGANA_COLUMNS = [
  ["あ", "い", "う", "え", "お"],
  ["か", "き", "く", "け", "こ"],
  ["さ", "し", "す", "せ", "そ"],
  ["た", "ち", "つ", "て", "と"],
  ["な", "に", "ぬ", "ね", "の"],
  ["は", "ひ", "ふ", "へ", "ほ"],
  ["ま", "み", "む", "め", "も"],
  ["や", null, "ゆ", null, "よ"],
  ["ら", "り", "る", "れ", "ろ"],
  ["わ", "ん", null, null, "を"],
];

/* Rewards that turn a letter into a word the child already met in the farm. */
const HIRAGANA_WORDS = {
  い: { word: "いちご", sprite: "strawberry" },
  え: { word: "えだまめ", sprite: "edamame" },
  か: { word: "かぼちゃ", sprite: "pumpkin" },
  き: { word: "キャベツ", sprite: "cabbage" },
  く: { word: "くるま", sprite: null },
  さ: { word: "さくらんぼ", sprite: "cherry" },
  し: { word: "しまうま", sprite: "zebra" },
  す: { word: "すいか", sprite: "watermelon" },
  た: { word: "たまねぎ", sprite: "onion" },
  と: { word: "とり", sprite: "bird" },
  な: { word: "なす", sprite: "eggplant" },
  に: { word: "にんじん", sprite: "carrot" },
  ね: { word: "ねこ", sprite: "cat" },
  ぱ: { word: "パンダ", sprite: "panda" },
  ば: { word: "バナナ", sprite: "banana" },
  み: { word: "みかん", sprite: "orange" },
  も: { word: "もも", sprite: "peach" },
  ら: { word: "ライオン", sprite: "lion" },
  り: { word: "りんご", sprite: "apple" },
  れ: { word: "レモン", sprite: "lemon" },
};

export const HIRAGANA = [];
HIRAGANA_COLUMNS.forEach(function (column, columnIndex) {
  column.forEach(function (glyph, rowIndex) {
    if (!glyph) return;
    const word = HIRAGANA_WORDS[glyph] || null;
    HIRAGANA.push({
      id: "h-" + glyph,
      glyph: glyph,
      label: glyph,
      speak: glyph,
      lang: "ja-JP",
      column: columnIndex,
      row: rowIndex,
      word: word ? word.word : null,
      sprite: word ? word.sprite : null,
    });
  });
});

/* -------------------------------------------------------------- alphabet */
/*
 * `sprite` uses artwork the game already ships. `bonus: true` means the picture
 * lives on the optional abc sprite sheet, which app.js enables only after the
 * file has actually loaded, so a missing asset can never show an empty frame.
 */
const ALPHABET_WORDS = {
  A: { word: "Apple", sprite: "apple" },
  B: { word: "Banana", sprite: "banana" },
  C: { word: "Cat", sprite: "cat" },
  D: { word: "Dog", sprite: "dog" },
  E: { word: "Elephant", sprite: "elephant" },
  F: { word: "Fish", sprite: "abc-fish", bonus: true },
  G: { word: "Giraffe", sprite: "giraffe" },
  H: { word: "Hippo", sprite: "hippo" },
  I: { word: "Igloo", sprite: "abc-igloo", bonus: true },
  J: { word: "Juice", sprite: "abc-juice", bonus: true },
  K: { word: "Kite", sprite: "abc-kite", bonus: true },
  L: { word: "Lion", sprite: "lion" },
  M: { word: "Monkey", sprite: "monkey" },
  N: { word: "Nest", sprite: "abc-nest", bonus: true },
  O: { word: "Orange", sprite: "orange" },
  P: { word: "Panda", sprite: "panda" },
  Q: { word: "Queen", sprite: "abc-queen", bonus: true },
  R: { word: "Rabbit", sprite: "abc-rabbit", bonus: true },
  S: { word: "Strawberry", sprite: "strawberry" },
  T: { word: "Tiger", sprite: "abc-tiger", bonus: true },
  U: { word: "Umbrella", sprite: "abc-umbrella", bonus: true },
  V: { word: "Violin", sprite: "abc-violin", bonus: true },
  W: { word: "Watermelon", sprite: "watermelon" },
  X: { word: "Xylophone", sprite: "abc-xylophone", bonus: true },
  Y: { word: "Yoyo", sprite: "abc-yoyo", bonus: true },
  Z: { word: "Zebra", sprite: "zebra" },
};

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(function (glyph, index) {
  const entry = ALPHABET_WORDS[glyph];
  return {
    id: "a-" + glyph,
    glyph: glyph,
    secondary: glyph.toLowerCase(),
    label: glyph,
    speak: glyph,
    lang: "en-US",
    column: index % 7,
    row: Math.floor(index / 7),
    word: entry.word,
    sprite: entry.sprite,
    bonusSprite: entry.bonus === true,
  };
});

/* --------------------------------------------------------------- staging */
/* One place for every per-activity string, icon and tanuki placement. */
export const ACTIVITY_META = {
  farm: {
    title: "のうえん",
    icon: "🌱",
    pose: "basket",
    askPrefix: "",
    askSuffix: "、どーこだ",
    finishKicker: "ぽんぽこ だいしゅうかく！",
    finishTitle: "たくさん とれたね！",
  },
  animal: {
    title: "どうぶつ",
    icon: "🐾",
    pose: "reach",
    askPrefix: "この かげ、だあれ",
    askSuffix: "",
    finishKicker: "どうぶつ だいしゅうごう！",
    finishTitle: "みんな なかよし！",
  },
  hiragana: {
    title: "ひらがな",
    icon: "あ",
    pose: "wave",
    askPrefix: "",
    askSuffix: "、どーこだ",
    finishKicker: "ひらがな ぽんぽこ！",
    finishTitle: "もじが みつかったね！",
  },
  alphabet: {
    title: "ABC",
    icon: "A",
    pose: "wave",
    askPrefix: "",
    askSuffix: "",
    finishKicker: "ABC ぽんぽこ！",
    finishTitle: "ABCを みつけたね！",
  },
};

export const PRAISE = ["やったー", "じょうず", "すごーい", "できた", "ぽんぽこ"];
