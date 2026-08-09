export const ACTIVITY_ORDER = ["farm", "animal", "hiragana", "alphabet"];
export const ROUNDS_PER_ACTIVITY = 3;

export const FRUITS = [
  { id: "apple", label: "りんご", kind: "fruit", source: "tree" },
  { id: "orange", label: "みかん", kind: "fruit", source: "tree" },
  { id: "grape", label: "ぶどう", kind: "fruit", source: "trellis" },
  { id: "peach", label: "もも", kind: "fruit", source: "tree" },
  { id: "cherry", label: "さくらんぼ", kind: "fruit", source: "tree" },
  { id: "lemon", label: "レモン", kind: "fruit", source: "tree" },
  { id: "strawberry", label: "いちご", kind: "fruit", source: "bush" },
  { id: "watermelon", label: "スイカ", kind: "fruit", source: "vine" },
  { id: "banana", label: "バナナ", kind: "fruit", source: "banana-tree" },
];

export const VEGETABLES = [
  { id: "daikon", label: "だいこん", kind: "vegetable", source: "root" },
  { id: "cabbage", label: "キャベツ", kind: "vegetable", source: "ground" },
  { id: "pumpkin", label: "かぼちゃ", kind: "vegetable", source: "vine" },
  { id: "carrot", label: "にんじん", kind: "vegetable", source: "root" },
  { id: "onion", label: "たまねぎ", kind: "vegetable", source: "root" },
  { id: "edamame", label: "えだまめ", kind: "vegetable", source: "bush" },
  { id: "cucumber", label: "きゅうり", kind: "vegetable", source: "trellis" },
  { id: "eggplant", label: "なす", kind: "vegetable", source: "bush" },
  { id: "sweet-potato", label: "さつまいも", kind: "vegetable", source: "root" },
];

export const FARM_ITEMS = [...FRUITS, ...VEGETABLES];

export const ANIMALS = [
  { id: "dog", label: "いぬ" },
  { id: "cat", label: "ねこ" },
  { id: "panda", label: "パンダ" },
  { id: "lion", label: "ライオン" },
  { id: "elephant", label: "ぞう" },
  { id: "giraffe", label: "キリン" },
  { id: "hippo", label: "かば" },
  { id: "monkey", label: "さる" },
  { id: "zebra", label: "しまうま" },
  { id: "camel", label: "ラクダ" },
  { id: "pig", label: "ぶた" },
  { id: "bird", label: "とり" },
];

export const HIRAGANA = [
  ["a", "あ"], ["i", "い"], ["u", "う"], ["e", "え"], ["o", "お"],
  ["ka", "か"], ["ki", "き"], ["ku", "く"], ["ke", "け"], ["ko", "こ"],
  ["sa", "さ"], ["shi", "し"], ["su", "す"], ["se", "せ"], ["so", "そ"],
  ["ta", "た"], ["chi", "ち"], ["tsu", "つ"], ["te", "て"], ["to", "と"],
  ["na", "な"], ["ni", "に"], ["nu", "ぬ"], ["ne", "ね"], ["no", "の"],
  ["ha", "は"], ["hi", "ひ"], ["fu", "ふ"], ["he", "へ"], ["ho", "ほ"],
  ["ma", "ま"], ["mi", "み"], ["mu", "む"], ["me", "め"], ["mo", "も"],
  ["ya", "や"], ["yu", "ゆ"], ["yo", "よ"],
  ["ra", "ら"], ["ri", "り"], ["ru", "る"], ["re", "れ"], ["ro", "ろ"],
  ["wa", "わ"], ["wo", "を"], ["n", "ん"],
].map(([id, glyph]) => ({ id, glyph, label: glyph, speak: glyph, lang: "ja-JP" }));

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((glyph) => ({
  id: glyph.toLowerCase(),
  glyph,
  secondary: glyph.toLowerCase(),
  label: glyph,
  speak: glyph,
  lang: "en-US",
}));

const FARM_ROUNDS = [
  { scene: "orchard", ids: ["apple", "orange", "peach", "daikon", "carrot", "cabbage"] },
  { scene: "trellis", ids: ["grape", "cherry", "strawberry", "edamame", "cucumber", "eggplant"] },
  { scene: "sunny", ids: ["lemon", "banana", "watermelon", "pumpkin", "onion", "sweet-potato"] },
];

const ANIMAL_ROUNDS = [
  { scene: "meadow", ids: ["dog", "cat", "pig", "bird"] },
  { scene: "savanna", ids: ["lion", "elephant", "giraffe", "zebra"] },
  { scene: "forest", ids: ["panda", "hippo", "monkey", "camel"] },
];

function byId(catalog, id) {
  const item = catalog.find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown catalog item: ${id}`);
  return item;
}

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createFarmRound(roundIndex) {
  const normalizedIndex = modulo(roundIndex, FARM_ROUNDS.length);
  const authored = FARM_ROUNDS[normalizedIndex];
  return {
    activity: "farm",
    scene: authored.scene,
    items: authored.ids.map((id, index) => ({
      ...byId(FARM_ITEMS, id),
      instanceId: `${id}-${normalizedIndex}-${index}`,
    })),
  };
}

export function createAnimalRound(roundIndex, random = Math.random) {
  const normalizedIndex = modulo(roundIndex, ANIMAL_ROUNDS.length);
  const authored = ANIMAL_ROUNDS[normalizedIndex];
  const animals = authored.ids.map((id, index) => ({
    ...byId(ANIMALS, id),
    instanceId: `${id}-${normalizedIndex}-${index}`,
  }));
  return {
    activity: "animal",
    scene: authored.scene,
    animals,
    targets: shuffle(animals, random),
  };
}

export function createChoiceSet(catalog, targetId, random = Math.random) {
  const targetIndex = catalog.findIndex((entry) => entry.id === targetId);
  if (targetIndex < 0) throw new Error(`Unknown learning target: ${targetId}`);
  const decoys = [
    catalog[modulo(targetIndex + 1, catalog.length)],
    catalog[modulo(targetIndex - 1, catalog.length)],
  ];
  return shuffle([catalog[targetIndex], ...decoys], random);
}

export function createLiteracyRound(activity, roundIndex, curriculumIndex = 0, random = Math.random) {
  const catalog = activity === "hiragana" ? HIRAGANA : activity === "alphabet" ? ALPHABET : null;
  if (!catalog) throw new Error(`Unknown literacy activity: ${activity}`);
  const start = curriculumIndex + modulo(roundIndex, ROUNDS_PER_ACTIVITY) * 3;
  const targets = Array.from({ length: 3 }, (_, index) => catalog[modulo(start + index, catalog.length)]);
  return {
    activity,
    targets,
    choices: Object.fromEntries(targets.map((target) => [target.id, createChoiceSet(catalog, target.id, random)])),
  };
}

export function createRound(activity, roundIndex, options = {}) {
  if (activity === "farm") return createFarmRound(roundIndex);
  if (activity === "animal") return createAnimalRound(roundIndex, options.random);
  if (activity === "hiragana" || activity === "alphabet") {
    return createLiteracyRound(activity, roundIndex, options.curriculumIndex, options.random);
  }
  throw new Error(`Unknown activity: ${activity}`);
}

export function advanceRound(roundIndex, roundCount = ROUNDS_PER_ACTIVITY) {
  const complete = roundIndex + 1 >= roundCount;
  return { complete, roundIndex: complete ? roundIndex : roundIndex + 1 };
}

export function nextCurriculumIndex(activity, currentIndex, amount = 9) {
  const catalog = activity === "hiragana" ? HIRAGANA : activity === "alphabet" ? ALPHABET : null;
  if (!catalog) return Math.max(0, Math.floor(Number(currentIndex) || 0));
  return modulo(Math.max(0, Math.floor(Number(currentIndex) || 0)) + amount, catalog.length);
}

export function normalizeActivity(value) {
  const legacy = { fruit: "farm", vegetable: "farm", color: "farm", shape: "farm", count: "animal", all: "farm" };
  const normalized = legacy[value] || value;
  return ACTIVITY_ORDER.includes(normalized) ? normalized : "farm";
}

export function loadSavedState(settingsValue, progressValue, reduceMotionDefault = false) {
  const settings = safeParse(settingsValue);
  const progress = safeParse(progressValue);
  const legacySound = settings.sound !== false;
  return {
    settings: {
      effects: typeof settings.effects === "boolean" ? settings.effects : legacySound,
      voice: typeof settings.voice === "boolean" ? settings.voice : legacySound,
      reduceMotion: typeof settings.reduceMotion === "boolean" ? settings.reduceMotion : reduceMotionDefault,
    },
    progress: {
      sessions: nonNegativeInteger(progress.sessions),
      completed: Object.fromEntries(ACTIVITY_ORDER.map((activity) => [activity, nonNegativeInteger(progress.completed?.[activity])])),
      curriculum: {
        hiragana: modulo(nonNegativeInteger(progress.curriculum?.hiragana), HIRAGANA.length),
        alphabet: modulo(nonNegativeInteger(progress.curriculum?.alphabet), ALPHABET.length),
      },
    },
  };
}

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function dragDistance(startX, startY, endX, endY) {
  const values = [startX, startY, endX, endY];
  if (!values.every(Number.isFinite)) return 0;
  return Math.hypot(endX - startX, endY - startY);
}

export function isPointInsideRect(point, rect, padding = 0) {
  if (!point || !rect) return false;
  return point.x >= rect.left - padding
    && point.x <= rect.right + padding
    && point.y >= rect.top - padding
    && point.y <= rect.bottom + padding;
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function modulo(value, length) {
  return ((value % length) + length) % length;
}

function safeParse(value) {
  if (!value) return {};
  try {
    return JSON.parse(value) || {};
  } catch {
    return {};
  }
}
