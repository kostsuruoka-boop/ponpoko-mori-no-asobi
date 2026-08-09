/*
 * Pure game rules. No DOM, no timers, no storage — everything here is
 * deterministic given an injected `random`, so tests/game-core.test.mjs can
 * verify the whole curriculum without a browser.
 */

import {
  ACTIVITY_ORDER,
  ALPHABET,
  ANIMALS,
  ANIMAL_ROUNDS,
  FARM_ITEMS,
  FARM_ROUNDS,
  HIRAGANA,
  ROUNDS_PER_ACTIVITY,
} from "./content.js";

export const FARM_TARGETS_PER_ROUND = 6;
export const ANIMAL_TARGETS_PER_ROUND = 4;
export const LITERACY_TARGETS_PER_ROUND = 5;
export const LITERACY_TARGETS_PER_SESSION = LITERACY_TARGETS_PER_ROUND * ROUNDS_PER_ACTIVITY;

/* Idle milliseconds before each successive hint stage. A wrong tap counts as
 * one full stage, so a child who is guessing is guided sooner rather than
 * later. Stage 3 always points directly at the tappable target. */
export const HINT_STAGE_DELAYS = [3500, 7000, 10500];

export function shuffle(items, random) {
  const pick = random || Math.random;
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(pick() * (index + 1));
    const held = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = held;
  }
  return result;
}

function byId(catalog, id) {
  for (let index = 0; index < catalog.length; index += 1) {
    if (catalog[index].id === id) return catalog[index];
  }
  throw new Error("Unknown catalog item: " + id);
}

function modulo(value, length) {
  return ((value % length) + length) % length;
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function safeParse(value) {
  if (!value) return {};
  try {
    return JSON.parse(value) || {};
  } catch (error) {
    return {};
  }
}

/* ------------------------------------------------------------------ farm */
/*
 * Six growing places are laid out on a fixed 3x2 board. Slot order is stable so
 * the scene never reshuffles under the child's finger; only the request order
 * is randomised.
 */
export function createFarmRound(roundIndex, random) {
  const authored = FARM_ROUNDS[modulo(roundIndex, FARM_ROUNDS.length)];
  const items = authored.ids.map(function (id, index) {
    const item = byId(FARM_ITEMS, id);
    return {
      id: item.id,
      label: item.label,
      kind: item.kind,
      habitat: item.habitat,
      slot: index,
    };
  });
  return {
    activity: "farm",
    sceneId: authored.id,
    items: items,
    quest: shuffle(items, random).map(function (item) {
      return item.id;
    }),
  };
}

/* --------------------------------------------------------------- animals */
/*
 * One silhouette, several candidates. The candidate row grows from two to four
 * across the session, which is the only difficulty knob the child ever meets.
 */
export function createAnimalRound(roundIndex, random) {
  const authored = ANIMAL_ROUNDS[modulo(roundIndex, ANIMAL_ROUNDS.length)];
  const choiceCount = Math.min(authored.choices, authored.ids.length);
  const order = shuffle(authored.ids, random);
  const steps = order.map(function (targetId) {
    const decoys = shuffle(
      authored.ids.filter(function (id) {
        return id !== targetId;
      }),
      random,
    ).slice(0, choiceCount - 1);
    return {
      targetId: targetId,
      choices: shuffle([targetId].concat(decoys), random),
    };
  });
  return {
    activity: "animal",
    sceneId: authored.id,
    choiceCount: choiceCount,
    steps: steps,
  };
}

export function animalById(id) {
  return byId(ANIMALS, id);
}

/* -------------------------------------------------------------- literacy */
export function literacyCatalog(activity) {
  if (activity === "hiragana") return HIRAGANA;
  if (activity === "alphabet") return ALPHABET;
  throw new Error("Unknown literacy activity: " + activity);
}

/*
 * The whole chart is always on screen; only the requested letters advance.
 * A session walks fifteen letters, and the saved curriculum index makes the
 * next session continue where this one stopped.
 */
export function createLiteracyRound(activity, roundIndex, curriculumIndex) {
  const catalog = literacyCatalog(activity);
  const start = nonNegativeInteger(curriculumIndex)
    + modulo(roundIndex, ROUNDS_PER_ACTIVITY) * LITERACY_TARGETS_PER_ROUND;
  const targets = [];
  for (let index = 0; index < LITERACY_TARGETS_PER_ROUND; index += 1) {
    targets.push(catalog[modulo(start + index, catalog.length)]);
  }
  return { activity: activity, targets: targets };
}

export function nextCurriculumIndex(activity, currentIndex, amount) {
  const step = amount === undefined ? LITERACY_TARGETS_PER_SESSION : amount;
  let catalog;
  try {
    catalog = literacyCatalog(activity);
  } catch (error) {
    return nonNegativeInteger(currentIndex);
  }
  return modulo(nonNegativeInteger(currentIndex) + step, catalog.length);
}

/* ------------------------------------------------------------ progression */
export function createRound(activity, roundIndex, options) {
  const settings = options || {};
  if (activity === "farm") return createFarmRound(roundIndex, settings.random);
  if (activity === "animal") return createAnimalRound(roundIndex, settings.random);
  if (activity === "hiragana" || activity === "alphabet") {
    return createLiteracyRound(activity, roundIndex, settings.curriculumIndex);
  }
  throw new Error("Unknown activity: " + activity);
}

export function targetsPerRound(activity) {
  if (activity === "farm") return FARM_TARGETS_PER_ROUND;
  if (activity === "animal") return ANIMAL_TARGETS_PER_ROUND;
  return LITERACY_TARGETS_PER_ROUND;
}

export function advanceRound(roundIndex, roundCount) {
  const total = roundCount === undefined ? ROUNDS_PER_ACTIVITY : roundCount;
  const complete = roundIndex + 1 >= total;
  return { complete: complete, roundIndex: complete ? roundIndex : roundIndex + 1 };
}

export function normalizeActivity(value) {
  const legacy = {
    fruit: "farm",
    vegetable: "farm",
    color: "farm",
    shape: "farm",
    count: "animal",
    all: "farm",
  };
  const normalized = legacy[value] || value;
  return ACTIVITY_ORDER.indexOf(normalized) >= 0 ? normalized : "farm";
}

/* -------------------------------------------------------------- guidance */
/*
 * The single source of truth for "how much help is showing". Stage 0 is silent,
 * stage 3 points a hand at the exact element the child must tap, which is why
 * on-screen guidance can never disagree with the required action again.
 */
export function hintStage(idleMilliseconds, wrongTaps) {
  const boost = Math.max(0, Math.floor(Number(wrongTaps) || 0));
  const elapsed = Math.max(0, Number(idleMilliseconds) || 0);
  let stage = boost;
  for (let index = 0; index < HINT_STAGE_DELAYS.length; index += 1) {
    if (elapsed >= HINT_STAGE_DELAYS[index]) stage = Math.max(stage, index + 1);
  }
  return Math.min(stage, HINT_STAGE_DELAYS.length);
}

/* -------------------------------------------------------------- storage */
export function loadSavedState(settingsValue, progressValue, reduceMotionDefault) {
  const settings = safeParse(settingsValue);
  const progress = safeParse(progressValue);
  const legacySound = settings.sound !== false;
  const completed = {};
  ACTIVITY_ORDER.forEach(function (activity) {
    completed[activity] = nonNegativeInteger(
      progress.completed ? progress.completed[activity] : 0,
    );
  });
  return {
    settings: {
      effects: typeof settings.effects === "boolean" ? settings.effects : legacySound,
      voice: typeof settings.voice === "boolean" ? settings.voice : legacySound,
      reduceMotion:
        typeof settings.reduceMotion === "boolean"
          ? settings.reduceMotion
          : reduceMotionDefault === true,
    },
    progress: {
      sessions: nonNegativeInteger(progress.sessions),
      completed: completed,
      curriculum: {
        hiragana: modulo(
          nonNegativeInteger(progress.curriculum ? progress.curriculum.hiragana : 0),
          HIRAGANA.length,
        ),
        alphabet: modulo(
          nonNegativeInteger(progress.curriculum ? progress.curriculum.alphabet : 0),
          ALPHABET.length,
        ),
      },
    },
  };
}
