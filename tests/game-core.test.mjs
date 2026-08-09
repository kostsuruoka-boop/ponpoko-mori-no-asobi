import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVITY_ORDER,
  ALPHABET,
  ANIMALS,
  FARM_ITEMS,
  FRUITS,
  HIRAGANA,
  ROUNDS_PER_ACTIVITY,
  VEGETABLES,
  advanceRound,
  createAnimalRound,
  createChoiceSet,
  createFarmRound,
  createLiteracyRound,
  createRound,
  dragDistance,
  isPointInsideRect,
  loadSavedState,
  nextCurriculumIndex,
  normalizeActivity,
  shuffle,
} from "../src/game-core.js";

test("shuffle preserves every item without mutating the input", () => {
  const source = [1, 2, 3, 4];
  assert.deepEqual(shuffle(source, () => 0).toSorted(), source);
  assert.deepEqual(source, [1, 2, 3, 4]);
});

test("the exact requested fruit, vegetable, and animal catalogs remain available", () => {
  assert.deepEqual(FRUITS.map((item) => item.id), [
    "apple", "orange", "grape", "peach", "cherry", "lemon", "strawberry", "watermelon", "banana",
  ]);
  assert.deepEqual(VEGETABLES.map((item) => item.id), [
    "daikon", "cabbage", "pumpkin", "carrot", "onion", "edamame", "cucumber", "eggplant", "sweet-potato",
  ]);
  assert.deepEqual(ANIMALS.map((item) => item.id), [
    "dog", "cat", "panda", "lion", "elephant", "giraffe", "hippo", "monkey", "zebra", "camel", "pig", "bird",
  ]);
});

test("three farm rounds feature all eighteen foods exactly once", () => {
  const featured = [];
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const round = createFarmRound(roundIndex);
    assert.equal(round.activity, "farm");
    assert.equal(round.items.length, 6);
    assert.equal(new Set(round.items.map((item) => item.instanceId)).size, 6);
    featured.push(...round.items.map((item) => item.id));
  }
  assert.deepEqual(featured.toSorted(), FARM_ITEMS.map((item) => item.id).toSorted());
  assert.equal(new Set(featured).size, FARM_ITEMS.length);
});

test("farm sources reflect how the produce actually grows", () => {
  const sourceById = Object.fromEntries(FARM_ITEMS.map((item) => [item.id, item.source]));
  assert.equal(sourceById.cucumber, "trellis");
  assert.equal(sourceById.grape, "trellis");
  assert.equal(sourceById.watermelon, "vine");
  assert.equal(sourceById.pumpkin, "vine");
  assert.equal(sourceById.strawberry, "bush");
  assert.equal(sourceById.cabbage, "ground");
  ["daikon", "carrot", "onion", "sweet-potato"].forEach((id) => assert.equal(sourceById[id], "root"));
  ["apple", "orange", "peach", "cherry", "lemon"].forEach((id) => assert.equal(sourceById[id], "tree"));
});

test("animal rounds contain the same four identities in dock and shuffled homes", () => {
  const featured = [];
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const round = createAnimalRound(roundIndex, () => 0);
    assert.equal(round.activity, "animal");
    assert.equal(round.animals.length, 4);
    assert.deepEqual(round.targets.map((item) => item.id).toSorted(), round.animals.map((item) => item.id).toSorted());
    featured.push(...round.animals.map((animal) => animal.id));
  }
  assert.deepEqual(featured.toSorted(), ANIMALS.map((animal) => animal.id).toSorted());
});

test("the literacy catalogs contain 46 base hiragana and 26 alphabet letters", () => {
  assert.equal(HIRAGANA.length, 46);
  assert.equal(new Set(HIRAGANA.map((item) => item.glyph)).size, 46);
  assert.equal(HIRAGANA[0].glyph, "あ");
  assert.equal(HIRAGANA.at(-1).glyph, "ん");
  assert.equal(ALPHABET.length, 26);
  assert.equal(ALPHABET[0].glyph, "A");
  assert.equal(ALPHABET.at(-1).glyph, "Z");
  assert.ok(ALPHABET.every((item) => item.secondary === item.glyph.toLowerCase()));
});

test("every sound-match target has exactly one correct choice and two decoys", () => {
  for (const catalog of [HIRAGANA, ALPHABET]) {
    for (const target of catalog) {
      const choices = createChoiceSet(catalog, target.id, () => 0.4);
      assert.equal(choices.length, 3);
      assert.equal(new Set(choices.map((choice) => choice.id)).size, 3);
      assert.equal(choices.filter((choice) => choice.id === target.id).length, 1);
    }
  }
});

test("literacy rounds advance through a persisted curriculum in sets of three", () => {
  const first = createLiteracyRound("hiragana", 0, 0, () => 0.2);
  const second = createLiteracyRound("hiragana", 1, 0, () => 0.2);
  assert.deepEqual(first.targets.map((item) => item.glyph), ["あ", "い", "う"]);
  assert.deepEqual(second.targets.map((item) => item.glyph), ["え", "お", "か"]);
  assert.deepEqual(createLiteracyRound("alphabet", 0, 24, () => 0.2).targets.map((item) => item.glyph), ["Y", "Z", "A"]);
  assert.equal(nextCurriculumIndex("hiragana", 42), 5);
  assert.equal(nextCurriculumIndex("alphabet", 20), 3);
});

test("round factory supports all four independent modes", () => {
  assert.deepEqual(ACTIVITY_ORDER, ["farm", "animal", "hiragana", "alphabet"]);
  assert.equal(createRound("farm", 0).activity, "farm");
  assert.equal(createRound("animal", 0, { random: () => 0.3 }).activity, "animal");
  assert.equal(createRound("hiragana", 0, { curriculumIndex: 9 }).activity, "hiragana");
  assert.equal(createRound("alphabet", 0, { curriculumIndex: 9 }).activity, "alphabet");
  assert.throws(() => createRound("unknown", 0), /Unknown activity/);
});

test("round advancement waits for the child at every completed board", () => {
  assert.deepEqual(advanceRound(0), { complete: false, roundIndex: 1 });
  assert.deepEqual(advanceRound(1), { complete: false, roundIndex: 2 });
  assert.deepEqual(advanceRound(2), { complete: true, roundIndex: 2 });
});

test("legacy themes migrate to the farm and current themes remain stable", () => {
  assert.equal(normalizeActivity("fruit"), "farm");
  assert.equal(normalizeActivity("vegetable"), "farm");
  assert.equal(normalizeActivity("count"), "animal");
  assert.equal(normalizeActivity("hiragana"), "hiragana");
  assert.equal(normalizeActivity("bad"), "farm");
});

test("saved state is sanitized and migrates the old sound preference", () => {
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

test("drag geometry tolerates invalid values and generous drop padding", () => {
  assert.equal(dragDistance(0, 0, 3, 4), 5);
  assert.equal(dragDistance(0, 0, Number.NaN, 4), 0);
  const rect = { left: 100, top: 100, right: 200, bottom: 200 };
  assert.equal(isPointInsideRect({ x: 150, y: 150 }, rect), true);
  assert.equal(isPointInsideRect({ x: 82, y: 150 }, rect, 20), true);
  assert.equal(isPointInsideRect({ x: 70, y: 150 }, rect, 20), false);
});
