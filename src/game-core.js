export const ACTIVITY_ORDER = ["color", "shape", "count"];
export const ROUNDS_PER_ACTIVITY = 3;

export const COLORS = [
  { id: "coral", value: "#f36f63", shadow: "#c64d45" },
  { id: "sun", value: "#f6c744", shadow: "#c58d16" },
  { id: "sky", value: "#68b7df", shadow: "#3885b0" },
];

export const SHAPES = ["circle", "triangle", "square"];

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createColorRound(roundIndex, random = Math.random) {
  const target = COLORS[roundIndex % COLORS.length];
  const distractors = COLORS.filter((color) => color.id !== target.id);
  const items = [
    ...Array.from({ length: 3 }, (_, index) => ({ id: `${target.id}-${index}`, color: target, isTarget: true })),
    ...distractors.map((color, index) => ({ id: `${color.id}-${index}`, color, isTarget: false })),
    { id: `${distractors[roundIndex % distractors.length].id}-extra`, color: distractors[roundIndex % distractors.length], isTarget: false },
  ];
  return { activity: "color", target, items: shuffle(items, random), targetCount: 3 };
}

export function createShapeRound(roundIndex, random = Math.random) {
  const target = SHAPES[roundIndex % SHAPES.length];
  return {
    activity: "shape",
    target,
    options: shuffle(SHAPES.map((shape) => ({ id: shape, isTarget: shape === target })), random),
  };
}

export function createCountRound(roundIndex) {
  const target = (roundIndex % 3) + 1;
  return {
    activity: "count",
    target,
    items: Array.from({ length: target }, (_, index) => ({ id: `acorn-${target}-${index}` })),
  };
}

export function createRound(activity, roundIndex, random = Math.random) {
  if (activity === "color") return createColorRound(roundIndex, random);
  if (activity === "shape") return createShapeRound(roundIndex, random);
  if (activity === "count") return createCountRound(roundIndex);
  throw new Error(`Unknown activity: ${activity}`);
}

export function getActivityOrder(preferredActivity = "all") {
  return preferredActivity === "all" ? [...ACTIVITY_ORDER] : [preferredActivity];
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

export function loadSavedState(settingsValue, progressValue, reduceMotionDefault = false) {
  const settings = safeParse(settingsValue);
  const progress = safeParse(progressValue);
  const activity = ["all", ...ACTIVITY_ORDER].includes(settings.activity) ? settings.activity : "all";
  return {
    settings: {
      sound: settings.sound !== false,
      reduceMotion: typeof settings.reduceMotion === "boolean" ? settings.reduceMotion : reduceMotionDefault,
      activity,
    },
    progress: {
      sessions: Math.max(0, Number(progress.sessions) || 0),
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
