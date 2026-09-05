/*
 * Content catalogue for ぽんぽこ もりの だいぼうけん.
 *
 * Everything a child can see, hear or collect is declared here so that game
 * rules (game-core.js) and presentation (app.js) never hard-code vocabulary.
 * Sprite ids match the `cell-*` classes in styles.css.
 */

/*
 * Play first, then the finding games. The order is the order the home screen
 * offers them in, and it says what this app is for: the tanuki is the toy, and
 * the learning games are what you grow into.
 */
export const PLAY_ACTIVITIES = ["band", "peekaboo", "feast", "bubble"];
export const LEARN_ACTIVITIES = [
  "farm",
  "animal",
  "hiragana",
  "alphabet",
  "hiragana-field",
  "alphabet-field",
];
export const ACTIVITY_ORDER = PLAY_ACTIVITIES.concat(LEARN_ACTIVITIES);

/* The two letter-field activities grow letters instead of food. */
export const LETTER_FIELD_ACTIVITY = { hiragana: "hiragana-field", alphabet: "alphabet-field" };
export const FIELD_SOURCE_ACTIVITY = { "hiragana-field": "hiragana", "alphabet-field": "alphabet" };
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

/*
 * Whether a growing place is overhead or at ground level. One declaration
 * decides three things that must never disagree: which direction the child
 * pulls, which direction the guidance hand mimes, and which row of the board
 * the plant is laid out in. Things you reach up and pick sit in the back row;
 * things you pull out of the ground sit in the front row.
 */
export const HABITAT_PULL = {
  tree: "down",
  palm: "down",
  trellis: "down",
  bush: "up",
  vine: "up",
  ground: "up",
  soil: "up",
};

export function isOverhead(habitat) {
  return HABITAT_PULL[habitat] === "down";
}

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

/*
 * Speech engines announce a lone capital letter as "Capital A". Spelling the
 * letter name out phonetically is the only reliable way to hear just the
 * letter, and it survives whatever voice the iPad happens to have installed.
 */
const ALPHABET_SOUNDS = {
  A: "ay", B: "bee", C: "see", D: "dee", E: "ee", F: "eff", G: "gee",
  H: "aitch", I: "eye", J: "jay", K: "kay", L: "ell", M: "em", N: "en",
  O: "oh", P: "pee", Q: "cue", R: "ar", S: "ess", T: "tee", U: "you",
  V: "vee", W: "double you", X: "ex", Y: "why", Z: "zee",
};

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(function (glyph, index) {
  const entry = ALPHABET_WORDS[glyph];
  return {
    id: "a-" + glyph,
    glyph: glyph,
    secondary: glyph.toLowerCase(),
    label: glyph,
    speak: ALPHABET_SOUNDS[glyph],
    lang: "en-US",
    column: index % 7,
    row: Math.floor(index / 7),
    word: entry.word,
    sprite: entry.sprite,
    bonusSprite: entry.bonus === true,
  };
});

/* ------------------------------------------------------------ play modes */
/*
 * Four activities that exist to be funny rather than instructive. None of them
 * asks for anything, so none of them can be answered wrongly: the tanuki is the
 * toy and the child is the one making things happen. Words still arrive — a fed
 * apple says "りんご" — but only as the by-product of a joke that landed.
 */

/*
 * The band. Every pitch is a degree of the C major pentatonic scale, so a
 * toddler hammering all six friends at once still produces something
 * consonant. There is no wrong note to play, by construction rather than by
 * forgiveness.
 */
export const BAND_MEMBERS = [
  { id: "band-elephant", animal: "elephant", label: "ラッパ", voice: "horn", frequency: 196.0, color: "#8fc98d" },
  { id: "band-dog", animal: "dog", label: "たいこ", voice: "drum", frequency: 261.63, color: "#f0a071" },
  { id: "band-cat", animal: "cat", label: "もっきん", voice: "marimba", frequency: 587.33, color: "#f3c750" },
  { id: "band-panda", animal: "panda", label: "ピアノ", voice: "marimba", frequency: 659.25, color: "#f39ab0" },
  { id: "band-monkey", animal: "monkey", label: "タンバリン", voice: "shaker", frequency: 880.0, color: "#c096dd" },
  { id: "band-bird", animal: "bird", label: "すず", voice: "bell", frequency: 1046.5, color: "#82c9e8" },
];

/* The tanuki's own belly drum: the one thing every tanuki story has. */
export const BAND_TANUKI = { id: "band-tanuki", label: "ぽんぽこ", voice: "belly", frequency: 146.83 };

/*
 * Peekaboo. Six hiding places, and somebody behind every one of them — an empty
 * box would read as "you got it wrong", which is exactly what this activity is
 * not for.
 */
export const PEEKABOO_HIDEOUTS = ["bush", "pot", "box", "leaves", "hollow", "basket"];

export const PEEKABOO_TANUKI = {
  id: "peek-tanuki",
  label: "たぬき",
  speak: "ばあ",
  sprite: null,
  isTanuki: true,
};

/* Everyone else who might be hiding, reusing artwork the child already knows. */
export const PEEKABOO_CAST = ANIMALS.map(function (animal) {
  return {
    id: "peek-" + animal.id,
    label: animal.label,
    speak: animal.label + (animal.cry ? "。" + animal.cry : ""),
    sprite: animal.id,
    isTanuki: false,
  };
}).concat(
  FRUITS.map(function (fruit) {
    return {
      id: "peek-" + fruit.id,
      label: fruit.label,
      speak: fruit.label,
      sprite: fruit.id,
      isTanuki: false,
    };
  }),
);

/* What the tanuki says with its mouth full. Cycled, never random, so the same
 * word does not land twice in a row. */
export const YUM = ["おいしい", "もぐもぐ", "うまうま", "おかわり"];

/* Bubbles. Colour is the only variable that matters; everything else about a
 * bubble is decided by the board so no two floats look alike. */
export const BUBBLE_COLORS = [
  "#8fd3f4",
  "#f7a8c4",
  "#ffdf85",
  "#a4e3bf",
  "#c5b4f3",
  "#ffbfa0",
];

/* --------------------------------------------------------------- staging */
/* One place for every per-activity string, icon and tanuki placement. */
export const ACTIVITY_META = {
  band: {
    title: "おんがくたい",
    icon: "\u266a",
    pose: "jump",
    askPrefix: "",
    completeLine: "たのしいね",
    finishKicker: "ぽんぽこ コンサート！",
    finishTitle: "たのしかったね！",
  },
  peekaboo: {
    title: "いないいないばあ",
    icon: "👀",
    pose: "reach",
    askPrefix: "",
    completeLine: "みんな いたね",
    finishKicker: "みんな でてきた！",
    finishTitle: "びっくりしたね！",
  },
  feast: {
    title: "ごはん",
    icon: "🍎",
    pose: "basket",
    askPrefix: "",
    completeLine: "おなか いっぱい",
    finishKicker: "ぽんぽこ まんぷく！",
    finishTitle: "おなか いっぱい！",
  },
  bubble: {
    title: "しゃぼんだま",
    icon: "\u25cb",
    pose: "wave",
    askPrefix: "",
    completeLine: "ぜんぶ われたね",
    finishKicker: "ぽんぽこ しゃぼんだま！",
    finishTitle: "たくさん われたね！",
  },
  farm: {
    title: "のうえん",
    icon: "🌱",
    pose: "basket",
    askPrefix: "",
    finishKicker: "ぽんぽこ だいしゅうかく！",
    finishTitle: "たくさん とれたね！",
  },
  animal: {
    title: "どうぶつ",
    icon: "🐾",
    pose: "reach",
    askPrefix: "この かげ、だあれ",
    finishKicker: "どうぶつ だいしゅうごう！",
    finishTitle: "みんな なかよし！",
  },
  hiragana: {
    title: "ひらがな",
    icon: "あ",
    pose: "wave",
    askPrefix: "",
    finishKicker: "ひらがな ぽんぽこ！",
    finishTitle: "もじが みつかったね！",
  },
  alphabet: {
    title: "ABC",
    icon: "A",
    pose: "wave",
    askPrefix: "",
    finishKicker: "ABC ぽんぽこ！",
    finishTitle: "ABCを みつけたね！",
  },
  "hiragana-field": {
    title: "もじばたけ",
    icon: "あ",
    pose: "basket",
    askPrefix: "",
    finishKicker: "もじが みのったね！",
    finishTitle: "たくさん とれたね！",
  },
  "alphabet-field": {
    title: "ABCばたけ",
    icon: "A",
    pose: "basket",
    askPrefix: "",
    finishKicker: "ABCが みのったね！",
    finishTitle: "たくさん とれたね！",
  },
};

/*
 * Where a letter grows in the letter fields. Half the board hangs above the
 * child and is pulled downwards, half is at ground level and is pulled up, so
 * both gestures get practised every round.
 */
export const LETTER_HABITATS = {
  above: FARM_HABITATS.filter(isOverhead),
  below: FARM_HABITATS.filter(function (habitat) {
    return !isOverhead(habitat);
  }),
};

export const PRAISE = ["やったー", "じょうず", "すごーい", "できた", "ぽんぽこ"];
