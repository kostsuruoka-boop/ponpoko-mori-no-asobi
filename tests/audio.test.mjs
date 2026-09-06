/*
 * The animal cries are the one part of the app whose output nobody can look at.
 * So instead of listening, this drives the synthesiser against a recording
 * stand-in for Web Audio and checks the shape of what it asked for: a bird has
 * to be high and short, a lion low and long, a bark has to be two barks, and a
 * meow has to go up before it comes down.
 */
import test from "node:test";
import assert from "node:assert/strict";

const recorded = [];

class FakeParam {
  constructor(owner) {
    this.owner = owner;
    this.value = 0;
  }

  setValueAtTime(value, time) {
    this.owner.points.push({ value, time });
    return this;
  }

  exponentialRampToValueAtTime(value, time) {
    this.owner.points.push({ value, time });
    return this;
  }
}

class FakeNode {
  connect() {}
}

class FakeOscillator extends FakeNode {
  constructor(context) {
    super();
    this.context = context;
    this.type = "sine";
    this.points = [];
    this.gainPoints = [];
    this.frequency = new FakeParam(this);
  }

  start(time) {
    this.startedAt = time;
  }

  stop(time) {
    recorded.push({
      kind: "tone",
      type: this.type,
      from: this.startedAt,
      to: time,
      frequencies: this.points.map((point) => point.value),
    });
  }
}

class FakeSource extends FakeNode {
  constructor(buffer) {
    super();
    this.buffer = buffer;
  }

  start(time) {
    recorded.push({ kind: "noise", from: time, seconds: this.buffer.seconds });
  }
}

class FakeContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = "running";
    this.destination = new FakeNode();
  }

  createGain() {
    const gain = new FakeNode();
    gain.gain = new FakeParam({ points: [] });
    return gain;
  }

  createOscillator() {
    return new FakeOscillator(this);
  }

  createBiquadFilter() {
    const filter = new FakeNode();
    filter.frequency = { value: 0 };
    return filter;
  }

  createBuffer(channels, frames, rate) {
    return { seconds: frames / rate, getChannelData: () => new Float32Array(frames) };
  }

  createBufferSource() {
    return new FakeSource(this.lastBuffer);
  }
}

/* `createBufferSource` has no argument, so the buffer is handed over by the
 * assignment the real API also uses. */
const originalCreate = FakeContext.prototype.createBufferSource;
FakeContext.prototype.createBufferSource = function createBufferSource() {
  const source = originalCreate.call(this);
  Object.defineProperty(source, "buffer", {
    set(value) {
      this._buffer = value;
    },
    get() {
      return this._buffer || { seconds: 0 };
    },
  });
  return source;
};

globalThis.window = { AudioContext: FakeContext };

const { AudioDirector } = await import("../src/audio.js");
const { ANIMALS, BAND_MEMBERS } = await import("../src/content.js");

function record(animal, settings) {
  recorded.length = 0;
  const audio = new AudioDirector(() => settings || { effects: true, voice: false });
  audio.cry(animal);
  return recorded.slice();
}

function allFrequencies(events) {
  return events
    .filter((event) => event.kind === "tone")
    .reduce((all, event) => all.concat(event.frequencies), []);
}

function span(events) {
  const ends = events.map((event) => (event.kind === "tone" ? event.to : event.from + event.seconds));
  return Math.max(...ends);
}

test("every animal in the band has a voice, and nobody else does", () => {
  BAND_MEMBERS.forEach((member) => {
    const events = record(member.animal);
    assert.ok(events.length > 0, `${member.animal} makes no sound at all`);
  });
  /* A pad whose animal had no cry would be a silent button, so the band is
   * restricted to animals this method knows. */
  const voiced = BAND_MEMBERS.map((member) => member.animal);
  ANIMALS.filter((animal) => voiced.indexOf(animal.id) < 0).forEach((animal) => {
    assert.equal(record(animal.id).length, 0, `${animal.id} is not in the band but has a voice`);
  });
});

test("a bird is high and quick, a lion is low and long", () => {
  const bird = record("bird");
  assert.ok(Math.min(...allFrequencies(bird)) > 1500, "the bird is not high enough to chirp");
  assert.ok(span(bird) < 0.4, "the bird takes too long for a chirp");

  const lion = record("lion");
  assert.ok(Math.max(...allFrequencies(lion)) < 400, "the lion is too high to growl");
  assert.ok(span(lion) > 0.7, "the lion is too short to be a roar");
  assert.ok(
    lion.some((event) => event.kind === "noise"),
    "a roar without noise in it is a hum",
  );
});

test("a bark is two barks, and each one falls", () => {
  const dog = record("dog");
  const tones = dog.filter((event) => event.kind === "tone");
  assert.equal(tones.length, 2, "one bark sounds like a cough");
  assert.equal(dog.filter((event) => event.kind === "noise").length, 2);
  tones.forEach((tone) => {
    assert.ok(
      tone.frequencies[tone.frequencies.length - 1] < tone.frequencies[0],
      "a bark has to fall in pitch",
    );
    assert.ok(tone.to - tone.from < 0.2, "a bark is short");
  });
  /* The second bark has to come after the first, or it is one thick bark. */
  assert.ok(tones[1].from > tones[0].from + 0.1);
});

test("a meow goes up before it comes down", () => {
  const cat = record("cat");
  const slide = cat.find((event) => event.kind === "tone").frequencies;
  const peak = slide.indexOf(Math.max(...slide));
  assert.ok(peak > 0, "the meow starts at its highest note");
  assert.ok(peak < slide.length - 1, "the meow ends at its highest note");
  assert.ok(slide[slide.length - 1] < slide[0], "the meow does not come back down");
});

test("an elephant rises, which is what makes it a trumpet", () => {
  const slide = record("elephant").find((event) => event.kind === "tone").frequencies;
  assert.ok(Math.max(...slide) > slide[0] * 2, "the trumpet does not rise far enough");
});

test("a pig grunts more than once, low down", () => {
  const pig = record("pig");
  assert.ok(pig.filter((event) => event.kind === "tone").length >= 3, "one grunt is not a pig");
  assert.ok(Math.max(...allFrequencies(pig)) < 400, "the pig is too high");
});

test("switching the effects off silences the animals", () => {
  BAND_MEMBERS.forEach((member) => {
    assert.equal(record(member.animal, { effects: false, voice: false }).length, 0);
  });
});
