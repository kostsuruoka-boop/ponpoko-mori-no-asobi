import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVITY_META,
  ACTIVITY_ORDER,
  ALPHABET,
  ANIMALS,
  ANIMAL_ROUNDS,
  FARM_ITEMS,
  FARM_ROUNDS,
  FRUITS,
  HIRAGANA,
  ROUNDS_PER_ACTIVITY,
  VEGETABLES,
} from "../src/content.js";
import {
  ANIMAL_TARGETS_PER_ROUND,
  FARM_TARGETS_PER_ROUND,
  HINT_STAGE_DELAYS,
  LITERACY_TARGETS_PER_ROUND,
  LITERACY_TARGETS_PER_SESSION,
  advanceRound,
  animalById,
  createAnimalRound,
  createFarmRound,
  createLiteracyRound,
  createRound,
  hintStage,
  literacyCatalog,
  loadSavedState,
  nextCurriculumIndex,
  normalizeActivity,
  shuffle,
  targetsPerRound,
} from "../src/game-core.js";
import { HABITATS, habitatFor } from "../src/scenery.js";

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

  FARM_ITEMS.forEach((item) => {
    assert.ok(HABITATS[item.habitat], `${item.id} needs habitat art for ${item.habitat}`);
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

test("every animal has a label and only iconic ones carry a cry", () => {
  ANIMALS.forEach((animal) => assert.ok(animal.label.length > 0));
  assert.equal(animalById("dog").cry, "ワンワン");
  assert.equal(animalById("zebra").cry, undefined);
  assert.throws(() => animalById("dragon"), /Unknown catalog item/);
});

/* ------------------------------------------------------------------ farm */

test("three farm rounds feature all eighteen foods exactly once", () => {
  const featured = [];
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const round = createFarmRound(roundIndex, () => 0.5);
    assert.equal(round.activity, "farm");
    assert.equal(round.items.length, FARM_TARGETS_PER_ROUND);
    featured.push(...round.items.map((item) => item.id));
  }
  assert.deepEqual(featured.toSorted(), FARM_ITEMS.map((item) => item.id).toSorted());
});

test("farm slots are stable while the request order is shuffled", () => {
  const round = createFarmRound(0, () => 0.99);
  assert.deepEqual(round.items.map((item) => item.slot), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(round.items.map((item) => item.id), FARM_ROUNDS[0].ids);
  assert.deepEqual(round.quest.toSorted(), FARM_ROUNDS[0].ids.toSorted());
  assert.equal(round.quest.length, new Set(round.quest).size);
});

test("each farm round mixes growing places so the scene never repeats itself", () => {
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const round = createFarmRound(roundIndex, () => 0.3);
    const habitats = new Set(round.items.map((item) => item.habitat));
    assert.ok(habitats.size >= 3, `round ${roundIndex} only has ${habitats.size} habitats`);
  }
});

/* --------------------------------------------------------------- animals */

test("animal rounds ask for one silhouette at a time with growing choices", () => {
  const featured = [];
  const expectedChoices = ANIMAL_ROUNDS.map((round) => round.choices);
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const round = createAnimalRound(roundIndex, () => 0.5);
    assert.equal(round.activity, "animal");
    assert.equal(round.steps.length, ANIMAL_TARGETS_PER_ROUND);
    assert.equal(round.choiceCount, expectedChoices[roundIndex]);
    round.steps.forEach((step) => {
      assert.equal(step.choices.length, expectedChoices[roundIndex]);
      assert.equal(new Set(step.choices).size, step.choices.length);
      assert.equal(step.choices.filter((id) => id === step.targetId).length, 1);
      step.choices.forEach((id) => assert.ok(ANIMAL_ROUNDS[roundIndex].ids.includes(id)));
    });
    featured.push(...round.steps.map((step) => step.targetId));
  }
  assert.deepEqual(featured.toSorted(), ANIMALS.map((animal) => animal.id).toSorted());
  assert.deepEqual(expectedChoices, [2, 3, 4]);
});

/* -------------------------------------------------------------- literacy */

test("the hiragana chart is a complete 五十音図 with ん beside わ", () => {
  assert.equal(HIRAGANA.length, 46);
  assert.equal(new Set(HIRAGANA.map((item) => item.glyph)).size, 46);
  const at = (column, row) =>
    HIRAGANA.find((item) => item.column === column && item.row === row);
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

test("hiragana reward words reuse pictures the child already met", () => {
  const withPictures = HIRAGANA.filter((item) => item.sprite);
  assert.ok(withPictures.length >= 15);
  const spriteIds = new Set(
    FARM_ITEMS.map((item) => item.id).concat(ANIMALS.map((animal) => animal.id)),
  );
  withPictures.forEach((item) => {
    assert.ok(spriteIds.has(item.sprite), `${item.glyph} points at unknown sprite ${item.sprite}`);
    assert.ok(item.word.startsWith(item.glyph) || item.word.length > 1);
  });
});

test("a literacy session walks fifteen letters and remembers where it stopped", () => {
  const first = createLiteracyRound("hiragana", 0, 0);
  const second = createLiteracyRound("hiragana", 1, 0);
  assert.equal(first.targets.length, LITERACY_TARGETS_PER_ROUND);
  assert.deepEqual(first.targets.map((item) => item.glyph), ["あ", "い", "う", "え", "お"]);
  assert.deepEqual(second.targets.map((item) => item.glyph), ["か", "き", "く", "け", "こ"]);
  assert.equal(LITERACY_TARGETS_PER_SESSION, 15);
  assert.equal(nextCurriculumIndex("hiragana", 0), 15);
  assert.equal(nextCurriculumIndex("hiragana", 40), 9);
  assert.equal(nextCurriculumIndex("alphabet", 20), 9);
  assert.equal(nextCurriculumIndex("nothing", 4), 4);
  assert.throws(() => literacyCatalog("farm"), /Unknown literacy activity/);
});

test("a literacy session never repeats a letter inside the same session", () => {
  const seen = [];
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    seen.push(...createLiteracyRound("alphabet", roundIndex, 4).targets.map((item) => item.glyph));
  }
  assert.equal(seen.length, LITERACY_TARGETS_PER_SESSION);
  assert.equal(new Set(seen).size, LITERACY_TARGETS_PER_SESSION);
  assert.equal(seen[0], "E");
});

/* ------------------------------------------------------------- guidance */

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

/* ----------------------------------------------------------- progression */

test("the round factory supports all four modes and rejects unknown ones", () => {
  assert.deepEqual(ACTIVITY_ORDER, ["farm", "animal", "hiragana", "alphabet"]);
  ACTIVITY_ORDER.forEach((activity) => {
    const round = createRound(activity, 0, { curriculumIndex: 3, random: () => 0.4 });
    assert.equal(round.activity, activity);
    assert.ok(ACTIVITY_META[activity].title.length > 0);
    assert.ok(targetsPerRound(activity) >= 4);
  });
  assert.equal(targetsPerRound("farm"), 6);
  assert.equal(targetsPerRound("animal"), 4);
  assert.equal(targetsPerRound("hiragana"), 5);
  assert.throws(() => createRound("unknown", 0), /Unknown activity/);
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

/* -------------------------------------------------------------- storage */

test("saved state is sanitised and migrates the old sound preference", () => {
  const loaded = loadSavedState(
    '{"sound":false,"reduceMotion":true}',
    '{"sessions":"4.8","completed":{"farm":2,"animal":-2},"curriculum":{"hiragana":48,"alphabet":28}}',
  );
  assert.deepEqual(loaded.settings, { effects: false, voice: false, reduceMotion: true });
  assert.equal(loaded.progress.sessions, 4);
  assert.equal(loaded.progress.completed.farm, 2);
  assert.equal(loaded.progress.completed.animal, 0);
  assert.equal(loaded.progress.curriculum.hiragana, 2);
  assert.equal(loaded.progress.curriculum.alphabet, 2);
});

test("unreadable storage still produces a playable default state", () => {
  const loaded = loadSavedState(null, "not json", true);
  assert.deepEqual(loaded.settings, { effects: true, voice: true, reduceMotion: true });
  assert.equal(loaded.progress.sessions, 0);
  ACTIVITY_ORDER.forEach((activity) => assert.equal(loaded.progress.completed[activity], 0));
  assert.equal(loaded.progress.curriculum.hiragana, 0);
});
