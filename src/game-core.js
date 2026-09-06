/*
 * Pure game rules. No DOM, no timers, no storage — everything here is
 * deterministic given an injected `random` or seed, so tests/game-core.test.mjs
 * can verify the whole curriculum without a browser.
 */

import {
  ACTIVITY_ORDER,
  ALPHABET,
  ANIMALS,
  ANIMAL_CHOICE_PROGRESSION,
  BAND_MEMBERS,
  BUBBLE_COLORS,
  FARM_HABITATS,
  FARM_ITEMS,
  FIELD_SOURCE_ACTIVITY,
  HIRAGANA,
  LETTER_HABITATS,
  PEEKABOO_CAST,
  PEEKABOO_HIDEOUTS,
  PEEKABOO_TANUKI,
  PLAY_ACTIVITIES,
  isOverhead,
  ROUNDS_PER_ACTIVITY,
} from "./content.js";

export const FARM_TARGETS_PER_ROUND = 6;
export const ANIMAL_TARGETS_PER_ROUND = 4;
export const LITERACY_TARGETS_PER_ROUND = 5;
export const LETTER_FIELD_TARGETS_PER_ROUND = 6;
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

/* ------------------------------------------------------------ randomness */
/*
 * A tiny seeded generator (mulberry32). Sessions should feel different every
 * time, but the letter order also has to survive a reload and keep covering the
 * whole chart, so it is derived from a seed that gets saved.
 */
export function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function nextSeed(seed) {
  const generator = seededRandom(seed);
  generator();
  return Math.floor(generator() * 0xfffffff) + 1;
}

/* ------------------------------------------------------------------ farm */
/*
 * Deal all eighteen foods across the three rounds.
 *
 * A plain shuffle would happily hand one board six trees, so each food goes to
 * whichever round has the least of its growing place and the most space left.
 * Placing the biggest groups first means trees, roots and bushes each land once
 * per round before anything else is dealt, which is what guarantees every board
 * mixes at least three growing places. Ties are broken at random, so the deal
 * still differs every session.
 */
function dealFarmItems(random) {
  const groups = shuffle(FARM_HABITATS, random)
    .map(function (habitat) {
      return shuffle(
        FARM_ITEMS.filter(function (item) {
          return item.habitat === habitat;
        }),
        random,
      );
    })
    .sort(function (left, right) {
      return right.length - left.length;
    });

  const rounds = [];
  const habitatCounts = [];
  const overheadCounts = [];
  for (let index = 0; index < ROUNDS_PER_ACTIVITY; index += 1) {
    rounds.push([]);
    habitatCounts.push({});
    overheadCounts.push(0);
  }

  groups.forEach(function (group) {
    group.forEach(function (item) {
      const overhead = isOverhead(item.habitat);
      let best = -1;
      shuffle(rounds.map(function (unused, index) {
        return index;
      }), random).forEach(function (index) {
        if (rounds[index].length >= FARM_TARGETS_PER_ROUND) return;
        if (best < 0) {
          best = index;
          return;
        }
        /* Spread the growing place first, then the back-row/front-row balance,
         * so no board ends up with a single lonely tree behind five roots. */
        const here = habitatCounts[index][item.habitat] || 0;
        const there = habitatCounts[best][item.habitat] || 0;
        if (here !== there) {
          if (here < there) best = index;
          return;
        }
        const bandHere = overhead ? overheadCounts[index] : rounds[index].length - overheadCounts[index];
        const bandThere = overhead ? overheadCounts[best] : rounds[best].length - overheadCounts[best];
        if (bandHere !== bandThere) {
          if (bandHere < bandThere) best = index;
          return;
        }
        if (rounds[index].length < rounds[best].length) best = index;
      });
      rounds[best].push(item);
      habitatCounts[best][item.habitat] = (habitatCounts[best][item.habitat] || 0) + 1;
      if (overhead) overheadCounts[best] += 1;
    });
  });
  return rounds;
}

/*
 * Lay a board out the way a field actually looks: what you reach up and pick
 * stands in the back row, what you pull out of the ground is in the front row.
 * Order within each band is still shuffled, so no food owns a corner.
 */
function layOutByHeight(items, random) {
  const overhead = shuffle(
    items.filter(function (item) {
      return isOverhead(item.habitat);
    }),
    random,
  );
  const grounded = shuffle(
    items.filter(function (item) {
      return !isOverhead(item.habitat);
    }),
    random,
  );
  return overhead.concat(grounded);
}

export function createFarmSession(random) {
  return dealFarmItems(random).map(function (group, roundIndex) {
    const items = layOutByHeight(group, random).map(function (item, slot) {
      return {
        id: item.id,
        label: item.label,
        kind: item.kind,
        habitat: item.habitat,
        slot: slot,
      };
    });
    return {
      activity: "farm",
      roundIndex: roundIndex,
      items: items,
      quest: shuffle(items, random).map(function (item) {
        return item.id;
      }),
    };
  });
}

/* --------------------------------------------------------------- animals */
/*
 * One silhouette, several candidates. Which animals share a round is random;
 * only the widening choice row is fixed.
 */
export function createAnimalSession(random) {
  const order = shuffle(ANIMALS, random);
  const rounds = [];
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const group = order.slice(
      roundIndex * ANIMAL_TARGETS_PER_ROUND,
      (roundIndex + 1) * ANIMAL_TARGETS_PER_ROUND,
    );
    const choiceCount = Math.min(
      ANIMAL_CHOICE_PROGRESSION[roundIndex] || ANIMAL_CHOICE_PROGRESSION[0],
      group.length,
    );
    rounds.push({
      activity: "animal",
      roundIndex: roundIndex,
      choiceCount: choiceCount,
      steps: shuffle(group, random).map(function (target) {
        const decoys = shuffle(
          group.filter(function (animal) {
            return animal.id !== target.id;
          }),
          random,
        ).slice(0, choiceCount - 1);
        return {
          targetId: target.id,
          choices: shuffle([target].concat(decoys), random).map(function (animal) {
            return animal.id;
          }),
        };
      }),
    });
  }
  return rounds;
}

export function animalById(id) {
  return byId(ANIMALS, id);
}

/* -------------------------------------------------------------- literacy */
export function literacyCatalog(activity) {
  const resolved = FIELD_SOURCE_ACTIVITY[activity] || activity;
  if (resolved === "hiragana") return HIRAGANA;
  if (resolved === "alphabet") return ALPHABET;
  throw new Error("Unknown literacy activity: " + activity);
}

export function isLetterField(activity) {
  return Object.prototype.hasOwnProperty.call(FIELD_SOURCE_ACTIVITY, activity);
}

/*
 * The whole chart is always on screen, so the asking order can be random
 * without making anything harder to find. The order is a saved shuffle of the
 * entire chart, walked fifteen letters per session: no session repeats a
 * letter, and every letter comes round in turn.
 */
export function literacyOrder(activity, seed) {
  return shuffle(literacyCatalog(activity), seededRandom(seed));
}

export function createLiteracySession(activity, curriculumIndex, seed) {
  const order = literacyOrder(activity, seed);
  const start = nonNegativeInteger(curriculumIndex);
  const rounds = [];
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const targets = [];
    for (let index = 0; index < LITERACY_TARGETS_PER_ROUND; index += 1) {
      const position = start + roundIndex * LITERACY_TARGETS_PER_ROUND + index;
      targets.push(order[modulo(position, order.length)]);
    }
    rounds.push({ activity: activity, roundIndex: roundIndex, targets: targets });
  }
  return rounds;
}

/*
 * Advance the saved position, and reshuffle whenever the walk wraps past the
 * end of the chart so the next pass through comes in a different order.
 */
export function advanceCurriculum(activity, currentIndex, seed) {
  let catalog;
  try {
    catalog = literacyCatalog(activity);
  } catch (error) {
    return { index: nonNegativeInteger(currentIndex), seed: nonNegativeInteger(seed) };
  }
  const perSession = isLetterField(activity)
    ? LETTER_FIELD_TARGETS_PER_ROUND * ROUNDS_PER_ACTIVITY
    : LITERACY_TARGETS_PER_SESSION;
  const index = modulo(nonNegativeInteger(currentIndex), catalog.length);
  const raw = index + perSession;
  return {
    index: modulo(raw, catalog.length),
    seed: raw >= catalog.length ? nextSeed(seed) : nonNegativeInteger(seed),
  };
}

/* --------------------------------------------------------- letter fields */
/*
 * Letters growing in a field. There is no request to follow: the child pulls
 * whichever letter they like and hears its sound, so the only rule is that
 * every board offers both gestures — half the letters hang overhead and are
 * pulled down, half are buried and are pulled up.
 */
export function createLetterFieldSession(activity, curriculumIndex, seed) {
  const order = literacyOrder(activity, seed);
  const random = seededRandom(nextSeed(seed));
  const start = nonNegativeInteger(curriculumIndex);
  const half = LETTER_FIELD_TARGETS_PER_ROUND / 2;
  const rounds = [];
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const habitats = shuffle(
      Array.from({ length: half }, function (unused, index) {
        return LETTER_HABITATS.above[index % LETTER_HABITATS.above.length];
      }).concat(
        Array.from({ length: half }, function (unused, index) {
          return LETTER_HABITATS.below[index % LETTER_HABITATS.below.length];
        }),
      ),
      random,
    );
    const planted = [];
    for (let index = 0; index < LETTER_FIELD_TARGETS_PER_ROUND; index += 1) {
      const position = start + roundIndex * LETTER_FIELD_TARGETS_PER_ROUND + index;
      const letter = order[modulo(position, order.length)];
      planted.push({
        id: letter.id,
        glyph: letter.glyph,
        secondary: letter.secondary,
        speak: letter.speak,
        lang: letter.lang,
        word: letter.word,
        sprite: letter.sprite,
        bonusSprite: letter.bonusSprite,
        habitat: habitats[index],
      });
    }
    const items = layOutByHeight(planted, random).map(function (item, slot) {
      item.slot = slot;
      return item;
    });
    rounds.push({ activity: activity, roundIndex: roundIndex, items: items });
  }
  return rounds;
}

/* ------------------------------------------------------------ toy boards */
/*
 * The four toys have no rounds, no questions and no end. What they need from
 * the rules is therefore not a session but a dealer: hand me the next guest,
 * the next plate, the next bubble — and never hand me one that is already on
 * the board, because two of the same thing in front of a toddler reads as a
 * mistake rather than as variety.
 */
export function isPlayActivity(activity) {
  return PLAY_ACTIVITIES.indexOf(activity) >= 0;
}

/* How many things each toy keeps in front of the child at once. */
export const BAND_FRIENDS = BAND_MEMBERS.length;
export const PEEKABOO_SPOTS = 6;
export const FEAST_PLATES = 6;
export const BUBBLES_ON_SCREEN = 6;

/* How many taps earn a spontaneous celebration. Nothing gates on it: the play
 * carries on either way, it just occasionally boils over. */
export const CHEER_EVERY = 8;

/*
 * Draw one item that is not already out. Falling back to the whole catalogue
 * rather than returning nothing matters: a dealer that can run dry would end a
 * toy that is not allowed to end.
 */
export function pickNext(catalog, taken, random) {
  const free = catalog.filter(function (item) {
    return taken.indexOf(item.id) < 0;
  });
  return shuffle(free.length ? free : catalog, random)[0];
}

/* The tanuki turns up in the hiding places about one guest in five: often
 * enough to be worth hoping for, rarely enough to still be a surprise. */
export const PEEKABOO_TANUKI_CHANCE = 0.2;

export function nextGuest(taken, random) {
  const pick = random || Math.random;
  if (taken.indexOf(PEEKABOO_TANUKI.id) < 0 && pick() < PEEKABOO_TANUKI_CHANCE) {
    return PEEKABOO_TANUKI;
  }
  return pickNext(PEEKABOO_CAST, taken, pick);
}

export function dealPeekaboo(random) {
  const pick = random || Math.random;
  const hideouts = shuffle(PEEKABOO_HIDEOUTS, pick);
  const taken = [];
  const spots = [];
  for (let index = 0; index < PEEKABOO_SPOTS; index += 1) {
    /* One tanuki on the opening board, so the first thing found can be the
     * one the child came for. */
    const guest = index === 0 ? PEEKABOO_TANUKI : nextGuest(taken, pick);
    taken.push(guest.id);
    spots.push({
      slot: index,
      hideout: hideouts[index % hideouts.length],
      id: guest.id,
      label: guest.label,
      en: guest.en,
      sprite: guest.sprite,
      isTanuki: guest.isTanuki === true,
    });
  }
  return shuffle(spots, pick).map(function (spot, index) {
    spot.slot = index;
    return spot;
  });
}

export function nextCourse(taken, random) {
  return pickNext(FARM_ITEMS, taken, random || Math.random);
}

export function dealFeast(random) {
  const pick = random || Math.random;
  const taken = [];
  const plates = [];
  for (let index = 0; index < FEAST_PLATES; index += 1) {
    const item = nextCourse(taken, pick);
    taken.push(item.id);
    plates.push({ slot: index, id: item.id, label: item.label, en: item.en, kind: item.kind });
  }
  return plates;
}

/* The band never changes who is in it, only where they stand. */
export function dealBand(random) {
  return shuffle(BAND_MEMBERS, random).map(function (member, index) {
    return {
      slot: index,
      id: member.id,
      animal: member.animal,
      frequency: member.frequency,
      color: member.color,
    };
  });
}

/*
 * Bubbles. One per cell of a hidden 3x2 grid, jittered inside its own cell, so
 * they never line up like a chart and can never pile up on top of each other —
 * which is what keeps every one of them reachable by a clumsy finger.
 */
const BUBBLE_COLUMNS = 3;
const BUBBLE_ROWS = 2;
export const BUBBLE_CELLS = BUBBLE_COLUMNS * BUBBLE_ROWS;

export function makeBubble(cell, serial, random) {
  const pick = random || Math.random;
  const column = cell % BUBBLE_COLUMNS;
  const row = Math.floor(cell / BUBBLE_COLUMNS);
  return {
    id: "bubble-" + serial,
    cell: cell,
    color: BUBBLE_COLORS[serial % BUBBLE_COLORS.length],
    /* Percentages of the play area, with the margins chosen so a bubble's edge
     * never leaves it even at the largest size. */
    x: (column + 0.5) * (100 / BUBBLE_COLUMNS) + (pick() * 10 - 5),
    y: (row + 0.5) * (100 / BUBBLE_ROWS) + (pick() * 8 - 4),
    size: 17 + pick() * 7,
    /* A slow sway: alive enough to be worth chasing, slow enough that a
     * toddler's finger lands on it anyway. */
    sway: 2.6 + pick() * 2.6,
    duration: 4200 + pick() * 2600,
    delay: pick() * 1400,
  };
}

export function dealBubbles(random) {
  const pick = random || Math.random;
  const cells = [];
  for (let index = 0; index < BUBBLE_COLUMNS * BUBBLE_ROWS; index += 1) cells.push(index);
  return shuffle(cells, pick)
    .slice(0, BUBBLES_ON_SCREEN)
    .map(function (cell, index) {
      return makeBubble(cell, index, pick);
    });
}

/* ------------------------------------------------------------ progression */
/*
 * A session is all three rounds. Building them together is what lets the farm
 * guarantee that every food appears exactly once even though the deal is random.
 */
export function createSession(activity, options) {
  const settings = options || {};
  const random = settings.random || Math.random;
  if (isPlayActivity(activity)) {
    throw new Error("Play activities have no session: they never end");
  }
  if (activity === "farm") return { activity: activity, rounds: createFarmSession(random) };
  if (activity === "animal") return { activity: activity, rounds: createAnimalSession(random) };
  if (activity === "hiragana" || activity === "alphabet") {
    return {
      activity: activity,
      rounds: createLiteracySession(activity, settings.curriculumIndex, settings.curriculumSeed),
    };
  }
  if (isLetterField(activity)) {
    return {
      activity: activity,
      rounds: createLetterFieldSession(activity, settings.curriculumIndex, settings.curriculumSeed),
    };
  }
  throw new Error("Unknown activity: " + activity);
}

export function targetsPerRound(activity) {
  if (activity === "farm") return FARM_TARGETS_PER_ROUND;
  if (activity === "animal") return ANIMAL_TARGETS_PER_ROUND;
  if (isLetterField(activity)) return LETTER_FIELD_TARGETS_PER_ROUND;
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

/* --------------------------------------------------------------- storage */
export const LETTER_ACTIVITIES = ["hiragana", "alphabet", "hiragana-field", "alphabet-field"];

function sanitiseCurriculum(saved) {
  const result = {};
  LETTER_ACTIVITIES.forEach(function (activity) {
    result[activity] = modulo(
      nonNegativeInteger(saved ? saved[activity] : 0),
      literacyCatalog(activity).length,
    );
  });
  return result;
}

function sanitiseSeeds(saved) {
  const result = {};
  LETTER_ACTIVITIES.forEach(function (activity) {
    result[activity] = nonNegativeInteger(saved ? saved[activity] : 0);
  });
  return result;
}

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
  const curriculum = progress.curriculum || {};
  const seeds = progress.curriculumSeed || {};
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
      /* The chart game and the letter field walk the alphabet independently. */
      curriculum: sanitiseCurriculum(curriculum),
      /* Zero means "never seeded"; the app picks a random seed on first play so
       * two devices do not walk the alphabet in the same order. */
      curriculumSeed: sanitiseSeeds(seeds),
    },
  };
}
