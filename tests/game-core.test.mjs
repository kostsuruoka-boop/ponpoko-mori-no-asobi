import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVITY_ORDER,
  COLORS,
  ROUNDS_PER_ACTIVITY,
  SHAPES,
  advanceRound,
  clamp,
  createColorRound,
  createCountRound,
  createRound,
  createShapeRound,
  getActivityOrder,
  loadSavedState,
  shuffle,
} from "../src/game-core.js";

test("shuffle preserves every option without mutating the input", () => {
  const source = [1, 2, 3, 4];
  assert.deepEqual(shuffle(source, () => 0).toSorted(), source);
  assert.deepEqual(source, [1, 2, 3, 4]);
});

test("every color round has three targets and three distractors", () => {
  for (let roundIndex = 0; roundIndex < ROUNDS_PER_ACTIVITY; roundIndex += 1) {
    const round = createColorRound(roundIndex, () => 0.42);
    assert.equal(round.items.length, 6);
    assert.equal(round.items.filter((item) => item.isTarget).length, 3);
    assert.equal(round.items.filter((item) => !item.isTarget).length, 3);
    assert.ok(COLORS.includes(round.target));
  }
});

test("shape rounds rotate targets and contain one match", () => {
  SHAPES.forEach((shape, roundIndex) => {
    const round = createShapeRound(roundIndex, () => 0.31);
    assert.equal(round.target, shape);
    assert.equal(round.options.filter((option) => option.isTarget).length, 1);
  });
});

test("count rounds visibly represent quantities one through three", () => {
  [1, 2, 3].forEach((quantity, roundIndex) => {
    const round = createCountRound(roundIndex);
    assert.equal(round.target, quantity);
    assert.equal(round.items.length, quantity);
  });
});

test("round factory rejects unknown activities", () => {
  assert.equal(createRound("color", 0, () => 0.2).activity, "color");
  assert.equal(createRound("shape", 0, () => 0.2).activity, "shape");
  assert.equal(createRound("count", 0).activity, "count");
  assert.throws(() => createRound("unknown", 0), /Unknown activity/);
});

test("activity preference produces either the full journey or one activity", () => {
  assert.deepEqual(getActivityOrder("all"), ACTIVITY_ORDER);
  assert.deepEqual(getActivityOrder("shape"), ["shape"]);
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

test("saved state is sanitized and never enables speech", () => {
  const loaded = loadSavedState('{"sound":false,"activity":"bad"}', '{"sessions":"4"}', true);
  assert.deepEqual(loaded, {
    settings: { sound: false, reduceMotion: true, activity: "all" },
    progress: { sessions: 4 },
  });
  assert.equal("voice" in loaded.settings, false);
});

test("clamp keeps actor movement inside the viewport range", () => {
  assert.equal(clamp(-20, 0, 10), 0);
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(20, 0, 10), 10);
});
