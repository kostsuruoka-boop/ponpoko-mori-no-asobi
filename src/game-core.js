export const ACTIVITY_ORDER = ["fruit", "vegetable", "animal"];
export const ROUNDS_PER_ACTIVITY = 3;

export const FRUITS = [
  { id: "apple", label: "りんご", cell: 0, accent: "#ef6256" },
  { id: "orange", label: "みかん", cell: 1, accent: "#f4a42b" },
  { id: "grape", label: "ぶどう", cell: 2, accent: "#8b63c7" },
  { id: "peach", label: "もも", cell: 3, accent: "#f3959e" },
  { id: "cherry", label: "さくらんぼ", cell: 4, accent: "#e95353" },
  { id: "lemon", label: "レモン", cell: 5, accent: "#f4d84c" },
  { id: "strawberry", label: "いちご", cell: 6, accent: "#ed554c" },
  { id: "watermelon", label: "スイカ", cell: 7, accent: "#5faa5f" },
  { id: "banana", label: "バナナ", cell: 8, accent: "#f2ca3d" },
];

export const VEGETABLES = [
  { id: "daikon", label: "だいこん", cell: 0, pull: 0.78 },
  { id: "cabbage", label: "キャベツ", cell: 1, pull: 0.82 },
  { id: "pumpkin", label: "かぼちゃ", cell: 2, pull: 0.92 },
  { id: "carrot", label: "にんじん", cell: 3, pull: 0.76 },
  { id: "onion", label: "たまねぎ", cell: 4, pull: 0.84 },
  { id: "edamame", label: "えだまめ", cell: 5, pull: 0.72 },
  { id: "cucumber", label: "きゅうり", cell: 6, pull: 0.8 },
  { id: "eggplant", label: "なす", cell: 7, pull: 0.86 },
  { id: "sweet-potato", label: "さつまいも", cell: 8, pull: 0.9 },
];

export const ANIMALS = [
  { id: "dog", label: "いぬ", cell: 0 },
  { id: "cat", label: "ねこ", cell: 1 },
  { id: "panda", label: "パンダ", cell: 2 },
  { id: "lion", label: "ライオン", cell: 3 },
  { id: "elephant", label: "ぞう", cell: 4 },
  { id: "giraffe", label: "キリン", cell: 5 },
  { id: "hippo", label: "かば", cell: 6 },
  { id: "monkey", label: "さる", cell: 7 },
  { id: "zebra", label: "しまうま", cell: 8 },
  { id: "camel", label: "ラクダ", cell: 9 },
  { id: "pig", label: "ぶた", cell: 10 },
  { id: "bird", label: "とり", cell: 11 },
];

const FRUIT_ROUNDS = [
  ["apple", "orange", "grape"],
  ["peach", "cherry", "lemon"],
  ["strawberry", "watermelon", "banana"],
];

const VEGETABLE_ROUNDS = [
  ["daikon", "cabbage", "pumpkin"],
  ["carrot", "onion", "edamame"],
  ["cucumber", "eggplant", "sweet-potato"],
];

const ANIMAL_ROUNDS = [
  { scene: "garden", ids: ["dog", "cat", "pig", "bird"] },
  { scene: "savanna", ids: ["lion", "elephant", "giraffe", "zebra"] },
  { scene: "world", ids: ["panda", "hippo", "monkey", "camel"] },
];

const LEGACY_ACTIVITY_MAP = {
  color: "fruit",
  shape: "vegetable",
  count: "animal",
};

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function byId(catalog, id) {
  const item = catalog.find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown catalog item: ${id}`);
  return item;
}

function createItems(ids, catalog, roundIndex, random) {
  return shuffle(ids.map((id, index) => ({
    ...byId(catalog, id),
    instanceId: `${id}-${roundIndex}-${index}`,
  })), random);
}

export function createFruitRound(roundIndex, random = Math.random) {
  const normalizedIndex = roundIndex % FRUIT_ROUNDS.length;
  return {
    activity: "fruit",
    items: createItems(FRUIT_ROUNDS[normalizedIndex], FRUITS, normalizedIndex, random),
    revealDistance: normalizedIndex === 0 ? 70 : 90,
  };
}

export function createVegetableRound(roundIndex, random = Math.random) {
  const normalizedIndex = roundIndex % VEGETABLE_ROUNDS.length;
  return {
    activity: "vegetable",
    items: createItems(VEGETABLE_ROUNDS[normalizedIndex], VEGETABLES, normalizedIndex, random),
    pullDistance: normalizedIndex === 0 ? 86 : 104,
  };
}

export function createAnimalRound(roundIndex) {
  const normalizedIndex = roundIndex % ANIMAL_ROUNDS.length;
  const authoredRound = ANIMAL_ROUNDS[normalizedIndex];
  return {
    activity: "animal",
    animals: authoredRound.ids.map((id, index) => ({
      ...byId(ANIMALS, id),
      instanceId: `${id}-${normalizedIndex}-${index}`,
    })),
    scene: authoredRound.scene,
    stepCount: authoredRound.ids.length,
  };
}

export function createRound(activity, roundIndex, random = Math.random) {
  if (activity === "fruit") return createFruitRound(roundIndex, random);
  if (activity === "vegetable") return createVegetableRound(roundIndex, random);
  if (activity === "animal") return createAnimalRound(roundIndex);
  throw new Error(`Unknown activity: ${activity}`);
}

export function normalizeActivityPreference(value) {
  const migrated = LEGACY_ACTIVITY_MAP[value] || value;
  return ["all", ...ACTIVITY_ORDER].includes(migrated) ? migrated : "all";
}

export function getActivityOrder(preferredActivity = "all") {
  const normalized = normalizeActivityPreference(preferredActivity);
  return normalized === "all" ? [...ACTIVITY_ORDER] : [normalized];
}

export function advanceRound(activityIndex, roundIndex, activityCount) {
  if (roundIndex + 1 < ROUNDS_PER_ACTIVITY) {
    return { activityIndex, roundIndex: roundIndex + 1, activityComplete: false, sessionComplete: false };
  }
  if (activityIndex + 1 < activityCount) {
    return { activityIndex: activityIndex + 1, roundIndex: 0, activityComplete: true, sessionComplete: false };
  }
  return { activityIndex, roundIndex, activityComplete: true, sessionComplete: true };
}

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function dragProgress(distance, requiredDistance) {
  if (!Number.isFinite(distance) || !Number.isFinite(requiredDistance) || requiredDistance <= 0) return 0;
  return clamp(distance / requiredDistance, 0, 1);
}

export function loadSavedState(settingsValue, progressValue, reduceMotionDefault = false) {
  const settings = safeParse(settingsValue);
  const progress = safeParse(progressValue);
  return {
    settings: {
      sound: settings.sound !== false,
      reduceMotion: typeof settings.reduceMotion === "boolean" ? settings.reduceMotion : reduceMotionDefault,
      activity: normalizeActivityPreference(settings.activity),
    },
    progress: {
      sessions: Math.max(0, Math.floor(Number(progress.sessions) || 0)),
    },
  };
}

function safeParse(value) {
  if (!value) return {};
  try {
    return JSON.parse(value) || {};
  } catch {
    return {};
  }
}
