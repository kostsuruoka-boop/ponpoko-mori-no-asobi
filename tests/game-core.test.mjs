import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

import {
  ACTIVITY_META,
  ACTIVITY_ORDER,
  ALPHABET,
  ANIMALS,
  ANIMAL_CHOICE_PROGRESSION,
  BAND_MEMBERS,
  BAND_TANUKI,
  BUBBLE_COLORS,
  FARM_HABITATS,
  FARM_ITEMS,
  FRUITS,
  HABITAT_PULL,
  HIRAGANA,
  LEARN_ACTIVITIES,
  LETTER_HABITATS,
  PEEKABOO_CAST,
  PEEKABOO_HIDEOUTS,
  PEEKABOO_TANUKI,
  PLAY_ACTIVITIES,
  YUM,
  isOverhead,
  ROUNDS_PER_ACTIVITY,
  VEGETABLES,
} from "../src/content.js";
import {
  ANIMAL_TARGETS_PER_ROUND,
  FARM_TARGETS_PER_ROUND,
  HINT_STAGE_DELAYS,
  LETTER_FIELD_TARGETS_PER_ROUND,
  LITERACY_TARGETS_PER_ROUND,
  LITERACY_TARGETS_PER_SESSION,
  advanceCurriculum,
  advanceRound,
  animalById,
  BAND_NOTES_PER_ROUND,
  BUBBLES_PER_ROUND,
  FEAST_COURSES_PER_ROUND,
  PEEKABOO_SPOTS_PER_ROUND,
  createAnimalSession,
  createBandSession,
  createBubbleSession,
  createFarmSession,
  createFeastSession,
  createPeekabooSession,
  createLetterFieldSession,
  createLiteracySession,
  createSession,
  hintStage,
  literacyCatalog,
  isLetterField,
  isPlayActivity,
  literacyOrder,
  loadSavedState,
  nextSeed,
  normalizeActivity,
  seededRandom,
  shuffle,
  targetsPerRound,
} from "../src/game-core.js";
import {
  HABITATS,
  HIDEOUTS,
  habitatFor,
  hideoutFor,
  pullDirection,
  pullSign,
} from "../src/scenery.js";

/* Distinct generators so a bug that ignores `random` cannot pass by accident. */
const SEEDS = [1, 7, 99, 12345, 20260809, 777777];
const generators = () => SEEDS.map((seed) => seededRandom(seed));

/* ------------------------------------------------------------- catalogue */

test("the requested fruit, vegetable and animal catalogues stay available", () => {
  assert.deepEqual(FRUITS.map((item) => item.id).toSorted(), [
    "apple", "banana", "cherry", "grape", "lemon", "orange", "peach", "strawberry", "watermelon",
  ]);
  assert.deepEqual(VEGETABLES.map((item) => item.id).toSorted(), [
    "cabbage", "carrot", "cucumber", "daikon", "edamame", "eggplant", "onion", "pumpkin", "sweet-potato",
  ]);
  assert.deepEqual(ANIMALS.map((item) => item.id).toSorted(), [
    "bird", "camel", "cat", "dog", "elephant", "giraffe", "hippo", "lion", "monkey", "panda", "pig", "zebra",
  ]);
});

test("every produce grows where it really grows and has drawn scenery", () => {
  const habitatById = Object.fromEntries(FARM_ITEMS.map((item) => [item.id, item.habitat]));
  ["apple", "orange", "peach", "cherry", "lemon"].forEach((id) => assert.equal(habitatById[id], "tree"));
  ["daikon", "carrot", "onion", "sweet-potato"].forEach((id) => assert.equal(habitatById[id], "soil"));
  ["grape", "cucumber"].forEach((id) => assert.equal(habitatById[id], "trellis"));
  ["strawberry", "edamame", "eggplant"].forEach((id) => assert.equal(habitatById[id], "bush"));
  ["watermelon", "pumpkin"].forEach((id) => assert.equal(habitatById[id], "vine"));
  assert.equal(habitatById.cabbage, "ground");
  assert.equal(habitatById.banana, "palm");

  assert.deepEqual(FARM_HABITATS.toSorted(), Object.keys(HABITATS).toSorted());
  FARM_ITEMS.forEach((item) => {
    const habitat = habitatFor(item.habitat);
    assert.ok(habitat.back.includes("<svg"), `${item.habitat} needs a back layer`);
    assert.ok(habitat.scale > 0.3 && habitat.scale < 0.6);
  });
});

test("only buried produce is covered by a front layer of soil", () => {
  assert.ok(habitatFor("soil").front.includes("<svg"));
  assert.ok(habitatFor("soil").rise > habitatFor("tree").rise);
  assert.equal(habitatFor("tree").front, "");
});

test("the alphabet is spoken as letter names, never as a capital letter", () => {
  ALPHABET.forEach((item) => {
    assert.ok(item.speak, `${item.glyph} needs a spoken name`);
    assert.notEqual(item.speak, item.glyph, `${item.glyph} would be read as "capital"`);
    assert.equal(item.speak, item.speak.toLowerCase());
  });
  assert.equal(ALPHABET[0].speak, "ay");
  assert.equal(ALPHABET.at(-1).speak, "zee");
});

test("nothing asks どーこだ any more", () => {
  Object.keys(ACTIVITY_META).forEach((activity) => {
    const meta = ACTIVITY_META[activity];
    assert.equal(meta.askSuffix, undefined);
    assert.ok((meta.askPrefix || "").indexOf("どーこだ") < 0);
  });
});

test("every animal has a label and only iconic ones carry a cry", () => {
  ANIMALS.forEach((animal) => assert.ok(animal.label.length > 0));
  assert.equal(animalById("dog").cry, "ワンワン");
  assert.equal(animalById("zebra").cry, undefined);
  assert.throws(() => animalById("dragon"), /Unknown catalog item/);
});

/* ------------------------------------------------------------ randomness */

test("the seeded generator is deterministic, in range, and moves on", () => {
  assert.deepEqual(
    Array.from({ length: 4 }, seededRandom(42)),
    Array.from({ length: 4 }, seededRandom(42)),
  );
  assert.notDeepEqual(
    Array.from({ length: 4 }, seededRandom(42)),
    Array.from({ length: 4 }, seededRandom(43)),
  );
  const values = Array.from({ length: 500 }, seededRandom(2026));
  assert.ok(values.every((value) => value >= 0 && value < 1));
  assert.ok(new Set(values).size > 400, "the generator must not get stuck");
  assert.notEqual(nextSeed(5), 5);
  assert.ok(nextSeed(0) > 0);
  assert.equal(nextSeed(5), nextSeed(5));
});

/* ------------------------------------------------------------------ farm */

test("a farm session always features all eighteen foods exactly once", () => {
  generators().forEach((random) => {
    const rounds = createFarmSession(random);
    assert.equal(rounds.length, ROUNDS_PER_ACTIVITY);
    const featured = [];
    rounds.forEach((round, roundIndex) => {
      assert.equal(round.activity, "farm");
      assert.equal(round.roundIndex, roundIndex);
      assert.equal(round.items.length, FARM_TARGETS_PER_ROUND);
      assert.deepEqual(round.items.map((item) => item.slot), [0, 1, 2, 3, 4, 5]);
      assert.deepEqual(
        round.quest.toSorted(),
        round.items.map((item) => item.id).toSorted(),
        "the round may only ask for produce that is on its board",
      );
      featured.push(...round.items.map((item) => item.id));
    });
    assert.deepEqual(featured.toSorted(), FARM_ITEMS.map((item) => item.id).toSorted());
  });
});

test("what you pick stands behind what you pull out of the ground", () => {
  /* Swept, because a rare deal that put a tree in the front row would look
   * wrong on screen without failing anything else. */
  for (let seed = 1; seed <= 600; seed += 1) {
    createFarmSession(seededRandom(seed)).forEach((round, roundIndex) => {
      let seenGrounded = false;
      round.items.forEach((item) => {
        if (isOverhead(item.habitat)) {
          assert.ok(!seenGrounded, `seed ${seed} round ${roundIndex}: ${item.id} is out of order`);
        } else {
          seenGrounded = true;
        }
      });
      const overhead = round.items.filter((item) => isOverhead(item.habitat)).length;
      assert.ok(overhead >= 2 && overhead <= 3, `seed ${seed}: ${overhead} in the back row`);
    });
  }
});

test("a letter field is laid out the same way", () => {
  SEEDS.forEach((seed) => {
    createLetterFieldSession("hiragana-field", 0, seed).forEach((round) => {
      const bands = round.items.map((item) => (isOverhead(item.habitat) ? "up" : "down"));
      assert.deepEqual(bands, ["up", "up", "up", "down", "down", "down"]);
    });
  });
});

test("a randomly dealt farm board still mixes several growing places", () => {
  /* Swept rather than sampled: this invariant is the whole reason the deal is
   * not a plain shuffle, and a rare bad hand would otherwise ship. */
  for (let seed = 1; seed <= 600; seed += 1) {
    const rounds = createFarmSession(seededRandom(seed));
    const featured = [];
    rounds.forEach((round, roundIndex) => {
      const habitats = new Set(round.items.map((item) => item.habitat));
      assert.ok(
        habitats.size >= 4,
        `seed ${seed} round ${roundIndex} only has ${habitats.size} habitats`,
      );
      featured.push(...round.items.map((item) => item.id));
    });
    assert.equal(new Set(featured).size, FARM_ITEMS.length, `seed ${seed} lost produce`);
  }
});

test("farm boards, slots and asking order all differ between sessions", () => {
  const boards = new Set();
  const slots = new Set();
  const quests = new Set();
  SEEDS.forEach((seed) => {
    const rounds = createFarmSession(seededRandom(seed));
    boards.add(rounds.map((round) => round.items.map((item) => item.id).toSorted().join(",")).join("|"));
    slots.add(rounds[0].items.map((item) => item.id).join(","));
    quests.add(rounds[0].quest.join(","));
  });
  assert.ok(boards.size > 1, "which foods share a round must vary");
  assert.ok(slots.size > 1, "where a food grows on the board must vary");
  assert.ok(quests.size > 1, "the asking order must vary");
});

/* --------------------------------------------------------------- animals */

test("an animal session covers all twelve animals with a widening choice row", () => {
  generators().forEach((random) => {
    const rounds = createAnimalSession(random);
    const featured = [];
    rounds.forEach((round, roundIndex) => {
      assert.equal(round.activity, "animal");
      assert.equal(round.steps.length, ANIMAL_TARGETS_PER_ROUND);
      assert.equal(round.choiceCount, ANIMAL_CHOICE_PROGRESSION[roundIndex]);
      const inRound = round.steps.map((step) => step.targetId);
      round.steps.forEach((step) => {
        assert.equal(step.choices.length, round.choiceCount);
        assert.equal(new Set(step.choices).size, step.choices.length);
        assert.equal(step.choices.filter((id) => id === step.targetId).length, 1);
        step.choices.forEach((id) => assert.ok(inRound.includes(id), "decoys come from this round"));
      });
      featured.push(...inRound);
    });
    assert.deepEqual(featured.toSorted(), ANIMALS.map((animal) => animal.id).toSorted());
  });
  assert.deepEqual(ANIMAL_CHOICE_PROGRESSION, [2, 3, 4]);
});

test("animal groupings and silhouette order differ between sessions", () => {
  const groupings = new Set();
  const orders = new Set();
  SEEDS.forEach((seed) => {
    const rounds = createAnimalSession(seededRandom(seed));
    groupings.add(rounds.map((round) => round.steps.map((step) => step.targetId).toSorted().join(",")).join("|"));
    orders.add(rounds[0].steps.map((step) => step.targetId).join(","));
  });
  assert.ok(groupings.size > 1, "which animals share a round must vary");
  assert.ok(orders.size > 1, "the silhouette order must vary");
});

/* ---------------------------------------------------------- pull gestures */

test("one declaration decides the gesture, the guidance and the layout", () => {
  Object.keys(HABITATS).forEach((habitat) => {
    assert.ok(["up", "down"].includes(HABITAT_PULL[habitat]), `${habitat} needs a pull direction`);
    /* The renderer, the input and the layout must all read the same value. */
    assert.equal(pullDirection(habitat), HABITAT_PULL[habitat]);
    assert.equal(pullSign(habitat), HABITAT_PULL[habitat] === "down" ? 1 : -1);
    assert.equal(isOverhead(habitat), HABITAT_PULL[habitat] === "down");
  });
  assert.deepEqual(LETTER_HABITATS.above, ["tree", "trellis", "palm"]);
  assert.deepEqual(LETTER_HABITATS.below, ["soil", "bush", "vine", "ground"]);
  const all = LETTER_HABITATS.above.concat(LETTER_HABITATS.below);
  assert.equal(new Set(all).size, Object.keys(HABITATS).length);
});

/* ------------------------------------------------------------ letter field */

test("a letter field board offers both gestures every round", () => {
  ["hiragana-field", "alphabet-field"].forEach((activity) => {
    assert.ok(isLetterField(activity));
    SEEDS.forEach((seed) => {
      const rounds = createLetterFieldSession(activity, 0, seed);
      assert.equal(rounds.length, ROUNDS_PER_ACTIVITY);
      const asked = [];
      rounds.forEach((round) => {
        assert.equal(round.activity, activity);
        assert.equal(round.items.length, LETTER_FIELD_TARGETS_PER_ROUND);
        assert.deepEqual(round.items.map((item) => item.slot), [0, 1, 2, 3, 4, 5]);
        const up = round.items.filter((item) => pullSign(item.habitat) < 0);
        const down = round.items.filter((item) => pullSign(item.habitat) > 0);
        assert.equal(up.length, 3, "half the board must be pulled up");
        assert.equal(down.length, 3, "half the board must be pulled down");
        assert.deepEqual(round.items.map((item) => item.slot), [0, 1, 2, 3, 4, 5]);
        round.items.forEach((item) => {
          assert.ok(item.glyph, "a letter crop needs a glyph");
          assert.ok(item.speak, "a letter crop needs a sound");
          assert.ok(HABITATS[item.habitat], `unknown habitat ${item.habitat}`);
        });
        asked.push(...round.items.map((item) => item.glyph));
      });
      assert.equal(new Set(asked).size, asked.length, "no letter twice in a session");
    });
  });
});

test("the letter field keeps its own place in the chart", () => {
  const field = advanceCurriculum("hiragana-field", 0, 500);
  assert.equal(field.index, LETTER_FIELD_TARGETS_PER_ROUND * ROUNDS_PER_ACTIVITY);
  const chart = advanceCurriculum("hiragana", 0, 500);
  assert.equal(chart.index, LITERACY_TARGETS_PER_SESSION);
  assert.notEqual(field.index, chart.index, "the two games must not share a position");
  assert.equal(literacyCatalog("alphabet-field"), literacyCatalog("alphabet"));
});

/* -------------------------------------------------------------- literacy */

test("the hiragana chart is a complete 五十音図 with ん beside わ", () => {
  assert.equal(HIRAGANA.length, 46);
  assert.equal(new Set(HIRAGANA.map((item) => item.glyph)).size, 46);
  const at = (column, row) => HIRAGANA.find((item) => item.column === column && item.row === row);
  assert.equal(at(0, 0).glyph, "あ");
  assert.equal(at(1, 0).glyph, "か");
  assert.equal(at(7, 1), undefined, "や行 has no い段");
  assert.equal(at(9, 0).glyph, "わ");
  assert.equal(at(9, 1).glyph, "ん");
  assert.equal(at(9, 4).glyph, "を");
  HIRAGANA.forEach((item) => {
    assert.ok(item.column >= 0 && item.column <= 9);
    assert.ok(item.row >= 0 && item.row <= 4);
    assert.equal(item.lang, "ja-JP");
  });
});

test("the alphabet chart covers A to Z with case pairs and a word for each", () => {
  assert.equal(ALPHABET.length, 26);
  assert.equal(ALPHABET[0].glyph, "A");
  assert.equal(ALPHABET.at(-1).glyph, "Z");
  ALPHABET.forEach((item) => {
    assert.equal(item.secondary, item.glyph.toLowerCase());
    assert.ok(item.word && item.word[0] === item.glyph, `${item.glyph} needs a matching word`);
    assert.ok(item.sprite, `${item.glyph} needs a picture`);
    assert.equal(item.lang, "en-US");
  });
});

test("letters that already have shipped artwork never depend on the bonus sheet", () => {
  const shipped = ALPHABET.filter((item) => !item.bonusSprite).map((item) => item.glyph);
  assert.deepEqual(shipped, ["A", "B", "C", "D", "E", "G", "H", "L", "M", "O", "P", "S", "W", "Z"]);
  ALPHABET.filter((item) => item.bonusSprite).forEach((item) => {
    assert.ok(item.sprite.startsWith("abc-"));
  });
});

test("every picture the game can name has a sprite file on disk", () => {
  const sprites = new Set(
    readdirSync(new URL("../assets/sprites/", import.meta.url))
      .filter((name) => name.endsWith(".png"))
      .map((name) => name.slice(0, -4)),
  );
  FARM_ITEMS.forEach((item) => assert.ok(sprites.has(item.id), `missing sprite: ${item.id}`));
  ANIMALS.forEach((animal) => assert.ok(sprites.has(animal.id), `missing sprite: ${animal.id}`));
  ["wave", "run", "reach", "basket", "push", "jump"].forEach((pose) => {
    assert.ok(sprites.has(`tanuki-${pose}`), `missing tanuki pose: ${pose}`);
  });
  ALPHABET.forEach((item) => assert.ok(sprites.has(item.sprite), `missing sprite: ${item.sprite}`));
  HIRAGANA.filter((item) => item.sprite).forEach((item) => {
    assert.ok(sprites.has(item.sprite), `missing sprite: ${item.sprite}`);
  });
});

test("hiragana reward words reuse pictures the child already met", () => {
  const withPictures = HIRAGANA.filter((item) => item.sprite);
  assert.ok(withPictures.length >= 15);
  const spriteIds = new Set(
    FARM_ITEMS.map((item) => item.id).concat(ANIMALS.map((animal) => animal.id)),
  );
  withPictures.forEach((item) => {
    assert.ok(spriteIds.has(item.sprite), `${item.glyph} points at unknown sprite ${item.sprite}`);
  });
});

test("the letter order is a full shuffle of the chart, stable for one seed", () => {
  ["hiragana", "alphabet"].forEach((activity) => {
    const catalog = literacyCatalog(activity);
    const order = literacyOrder(activity, 4242);
    assert.deepEqual(
      order.map((item) => item.id).toSorted(),
      catalog.map((item) => item.id).toSorted(),
      "every letter has to stay reachable",
    );
    assert.deepEqual(order, literacyOrder(activity, 4242));
    assert.notDeepEqual(
      order.map((item) => item.id),
      literacyOrder(activity, 4243).map((item) => item.id),
    );
    assert.notDeepEqual(
      order.map((item) => item.id),
      catalog.map((item) => item.id),
      "the asking order must not be plain chart order",
    );
  });
});

test("a literacy session asks fifteen different letters in random order", () => {
  ["hiragana", "alphabet"].forEach((activity) => {
    SEEDS.forEach((seed) => {
      const rounds = createLiteracySession(activity, 0, seed);
      assert.equal(rounds.length, ROUNDS_PER_ACTIVITY);
      const asked = [];
      rounds.forEach((round) => {
        assert.equal(round.targets.length, LITERACY_TARGETS_PER_ROUND);
        asked.push(...round.targets.map((target) => target.glyph));
      });
      assert.equal(asked.length, LITERACY_TARGETS_PER_SESSION);
      assert.equal(new Set(asked).size, LITERACY_TARGETS_PER_SESSION, "no letter twice in a session");
    });
  });
});

test("a session wrapping past the end of the chart still never repeats a letter", () => {
  const rounds = createLiteracySession("alphabet", 20, 31337);
  const asked = rounds.flatMap((round) => round.targets.map((target) => target.glyph));
  assert.equal(asked.length, LITERACY_TARGETS_PER_SESSION);
  assert.equal(new Set(asked).size, LITERACY_TARGETS_PER_SESSION);
});

test("the curriculum walks the chart and reshuffles once it wraps", () => {
  const first = advanceCurriculum("hiragana", 0, 900);
  assert.deepEqual(first, { index: 15, seed: 900 }, "mid-chart keeps the same order");
  const second = advanceCurriculum("hiragana", 30, 900);
  assert.equal(second.index, 45);
  assert.equal(second.seed, 900);
  const wrapped = advanceCurriculum("hiragana", 45, 900);
  assert.equal(wrapped.index, 14);
  assert.notEqual(wrapped.seed, 900, "a new pass gets a new order");
  assert.equal(advanceCurriculum("alphabet", 15, 5).index, 4);
  assert.notEqual(advanceCurriculum("alphabet", 15, 5).seed, 5);
  assert.deepEqual(advanceCurriculum("farm", 3, 8), { index: 3, seed: 8 });
});

test("three sessions in a row cover most of the hiragana chart", () => {
  let index = 0;
  let seed = 2026;
  const seen = new Set();
  for (let session = 0; session < 3; session += 1) {
    createLiteracySession("hiragana", index, seed).forEach((round) => {
      round.targets.forEach((target) => seen.add(target.glyph));
    });
    const advanced = advanceCurriculum("hiragana", index, seed);
    index = advanced.index;
    seed = advanced.seed;
  }
  assert.equal(seen.size, 45, "45 of the 46 characters within three sessions");
});

/* -------------------------------------------------------------- guidance */

test("guidance escalates on idling and reaches the pointing stage on wrong taps", () => {
  assert.equal(hintStage(0, 0), 0);
  assert.equal(hintStage(HINT_STAGE_DELAYS[0] - 1, 0), 0);
  assert.equal(hintStage(HINT_STAGE_DELAYS[0], 0), 1);
  assert.equal(hintStage(HINT_STAGE_DELAYS[1], 0), 2);
  assert.equal(hintStage(HINT_STAGE_DELAYS[2], 0), 3);
  assert.equal(hintStage(999_999, 0), 3, "guidance never goes past pointing");
  assert.equal(hintStage(0, 1), 1);
  assert.equal(hintStage(0, 3), 3);
  assert.equal(hintStage(0, 99), 3);
  assert.equal(hintStage(-5, -5), 0);
  assert.equal(hintStage(Number.NaN, Number.NaN), 0);
});

/* ------------------------------------------------------------ play modes */

test("every band friend has its own pitch, and every pitch is pentatonic", () => {
  assert.equal(BAND_MEMBERS.length, BAND_NOTES_PER_ROUND);
  const ids = BAND_MEMBERS.map((member) => member.id);
  assert.equal(new Set(ids).size, BAND_MEMBERS.length);
  const animals = new Set(ANIMALS.map((animal) => animal.id));
  const pitches = new Set();
  BAND_MEMBERS.concat([BAND_TANUKI]).forEach((member) => {
    assert.ok(member.frequency > 0, `${member.id} needs a pitch`);
    assert.ok(member.voice.length > 0, `${member.id} needs a voice`);
    assert.ok(!pitches.has(member.frequency), `${member.id} duplicates a pitch`);
    pitches.add(member.frequency);
  });
  BAND_MEMBERS.forEach((member) => {
    assert.ok(animals.has(member.animal), `${member.id} points at an unknown animal`);
    assert.ok(/^#[0-9a-f]{6}$/.test(member.color), `${member.id} needs a colour`);
  });

  /*
   * Any order of taps has to stay consonant, so every note must be a degree of
   * one pentatonic scale — C, D, E, G or A, in any octave. Measured in
   * equal-tempered semitones above C4, which is what the frequencies are.
   */
  const PENTATONIC = [0, 2, 4, 7, 9];
  BAND_MEMBERS.concat([BAND_TANUKI]).forEach((member) => {
    const semitones = 12 * Math.log2(member.frequency / 261.63);
    const rounded = Math.round(semitones);
    assert.ok(
      Math.abs(semitones - rounded) < 0.05,
      `${member.id} at ${member.frequency}Hz is not on the chromatic grid`,
    );
    assert.ok(
      PENTATONIC.indexOf(((rounded % 12) + 12) % 12) >= 0,
      `${member.id} at ${member.frequency}Hz is not a pentatonic degree`,
    );
  });
});

test("the band deals every friend into every round, in a different order", () => {
  const orders = new Set();
  generators().forEach((random) => {
    const rounds = createBandSession(random);
    assert.equal(rounds.length, ROUNDS_PER_ACTIVITY);
    rounds.forEach((round) => {
      assert.equal(round.items.length, BAND_NOTES_PER_ROUND);
      assert.deepEqual(
        round.items.map((item) => item.id).toSorted(),
        BAND_MEMBERS.map((member) => member.id).toSorted(),
      );
      round.items.forEach((item, index) => assert.equal(item.slot, index));
      orders.add(round.items.map((item) => item.id).join(","));
    });
  });
  assert.ok(orders.size > 1, "the band always lines up the same way");
});

test("somebody is hiding behind every peekaboo spot, and one of them is the tanuki", () => {
  generators().forEach((random) => {
    const rounds = createPeekabooSession(random);
    assert.equal(rounds.length, ROUNDS_PER_ACTIVITY);
    const seen = new Set();
    rounds.forEach((round) => {
      assert.equal(round.items.length, PEEKABOO_SPOTS_PER_ROUND);
      const tanuki = round.items.filter((item) => item.isTanuki);
      assert.equal(tanuki.length, 1, "every board needs exactly one tanuki");
      const ids = round.items.map((item) => item.id);
      assert.equal(new Set(ids).size, ids.length, "a guest appears twice on one board");
      const hideouts = round.items.map((item) => item.hideout);
      assert.equal(new Set(hideouts).size, hideouts.length, "two guests share a hiding place");
      round.items.forEach((item, index) => {
        assert.equal(item.slot, index);
        assert.ok(item.label.length > 0);
        assert.ok(item.speak.length > 0);
        assert.ok(PEEKABOO_HIDEOUTS.indexOf(item.hideout) >= 0);
        /* Only the tanuki is drawn from a pose rather than a sprite. */
        assert.equal(item.isTanuki, item.sprite === null);
        if (!item.isTanuki) seen.add(item.id);
      });
    });
    assert.equal(seen.size, (PEEKABOO_SPOTS_PER_ROUND - 1) * ROUNDS_PER_ACTIVITY,
      "a guest repeated inside one session");
  });
});

test("the peekaboo cast is built from artwork the child has already met", () => {
  assert.equal(PEEKABOO_TANUKI.sprite, null);
  assert.equal(PEEKABOO_TANUKI.speak, "ばあ");
  const known = new Set(
    ANIMALS.map((animal) => animal.id).concat(FRUITS.map((fruit) => fruit.id)),
  );
  assert.equal(PEEKABOO_CAST.length, ANIMALS.length + FRUITS.length);
  PEEKABOO_CAST.forEach((guest) => {
    assert.ok(known.has(guest.sprite), `${guest.id} points at unknown artwork`);
    assert.equal(guest.isTanuki, false);
  });
  /* Enough guests that a session never has to repeat one. */
  assert.ok(PEEKABOO_CAST.length >= (PEEKABOO_SPOTS_PER_ROUND - 1) * ROUNDS_PER_ACTIVITY);
});

test("every hiding place can hide and reveal a guest", () => {
  assert.deepEqual(Object.keys(HIDEOUTS).toSorted(), PEEKABOO_HIDEOUTS.slice().toSorted());
  Object.keys(HIDEOUTS).forEach((name) => {
    const hideout = HIDEOUTS[name];
    assert.ok(hideout.back.indexOf("<svg") === 0, `${name} needs back artwork`);
    assert.ok(hideout.front.indexOf("<svg") === 0, `${name} needs a cover`);
    /* The window has to leave room above the opening for a guest to rise into,
     * and the opening has to sit low enough to look like a container. */
    assert.ok(hideout.coverTop >= 50 && hideout.coverTop <= 72, `${name} opening is misplaced`);
    assert.ok(hideout.guestScale > 0.3 && hideout.guestScale < 0.7);
    assert.ok(hideout.lip > 0 && hideout.lip < 30);
  });
  assert.equal(hideoutFor("nowhere"), HIDEOUTS.box);
});

test("the feast serves all eighteen foods across one session", () => {
  generators().forEach((random) => {
    const rounds = createFeastSession(random);
    assert.equal(rounds.length, ROUNDS_PER_ACTIVITY);
    const served = [];
    rounds.forEach((round) => {
      assert.equal(round.items.length, FEAST_COURSES_PER_ROUND);
      round.items.forEach((item, index) => {
        assert.equal(item.slot, index);
        assert.ok(item.label.length > 0);
        served.push(item.id);
      });
    });
    assert.deepEqual(served.toSorted(), FARM_ITEMS.map((item) => item.id).toSorted());
  });
});

test("the tanuki has something to say with its mouth full", () => {
  assert.ok(YUM.length >= 3);
  YUM.forEach((word) => assert.ok(word.length > 0));
  assert.equal(new Set(YUM).size, YUM.length);
});

test("bubbles are spread one to a cell and stay inside the board", () => {
  assert.equal(BUBBLE_COLORS.length, BUBBLES_PER_ROUND);
  generators().forEach((random) => {
    const rounds = createBubbleSession(random);
    assert.equal(rounds.length, ROUNDS_PER_ACTIVITY);
    rounds.forEach((round) => {
      assert.equal(round.items.length, BUBBLES_PER_ROUND);
      const ids = round.items.map((item) => item.id);
      assert.equal(new Set(ids).size, ids.length);
      const colors = round.items.map((item) => item.color);
      assert.equal(new Set(colors).size, colors.length, "two bubbles share a colour");
      round.items.forEach((item, index) => {
        assert.equal(item.slot, index);
        /* Kept well inside the board: a bubble whose edge left the play area
         * would be a target a child could not finish popping. */
        assert.ok(item.x > 8 && item.x < 92, `bubble x out of bounds: ${item.x}`);
        assert.ok(item.y > 15 && item.y < 85, `bubble y out of bounds: ${item.y}`);
        assert.ok(item.size >= 17 && item.size <= 24, `bubble size out of range: ${item.size}`);
        assert.ok(item.duration >= 4000, "a bubble that drifts too fast to catch");
        assert.ok(item.sway > 0 && item.sway < 6);
        assert.ok(item.delay >= 0);
      });
      /* No two bubbles in the same cell means none can hide behind another. */
      const cells = round.items.map(
        (item) => Math.floor(item.x / 33.34) + "," + Math.floor(item.y / 50),
      );
      assert.equal(new Set(cells).size, cells.length, "two bubbles landed in one cell");
    });
  });
});

test("every play board fills its shelf exactly", () => {
  PLAY_ACTIVITIES.forEach((activity) => {
    const session = createSession(activity, { random: seededRandom(4242) });
    session.rounds.forEach((round) => {
      assert.equal(round.items.length, targetsPerRound(activity),
        `${activity} board does not match its shelf`);
    });
  });
});

/* ----------------------------------------------------------- progression */

test("the session factory supports every mode and rejects unknown ones", () => {
  assert.deepEqual(ACTIVITY_ORDER, [
    "band", "peekaboo", "feast", "bubble",
    "farm", "animal", "hiragana", "alphabet", "hiragana-field", "alphabet-field",
  ]);
  /* Play comes before learning, and the two lists never overlap. */
  assert.deepEqual(PLAY_ACTIVITIES.concat(LEARN_ACTIVITIES), ACTIVITY_ORDER);
  PLAY_ACTIVITIES.forEach((activity) => {
    assert.ok(isPlayActivity(activity), `${activity} should be a play mode`);
  });
  LEARN_ACTIVITIES.forEach((activity) => {
    assert.ok(!isPlayActivity(activity), `${activity} should not be a play mode`);
  });
  ACTIVITY_ORDER.forEach((activity) => {
    const session = createSession(activity, {
      random: seededRandom(11),
      curriculumIndex: 3,
      curriculumSeed: 12,
    });
    assert.equal(session.activity, activity);
    assert.equal(session.rounds.length, ROUNDS_PER_ACTIVITY);
    session.rounds.forEach((round) => assert.equal(round.activity, activity));
    assert.ok(ACTIVITY_META[activity].title.length > 0);
  });
  assert.equal(targetsPerRound("band"), 6);
  assert.equal(targetsPerRound("peekaboo"), 6);
  assert.equal(targetsPerRound("feast"), 6);
  assert.equal(targetsPerRound("bubble"), 6);
  assert.equal(targetsPerRound("farm"), 6);
  assert.equal(targetsPerRound("animal"), 4);
  assert.equal(targetsPerRound("hiragana"), 5);
  assert.equal(targetsPerRound("alphabet-field"), 6);
  assert.throws(() => createSession("unknown"), /Unknown activity/);
  assert.throws(() => literacyCatalog("farm"), /Unknown literacy activity/);
});

test("two sessions of the same mode are not the same session", () => {
  const first = createSession("farm", { random: seededRandom(3) });
  const second = createSession("farm", { random: seededRandom(4) });
  assert.notDeepEqual(
    first.rounds.map((round) => round.items.map((item) => item.id)),
    second.rounds.map((round) => round.items.map((item) => item.id)),
  );
});

test("round advancement waits for the child at every completed board", () => {
  assert.deepEqual(advanceRound(0), { complete: false, roundIndex: 1 });
  assert.deepEqual(advanceRound(1), { complete: false, roundIndex: 2 });
  assert.deepEqual(advanceRound(2), { complete: true, roundIndex: 2 });
});

test("legacy modes migrate and unknown values fall back to the farm", () => {
  assert.equal(normalizeActivity("fruit"), "farm");
  assert.equal(normalizeActivity("count"), "animal");
  assert.equal(normalizeActivity("hiragana"), "hiragana");
  assert.equal(normalizeActivity(undefined), "farm");
});

test("shuffle keeps every item and leaves the input untouched", () => {
  const source = [1, 2, 3, 4];
  assert.deepEqual(shuffle(source, () => 0).toSorted(), source);
  assert.deepEqual(source, [1, 2, 3, 4]);
  assert.equal(shuffle(source).length, 4);
});

/* --------------------------------------------------------------- storage */

test("saved state is sanitised and migrates the old sound preference", () => {
  const loaded = loadSavedState(
    '{"sound":false,"reduceMotion":true}',
    '{"sessions":"4.8","completed":{"farm":2,"animal":-2},"curriculum":{"hiragana":48,"alphabet":28},"curriculumSeed":{"hiragana":"77","alphabet":-3}}',
  );
  assert.deepEqual(loaded.settings, { effects: false, voice: false, reduceMotion: true });
  assert.equal(loaded.progress.sessions, 4);
  assert.equal(loaded.progress.completed.farm, 2);
  assert.equal(loaded.progress.completed.animal, 0);
  assert.equal(loaded.progress.curriculum.hiragana, 2);
  assert.equal(loaded.progress.curriculum.alphabet, 2);
  assert.equal(loaded.progress.curriculumSeed.hiragana, 77);
  assert.equal(loaded.progress.curriculumSeed.alphabet, 0);
  assert.equal(loaded.progress.curriculum["hiragana-field"], 0);
  assert.equal(loaded.progress.curriculumSeed["alphabet-field"], 0);
});

test("unreadable storage still produces a playable default state", () => {
  const loaded = loadSavedState(null, "not json", true);
  assert.deepEqual(loaded.settings, { effects: true, voice: true, reduceMotion: true });
  assert.equal(loaded.progress.sessions, 0);
  ACTIVITY_ORDER.forEach((activity) => assert.equal(loaded.progress.completed[activity], 0));
  assert.equal(loaded.progress.curriculum.hiragana, 0);
  assert.equal(loaded.progress.curriculumSeed.alphabet, 0, "zero means the app picks a seed");
});
