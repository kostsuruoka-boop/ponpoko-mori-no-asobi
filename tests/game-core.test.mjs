import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVITY_ORDER,
  ANIMALS,
  FRUITS,
  ROUNDS_PER_ACTIVITY,
  VEGETABLES,
  advanceRound,
  clamp,
  createAnimalRound,
  createFruitRound,
  createRound,
  createVegetableRound,
  dragProgress,
  getActivityOrder,
  loadSavedState,
  normalizeActivityPreference,
  shuffle,
} from "../src/game-core.js";

test("shuffle preserves every option without mutating the input", () => {
  const source = [1, 2, 3, 4];
  assert.deepEqual(shuffle(source, () => 0).toSorted(), source);
  assert.deepEqual(source, [1, 2, 3, 4]);
});

test("the authored catalogs contain every requested fruit, vegetable, and animal", () => {
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

test("fruit rounds contain unique discoverable fruit instances", () => {
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const round = createFruitRound(roundIndex, () => 0.42);
    assert.equal(round.activity, "fruit");
    assert.equal(round.items.length, 3);
    assert.equal(new Set(round.items.map((item) => item.instanceId)).size, round.items.length);
    assert.ok(round.items.every((item) => FRUITS.some((fruit) => fruit.id === item.id)));
  }
});

test("vegetable rounds contain pullable produce and grow in complexity", () => {
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const round = createVegetableRound(roundIndex, () => 0.31);
    assert.equal(round.activity, "vegetable");
    assert.equal(round.items.length, 3);
    assert.ok(round.items.every((item) => VEGETABLES.some((vegetable) => vegetable.id === item.id)));
    assert.ok(round.items.every((item) => item.pull > 0 && item.pull <= 1));
  }
});

test("animal rounds feature all twelve requested animals exactly once", () => {
  const featured = [];
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const round = createAnimalRound(roundIndex);
    assert.equal(round.activity, "animal");
    assert.equal(round.animals.length, 4);
    assert.equal(round.stepCount, 4);
    assert.ok(["garden", "savanna", "world"].includes(round.scene));
    featured.push(...round.animals.map((animal) => animal.id));
  }
  assert.deepEqual(featured.toSorted(), ANIMALS.map((animal) => animal.id).toSorted());
  assert.equal(new Set(featured).size, 12);
});

test("round factory creates only the three physical-play activities", () => {
  assert.equal(createRound("fruit", 0, () => 0.2).activity, "fruit");
  assert.equal(createRound("vegetable", 0, () => 0.2).activity, "vegetable");
  assert.equal(createRound("animal", 0).activity, "animal");
  assert.throws(() => createRound("unknown", 0), /Unknown activity/);
});

test("activity preference supports one theme and migrates legacy names", () => {
  assert.deepEqual(getActivityOrder("all"), ACTIVITY_ORDER);
  assert.deepEqual(getActivityOrder("vegetable"), ["vegetable"]);
  assert.equal(normalizeActivityPreference("color"), "fruit");
  assert.equal(normalizeActivityPreference("shape"), "vegetable");
  assert.equal(normalizeActivityPreference("count"), "animal");
  assert.equal(normalizeActivityPreference("bad"), "all");
});

test("session advancement moves through rounds, activities, and finish", () => {
  assert.deepEqual(advanceRound(0, 0, 3), {
    activityIndex: 0,
    roundIndex: 1,
    activityComplete: false,
    sessionComplete: false,
  });
  assert.deepEqual(advanceRound(0, 2, 3), {
    activityIndex: 1,
    roundIndex: 0,
    activityComplete: true,
    sessionComplete: false,
  });
  assert.deepEqual(advanceRound(2, 2, 3), {
    activityIndex: 2,
    roundIndex: 2,
    activityComplete: true,
    sessionComplete: true,
  });
});

test("drag progress is normalized and safe at invalid boundaries", () => {
  assert.equal(dragProgress(-20, 100), 0);
  assert.equal(dragProgress(50, 100), 0.5);
  assert.equal(dragProgress(120, 100), 1);
  assert.equal(dragProgress(50, 0), 0);
  assert.equal(clamp(20, 0, 10), 10);
});

test("saved state is sanitized, migrated, and never enables speech", () => {
  const loaded = loadSavedState('{"sound":false,"activity":"shape"}', '{"sessions":"4.8"}', true);
  assert.deepEqual(loaded, {
    settings: { sound: false, reduceMotion: true, activity: "vegetable" },
    progress: { sessions: 4 },
  });
  assert.equal("voice" in loaded.settings, false);
});
