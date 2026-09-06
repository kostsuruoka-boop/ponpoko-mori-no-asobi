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
  BAND_FRIENDS,
  BUBBLES_ON_SCREEN,
  CHEER_EVERY,
  FEAST_PLATES,
  PEEKABOO_SPOTS,
  PEEKABOO_TANUKI_CHANCE,
  createAnimalSession,
  createFarmSession,
  dealBand,
  dealBubbles,
  dealFeast,
  dealPeekaboo,
  makeBubble,
  nextCourse,
  nextGuest,
  pickNext,
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

/* ------------------------------------------------------------ toy boards */

test("every band friend has a cry of its own, over a pentatonic note", () => {
  assert.equal(BAND_MEMBERS.length, BAND_FRIENDS);
  const ids = BAND_MEMBERS.map((member) => member.id);
  assert.equal(new Set(ids).size, BAND_MEMBERS.length);
  const pitches = new Set();
  BAND_MEMBERS.concat([BAND_TANUKI]).forEach((member) => {
    assert.ok(member.frequency > 0, `${member.id} needs a pitch`);
    assert.ok(!pitches.has(member.frequency), `${member.id} duplicates a pitch`);
    pitches.add(member.frequency);
  });

  /*
   * Pressing an animal makes that animal's noise, so only animals with an
   * iconic cry can be in the band. This is what fixes the line-up: a panda
   * pad would have nothing to say when pressed.
   */
  const cries = new Set();
  BAND_MEMBERS.forEach((member) => {
    const animal = animalById(member.animal);
    assert.ok(animal, `${member.id} points at an unknown animal`);
    assert.ok(animal.cry, `${member.id} is an animal with no cry`);
    assert.ok(!cries.has(animal.cry), `${member.id} duplicates a cry`);
    cries.add(animal.cry);
    assert.ok(/^#[0-9a-f]{6}$/.test(member.color), `${member.id} needs a colour`);
  });

  /*
   * The cries sit over a quiet note each, and any order of taps has to stay
   * consonant, so every note must be a degree of one pentatonic scale — C, D, E, G or A, in any octave. Measured in
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

test("the band always brings everyone, and lines up differently", () => {
  const orders = new Set();
  generators().forEach((random) => {
    const row = dealBand(random);
    assert.equal(row.length, BAND_FRIENDS);
    assert.deepEqual(
      row.map((member) => member.id).toSorted(),
      BAND_MEMBERS.map((member) => member.id).toSorted(),
    );
    row.forEach((member, index) => assert.equal(member.slot, index));
    orders.add(row.map((member) => member.id).join(","));
  });
  assert.ok(orders.size > 1, "the band always lines up the same way");
});

test("a dealer never hands out something that is already on the board", () => {
  const catalog = [{ id: "a" }, { id: "b" }, { id: "c" }];
  generators().forEach((random) => {
    assert.equal(pickNext(catalog, ["a", "b"], random).id, "c");
    /* And when everything is out it still deals: a toy that can run dry would
     * end, and these are not allowed to end. */
    assert.ok(pickNext(catalog, ["a", "b", "c"], random));
  });
});

test("the opening peekaboo board hides six different guests, one of them the tanuki", () => {
  generators().forEach((random) => {
    const spots = dealPeekaboo(random);
    assert.equal(spots.length, PEEKABOO_SPOTS);
    const tanuki = spots.filter((spot) => spot.isTanuki);
    assert.equal(tanuki.length, 1, "every opening board needs exactly one tanuki");
    const ids = spots.map((spot) => spot.id);
    assert.equal(new Set(ids).size, ids.length, "a guest appears twice");
    const hideouts = spots.map((spot) => spot.hideout);
    assert.equal(new Set(hideouts).size, hideouts.length, "two guests share a hiding place");
    spots.forEach((spot, index) => {
      assert.equal(spot.slot, index);
      assert.ok(spot.label.length > 0);
      assert.ok(spot.en.length > 0, `${spot.id} has nothing to say`);
      assert.ok(PEEKABOO_HIDEOUTS.indexOf(spot.hideout) >= 0);
      /* Only the tanuki is drawn from a pose rather than a sprite. */
      assert.equal(spot.isTanuki, spot.sprite === null);
    });
  });
});

test("the next guest is somebody new, and is sometimes the tanuki", () => {
  assert.ok(PEEKABOO_TANUKI_CHANCE > 0 && PEEKABOO_TANUKI_CHANCE < 0.5);
  const random = seededRandom(31);
  const seenTanuki = new Set();
  for (let round = 0; round < 300; round += 1) {
    const taken = PEEKABOO_CAST.slice(0, 3).map((guest) => guest.id);
    const guest = nextGuest(taken, random);
    assert.ok(taken.indexOf(guest.id) < 0, "dealt a guest who is already out");
    if (guest.isTanuki) seenTanuki.add(guest.id);
  }
  assert.equal(seenTanuki.size, 1, "the tanuki never turns up");
  /* And it stays away while it is already on the board. */
  for (let round = 0; round < 60; round += 1) {
    assert.ok(!nextGuest([PEEKABOO_TANUKI.id], random).isTanuki);
  }
});

test("the peekaboo cast is built from artwork the child has already met", () => {
  assert.equal(PEEKABOO_TANUKI.sprite, null);
  const known = new Set(
    ANIMALS.map((animal) => animal.id).concat(FRUITS.map((fruit) => fruit.id)),
  );
  assert.equal(PEEKABOO_CAST.length, ANIMALS.length + FRUITS.length);
  PEEKABOO_CAST.forEach((guest) => {
    assert.ok(known.has(guest.sprite), `${guest.id} points at unknown artwork`);
    assert.equal(guest.isTanuki, false);
    assert.ok(guest.en && guest.en.length > 0, `${guest.id} has no English name`);
  });
  assert.ok(PEEKABOO_CAST.length > PEEKABOO_SPOTS);
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
    assert.ok(hideout.guestScale > 0.3 && hideout.guestScale < 0.9);
    assert.ok(hideout.lip > 0 && hideout.lip < 30);
    /*
     * A guest is only visible between the top of the box and the opening, so
     * anything larger than this has its head clipped off — which is exactly
     * how they ended up looking too small the first time, from the other side.
     */
    const largest = (hideout.coverTop / 100) / (1 - hideout.lip / 100);
    assert.ok(
      hideout.guestScale <= largest,
      `${name} guest is taller than its window (${hideout.guestScale} > ${largest.toFixed(2)})`,
    );
    assert.ok(
      hideout.guestScale > largest - 0.09,
      `${name} guest wastes its window (${hideout.guestScale} vs ${largest.toFixed(2)})`,
    );
  });
  assert.equal(hideoutFor("nowhere"), HIDEOUTS.box);
});

test("the tray always holds six different things to give", () => {
  generators().forEach((random) => {
    const plates = dealFeast(random);
    assert.equal(plates.length, FEAST_PLATES);
    const ids = plates.map((plate) => plate.id);
    assert.equal(new Set(ids).size, ids.length, "the same food is on two plates");
    plates.forEach((plate, index) => {
      assert.equal(plate.slot, index);
      assert.ok(plate.label.length > 0);
      assert.ok(plate.en.length > 0, `${plate.id} has nothing to say`);
    });
    /* Refilling a plate must not duplicate what is still on the tray. */
    const replacement = nextCourse(ids.slice(1), random);
    assert.ok(ids.slice(1).indexOf(replacement.id) < 0);
  });
});

test("every food and animal has an English name for the toys to say", () => {
  FARM_ITEMS.concat(ANIMALS).forEach((item) => {
    assert.ok(item.en && item.en.length > 0, `${item.id} has no English name`);
    assert.ok(/^[A-Z][A-Za-z ]*$/.test(item.en), `${item.id} has an odd English name: ${item.en}`);
  });
});

test("bubbles are spread one to a cell and stay inside the board", () => {
  assert.equal(BUBBLE_COLORS.length, BUBBLES_ON_SCREEN);
  generators().forEach((random) => {
    const sky = dealBubbles(random);
    assert.equal(sky.length, BUBBLES_ON_SCREEN);
    const ids = sky.map((bubble) => bubble.id);
    assert.equal(new Set(ids).size, ids.length);
    const colors = sky.map((bubble) => bubble.color);
    assert.equal(new Set(colors).size, colors.length, "two bubbles share a colour");
    sky.forEach((bubble) => {
      /* Kept well inside the board: a bubble whose edge left the play area
       * would be a target a child could not finish popping. */
      assert.ok(bubble.x > 8 && bubble.x < 92, `bubble x out of bounds: ${bubble.x}`);
      assert.ok(bubble.y > 15 && bubble.y < 85, `bubble y out of bounds: ${bubble.y}`);
      assert.ok(bubble.size >= 17 && bubble.size <= 24, `bubble size out of range: ${bubble.size}`);
      assert.ok(bubble.duration >= 4000, "a bubble that drifts too fast to catch");
      assert.ok(bubble.sway > 0 && bubble.sway < 6);
      assert.ok(bubble.delay >= 0);
    });
    /* No two in the same cell means none can hide behind another. */
    const cells = sky.map((bubble) => bubble.cell);
    assert.equal(new Set(cells).size, cells.length, "two bubbles landed in one cell");
    /* A replacement stays in the cell the popped one left. */
    const replacement = makeBubble(sky[0].cell, 99, random);
    assert.equal(replacement.cell, sky[0].cell);
    assert.ok(replacement.x > 8 && replacement.x < 92);
  });
});

test("the toys celebrate often enough to be worth playing for", () => {
  assert.ok(CHEER_EVERY >= 4 && CHEER_EVERY <= 12);
});

/* ----------------------------------------------------------- progression */

test("the finding games have sessions and the toys refuse to", () => {
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
    assert.ok(ACTIVITY_META[activity].title.length > 0);
  });
  LEARN_ACTIVITIES.forEach((activity) => {
    const session = createSession(activity, {
      random: seededRandom(11),
      curriculumIndex: 3,
      curriculumSeed: 12,
    });
    assert.equal(session.activity, activity);
    assert.equal(session.rounds.length, ROUNDS_PER_ACTIVITY);
    session.rounds.forEach((round) => assert.equal(round.activity, activity));
  });
  /* A toy has no session because it has no end. Asking for one is a bug in the
   * caller, so it throws rather than quietly handing back an empty shape. */
  PLAY_ACTIVITIES.forEach((activity) => {
    assert.throws(() => createSession(activity), /never end/);
  });
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
