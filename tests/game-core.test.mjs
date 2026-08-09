import test from "node:test";
import assert from "node:assert/strict";

import { SESSION_LENGTH, addCount, createRound, isCorrect, loadProgress, shuffle } from "../src/game-core.js";

test("shuffle preserves every option", () => {
  const source = [1, 2, 3, 4];
  assert.deepEqual(shuffle(source, () => 0).toSorted(), source);
  assert.deepEqual(source, [1, 2, 3, 4]);
});

test("color rounds contain one correct answer and three unique choices", () => {
  const round = createRound("color", 0, () => 0.42);
  assert.equal(round.mode, "color");
  assert.equal(round.options.length, 3);
  assert.equal(new Set(round.options.map((option) => option.id)).size, 3);
  assert.equal(round.options.filter((option) => isCorrect(round, option.id)).length, 1);
});

test("shape rounds contain one correct answer", () => {
  const round = createRound("shape", 2, () => 0.3);
  assert.equal(round.target.label, "しかく");
  assert.equal(round.options.filter((option) => isCorrect(round, option.id)).length, 1);
});

test("count rounds stay within one to three", () => {
  for (let index = 0; index < SESSION_LENGTH; index += 1) {
    const round = createRound("count", index);
    assert.ok(round.target >= 1 && round.target <= 3);
  }
});

test("mixed session includes color, shape, and count", () => {
  const modes = Array.from({ length: SESSION_LENGTH }, (_, index) => createRound("mix", index).mode);
  assert.deepEqual(modes, ["color", "shape", "count", "color"]);
});

test("count increments without passing the target", () => {
  assert.equal(addCount(0, 2), 1);
  assert.equal(addCount(1, 2), 2);
  assert.equal(addCount(2, 2), 2);
});

test("saved progress is sanitized", () => {
  assert.deepEqual(loadProgress("not-json"), { totalCorrect: 0, leaves: 0 });
  assert.deepEqual(loadProgress('{"totalCorrect":"8","leaves":-2}'), { totalCorrect: 8, leaves: 0 });
});
