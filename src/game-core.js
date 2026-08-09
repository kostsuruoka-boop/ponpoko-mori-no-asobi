export const COLORS = [
  { id: "red", label: "あか", value: "#ef6f61", dark: "#b9473f" },
  { id: "blue", label: "あお", value: "#65a9d8", dark: "#3379a9" },
  { id: "yellow", label: "きいろ", value: "#f2c94c", dark: "#a67b00" },
  { id: "green", label: "みどり", value: "#79b989", dark: "#397a4b" },
];

export const SHAPES = [
  { id: "circle", label: "まる" },
  { id: "triangle", label: "さんかく" },
  { id: "square", label: "しかく" },
  { id: "star", label: "おほしさま" },
];

export const SESSION_LENGTH = 4;

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function modeForRound(mode, roundNumber) {
  if (mode !== "mix") return mode;
  return ["color", "shape", "count", "color"][roundNumber % SESSION_LENGTH];
}

export function createRound(mode, roundNumber = 0, random = Math.random) {
  const roundMode = modeForRound(mode, roundNumber);

  if (roundMode === "color") {
    const target = COLORS[roundNumber % COLORS.length];
    return {
      mode: roundMode,
      target,
      options: shuffle([target, ...shuffle(COLORS.filter((color) => color.id !== target.id), random).slice(0, 2)], random),
      prompt: `${target.label}い きのみは どーれ？`,
      helper: "おなじ いろを さわってね",
    };
  }

  if (roundMode === "shape") {
    const target = SHAPES[roundNumber % SHAPES.length];
    return {
      mode: roundMode,
      target,
      options: shuffle([target, ...shuffle(SHAPES.filter((shape) => shape.id !== target.id), random).slice(0, 2)], random),
      prompt: `${target.label}は どーれ？`,
      helper: "ぴったりの かたちを さわってね",
    };
  }

  const target = (roundNumber % 3) + 1;
  return {
    mode: "count",
    target,
    options: [1, 2, 3],
    prompt: `どんぐりを ${target}こ あげよう`,
    helper: "どんぐりを ひとつずつ さわってね",
  };
}

export function isCorrect(round, answer) {
  if (round.mode === "count") return Number(answer) === round.target;
  return answer === round.target.id;
}

export function addCount(current, target) {
  return Math.min(current + 1, target);
}

export function loadProgress(storageValue) {
  if (!storageValue) return { totalCorrect: 0, leaves: 0 };
  try {
    const parsed = JSON.parse(storageValue);
    return {
      totalCorrect: Math.max(0, Number(parsed.totalCorrect) || 0),
      leaves: Math.max(0, Number(parsed.leaves) || 0),
    };
  } catch {
    return { totalCorrect: 0, leaves: 0 };
  }
}
