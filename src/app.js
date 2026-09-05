/*
 * ぽんぽこ もりの だいぼうけん — application shell.
 *
 * Design rules this file enforces:
 *  - Two gestures only, on large targets: tap to choose, pull to harvest.
 *  - Guidance points at the element that must be touched and mimes the gesture
 *    it needs, both read from that element's own `data-pull`.
 *  - A wrong choice teaches (it says its own name) and never blocks.
 *  - Everything created inside a scene is owned by one lifecycle id and is torn
 *    down before the next scene exists.
 *  - Browser baseline is Safari 13.4, so no logical assignment, no
 *    replaceChildren, no AbortController listener signals.
 */

import { AudioDirector } from "./audio.js";
import {
  ACTIVITY_META,
  ACTIVITY_ORDER,
  ALPHABET,
  ANIMALS,
  BAND_TANUKI,
  FARM_ITEMS,
  HIRAGANA,
  PRAISE,
  ROUNDS_PER_ACTIVITY,
  YUM,
} from "./content.js";
import {
  advanceCurriculum,
  advanceRound,
  animalById,
  createSession,
  hintStage,
  isLetterField,
  isPlayActivity,
  literacyCatalog,
  loadSavedState,
  normalizeActivity,
  targetsPerRound,
} from "./game-core.js";
import {
  backdropMarkup,
  habitatFor,
  hideoutFor,
  PRODUCE_ROTATION,
  pullSign,
} from "./scenery.js";

/* Replaced by scripts/build.mjs with a hash of the sources it built from. */
const BUILD_REVISION = "dev";

const STORAGE_KEYS = {
  settings: "ponpoko-settings-v6",
  progress: "ponpoko-progress-v6",
  legacySettings: "ponpoko-adventure-settings-v5",
  legacyProgress: "ponpoko-adventure-progress-v5",
};

/*
 * Pause between "you got it" and the next request, per activity.
 * These are tuned so the spoken name of the thing the child just found is
 * never cut off by the next question — speaking cancels whatever is playing.
 */
const STEP_PACING = { farm: 1150, animal: 1400, hiragana: 500, alphabet: 500 };

/* How often a friend of the band bothers to say its own name, and how often the
 * tanuki says something with its mouth full. Every tap would drown the music. */
const BAND_SPEAKS_EVERY = 3;

/* Praise is occasional on purpose: every single time would talk over the
 * vocabulary, which is the part actually worth hearing. */
const PRAISE_EVERY = 3;

/* --------------------------------------------------------------- storage */
function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    /* Private mode or blocked cookies must never break play. */
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (error) {
    return false;
  }
}

const saved = loadSavedState(
  readStorage(STORAGE_KEYS.settings) || readStorage(STORAGE_KEYS.legacySettings),
  readStorage(STORAGE_KEYS.progress) || readStorage(STORAGE_KEYS.legacyProgress),
  prefersReducedMotion(),
);

const state = {
  activity: "farm",
  roundIndex: 0,
  session: null,
  round: null,
  stepIndex: 0,
  solved: 0,
  busy: false,
  settings: saved.settings,
  progress: saved.progress,
  sessionResults: [],
  sessionFound: {},
  bonusSprites: false,
  lifecycle: 0,
  timers: [],
  listeners: [],
  quest: null,
  hintTicker: null,
  praiseIndex: 0,
  /* Set by a play mode that wants a flourish the moment its board fills, and
   * cleared with the rest of the scene. */
  roundFinale: null,
  playTaps: 0,
  yumIndex: 0,
  flashToken: 0,
};

const dom = {};

/* ----------------------------------------------------------- dom helpers */
function query(selector) {
  return document.querySelector(selector);
}

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined && html !== null) node.innerHTML = html;
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/* Listeners registered here are removed the moment the scene ends. */
function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  state.listeners.push({ target: target, type: type, handler: handler, options: options });
}

function schedule(callback, delay) {
  const lifecycle = state.lifecycle;
  const timer = window.setTimeout(function () {
    const position = state.timers.indexOf(timer);
    if (position >= 0) state.timers.splice(position, 1);
    if (lifecycle === state.lifecycle) callback();
  }, delay);
  state.timers.push(timer);
  return timer;
}

function motion(fastValue, slowValue) {
  return state.settings.reduceMotion ? fastValue : slowValue;
}

/*
 * Every animation here is a step in a chain: pick, fly, land, ask again. A
 * `finish` event that never arrives would leave the child looking at a board
 * that has stopped responding, and a hidden page — an iPad switched to another
 * app mid-harvest — is exactly where the browser stops delivering them. So the
 * callback is also armed on a timer, and whichever fires first wins.
 */
function animate(node, keyframes, options, onFinish) {
  const lifecycle = state.lifecycle;
  let settled = false;
  function done() {
    if (settled) return;
    settled = true;
    if (lifecycle === state.lifecycle && onFinish) onFinish();
  }
  if (!node || !node.animate || state.settings.reduceMotion) {
    schedule(done, 16);
    return null;
  }
  try {
    const animation = node.animate(keyframes, options);
    animation.onfinish = done;
    animation.oncancel = function () {};
    const timing = options || {};
    schedule(done, (timing.duration || 0) + (timing.delay || 0) + 140);
    return animation;
  } catch (error) {
    schedule(done, 16);
    return null;
  }
}

function clearRuntime() {
  state.lifecycle += 1;
  state.timers.forEach(function (timer) {
    clearTimeout(timer);
  });
  state.timers = [];
  state.listeners.forEach(function (entry) {
    entry.target.removeEventListener(entry.type, entry.handler, entry.options);
  });
  state.listeners = [];
  if (state.hintTicker !== null) {
    clearInterval(state.hintTicker);
    state.hintTicker = null;
  }
  state.quest = null;
  state.busy = false;
  state.roundFinale = null;
  state.playTaps = 0;
  hideHand();
  clear(dom.fx);
  dom.roundComplete.hidden = true;
  audio.stop();
}

const audio = new AudioDirector(function () {
  return state.settings;
});

/* ------------------------------------------------------------- structure */
function buildShell() {
  dom.app = query("#app");
  dom.screens = {
    home: query("#home-screen"),
    game: query("#game-screen"),
    finish: query("#finish-screen"),
  };
  dom.modeButtons = document.querySelectorAll("[data-mode]");
  dom.backdrop = query("#game-backdrop");
  dom.modeIcon = query("#mode-icon");
  dom.modeTitle = query("#mode-title");
  dom.pips = query("#round-pips");
  dom.stage = query("#stage");
  dom.fx = query("#fx-layer");
  dom.hand = query("#tap-hand");
  dom.roundComplete = query("#round-complete");
  dom.nextButton = query("#next-round-button");
  dom.finishTitle = query("#finish-title");
  dom.finishKicker = query("#finish-kicker");
  dom.finishResults = query("#finish-results");
  dom.confetti = query("#finish-confetti");
  dom.parentOverlay = query("#parent-overlay");
  dom.parentGate = query("#parent-gate");
  dom.parentSettings = query("#parent-settings");
  dom.sessionCount = query("#session-count");
  dom.effectsSetting = query("#effects-setting");
  dom.voiceSetting = query("#voice-setting");
  dom.motionSetting = query("#motion-setting");
  dom.buildStamp = query("#build-stamp");
  dom.backdrop.innerHTML = backdropMarkup();
}

function showScreen(name) {
  dom.app.setAttribute("data-screen", name);
  Object.keys(dom.screens).forEach(function (key) {
    dom.screens[key].classList.toggle("is-active", key === name);
  });
  window.scrollTo(0, 0);
}

function spriteClass(id) {
  return "sprite cell-" + id;
}

function spriteMarkup(id, extraClass) {
  return '<i class="' + spriteClass(id) + (extraClass ? " " + extraClass : "") + '"></i>';
}

function itemById(id) {
  for (let index = 0; index < FARM_ITEMS.length; index += 1) {
    if (FARM_ITEMS[index].id === id) return FARM_ITEMS[index];
  }
  return null;
}

function nextPraise() {
  state.praiseIndex = (state.praiseIndex + 1) % PRAISE.length;
  return PRAISE[state.praiseIndex];
}

/* ------------------------------------------------------------ stage frame */
/*
 * Every activity uses the same three regions so a child always finds the
 * request in the same place and the tappable things in the same place.
 */
function buildStageFrame(activityClass) {
  clear(dom.stage);
  const frame = el("div", "stage-frame " + activityClass);
  const ask = el("div", "ask-panel");
  const tanuki = el("button", "ask-tanuki tanuki-sprite pose-" + ACTIVITY_META[state.activity].pose);
  tanuki.type = "button";
  tanuki.setAttribute("aria-label", "たぬきを つつく");
  const bubble = el("button", "ask-bubble");
  bubble.type = "button";
  bubble.setAttribute("aria-label", "もういちど きく");
  const bubbleBody = el("div", "ask-bubble-body");
  const speaker = el("span", "ask-speaker", "♪");
  bubble.appendChild(bubbleBody);
  bubble.appendChild(speaker);
  ask.appendChild(bubble);
  ask.appendChild(tanuki);

  const play = el("div", "play-area");
  const collect = el("div", "collect-bar");

  frame.appendChild(ask);
  frame.appendChild(play);
  frame.appendChild(collect);
  dom.stage.appendChild(frame);

  on(bubble, "click", function () {
    audio.play("tap");
    announceTarget(true);
    markInteraction();
  });

  on(tanuki, "click", function () {
    pokeTanuki(tanuki);
  });

  return { frame: frame, ask: ask, tanuki: tanuki, bubble: bubbleBody, play: play, collect: collect };
}

function buildCollectSlots(collect, count) {
  clear(collect);
  for (let index = 0; index < count; index += 1) {
    const slot = el("div", "collect-slot");
    slot.setAttribute("data-collect", String(index));
    collect.appendChild(slot);
  }
}

function fillCollectSlot(index, html) {
  const slot = dom.stage.querySelector('[data-collect="' + index + '"]');
  if (!slot) return null;
  slot.classList.add("is-filled");
  slot.innerHTML = html;
  return slot;
}

/* ----------------------------------------------------------------- quests */
/*
 * A quest is "one thing is being asked for". It owns the escalating hint and
 * routes every tap in the play area to correct/incorrect handling.
 */
function startQuest(config) {
  state.quest = {
    targetId: config.targetId,
    /* `free` marks a board with no request: anything the child takes is right,
     * which is what the letter fields are for. */
    free: config.free === true,
    wrongTaps: 0,
    lastInteraction: Date.now(),
    stage: 0,
    announce: config.announce,
    findTarget: config.findTarget,
    onCorrect: config.onCorrect,
    onWrong: config.onWrong,
  };
  if (state.hintTicker === null) {
    const lifecycle = state.lifecycle;
    state.hintTicker = window.setInterval(function () {
      if (lifecycle !== state.lifecycle) return;
      updateHint();
    }, 400);
  }
  announceTarget(false);
}

function markInteraction() {
  if (!state.quest) return;
  state.quest.lastInteraction = Date.now();
  applyHintStage(0);
}

function announceTarget(manual) {
  if (!state.quest || !state.quest.announce) return;
  state.quest.announce(manual === true);
  if (!manual) markInteraction();
}

function updateHint() {
  const quest = state.quest;
  if (!quest || state.busy) return;
  const stage = hintStage(Date.now() - quest.lastInteraction, quest.wrongTaps);
  if (stage !== quest.stage) applyHintStage(stage);
  if (quest.stage >= 3) positionHand(quest.findTarget());
}

/*
 * `silent` is used right after a wrong tap, where the activity is already
 * saying the name of what the child touched. Speaking again there would cut
 * that word off mid-syllable.
 */
function applyHintStage(stage, silent) {
  const quest = state.quest;
  if (!quest) return;
  quest.stage = stage;
  const target = quest.findTarget();
  clearHintClasses();
  if (!target || stage <= 0) {
    hideHand();
    return;
  }
  if (stage === 1) {
    hideHand();
    if (!silent) announceRepeat();
    return;
  }
  target.classList.add(stage >= 3 ? "is-hint-strong" : "is-hint-soft");
  if (stage >= 3) {
    positionHand(target);
    if (!silent) announceRepeat();
  } else {
    hideHand();
  }
}

function announceRepeat() {
  if (!state.quest || !state.quest.announce) return;
  state.quest.announce(true);
}

function clearHintClasses() {
  const hinted = dom.stage.querySelectorAll(".is-hint-soft, .is-hint-strong");
  for (let index = 0; index < hinted.length; index += 1) {
    hinted[index].classList.remove("is-hint-soft", "is-hint-strong");
  }
}

/*
 * The hand shows the gesture the target actually needs: a tap where a tap
 * works, and a drag in the pull direction where the thing has to be pulled.
 * `data-pull` is set by whatever rendered the element, so guidance and input
 * can never drift apart.
 */
function positionHand(target) {
  if (!target || state.settings.reduceMotion) return;
  const rect = target.getBoundingClientRect();
  if (!rect.width) return;
  const pull = target.getAttribute("data-pull");
  dom.hand.style.left = rect.left + rect.width / 2 + "px";
  dom.hand.style.top = rect.top + rect.height * (pull ? 0.5 : 0.62) + "px";
  dom.hand.style.setProperty("--pull-dy", (pull === "down" ? 1 : -1) * PULL_DISTANCE + "px");
  dom.hand.classList.toggle("is-pulling", Boolean(pull));
  dom.hand.classList.add("is-visible");
}

function hideHand() {
  if (!dom.hand) return;
  dom.hand.classList.remove("is-visible", "is-pulling");
}

function resolveTap(id, element) {
  const quest = state.quest;
  if (!quest || state.busy) return;
  markInteraction();
  if (quest.free || id === quest.targetId) {
    state.busy = true;
    clearHintClasses();
    hideHand();
    quest.onCorrect(element);
    return;
  }
  quest.wrongTaps += 1;
  quest.onWrong(element, id);
  applyHintStage(hintStage(0, quest.wrongTaps), true);
}

/* --------------------------------------------------------------- feedback */
function wiggle(node) {
  if (!node) return;
  node.classList.remove("is-wiggling");
  /* Force a reflow so the animation restarts on repeated wrong taps. */
  void node.offsetWidth;
  node.classList.add("is-wiggling");
  schedule(function () {
    node.classList.remove("is-wiggling");
  }, 500);
}

function tanukiReact(pose, duration) {
  const tanuki = dom.stage.querySelector(".ask-tanuki");
  if (!tanuki) return;
  const base = ACTIVITY_META[state.activity].pose;
  setPose(tanuki, pose);
  tanuki.classList.remove("is-reacting");
  /* Force a reflow, or a second tap arriving mid-hop is simply ignored. */
  void tanuki.offsetWidth;
  tanuki.classList.add("is-reacting");
  schedule(function () {
    tanuki.classList.remove("is-reacting");
    setPose(tanuki, base);
  }, duration || 900);
}

/*
 * The tanuki is a toy wherever it stands. Poking it plays its belly drum and
 * makes it hop — no mode, no progress, no consequence. A child who has not
 * worked out what a board wants can always still make something happen, which
 * is the difference between a game that stalls and one that never can.
 */
function pokeTanuki(node) {
  const tanuki = node || dom.stage.querySelector(".ask-tanuki");
  if (!tanuki) return;
  audio.note(BAND_TANUKI.frequency, BAND_TANUKI.voice);
  tanukiReact("jump", 780);
  burst(tanuki, "#f7d35b", 9);
  markInteraction();
  state.playTaps += 1;
  if (state.playTaps % 3 === 0) audio.speak("ぽんぽこ", "ja-JP");
}

function setPose(node, pose) {
  const classes = node.className.split(" ").filter(function (name) {
    return name.indexOf("pose-") !== 0;
  });
  classes.push("pose-" + pose);
  node.className = classes.join(" ");
}

function burst(node, color, amount) {
  if (state.settings.reduceMotion || !node) return;
  const rect = node.getBoundingClientRect();
  const total = amount || 12;
  for (let index = 0; index < total; index += 1) {
    const angle = (Math.PI * 2 * index) / total + Math.random() * 0.4;
    const distance = 40 + Math.random() * 70;
    const particle = el("i", "particle");
    particle.style.left = rect.left + rect.width / 2 + "px";
    particle.style.top = rect.top + rect.height / 2 + "px";
    particle.style.background = color;
    particle.style.setProperty("--dx", Math.cos(angle) * distance + "px");
    particle.style.setProperty("--dy", Math.sin(angle) * distance + "px");
    dom.fx.appendChild(particle);
    schedule(function () {
      if (particle.parentNode) particle.parentNode.removeChild(particle);
    }, 900);
  }
}

/*
 * Fly a copy of `source` into `target`. The clone lives in the fixed effects
 * layer so it can cross any container boundary without clipping.
 */
function flyTo(source, target, className, innerHtml, onFinish) {
  if (!source || !target) {
    if (onFinish) onFinish();
    return;
  }
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const clone = el("div", "fly-clone " + (className || ""), innerHtml);
  clone.style.left = from.left + "px";
  clone.style.top = from.top + "px";
  clone.style.width = from.width + "px";
  clone.style.height = from.height + "px";
  dom.fx.appendChild(clone);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = Math.min(1, (to.width * 0.82) / Math.max(from.width, 1));
  animate(
    clone,
    [
      { transform: "translate(0px,0px) scale(1)" },
      { transform: "translate(" + dx * 0.45 + "px," + (dy * 0.3 - 70) + "px) scale(1.1)", offset: 0.5 },
      { transform: "translate(" + dx + "px," + dy + "px) scale(" + scale + ")" },
    ],
    { duration: motion(120, 620), easing: "cubic-bezier(.2,.75,.28,1)", fill: "forwards" },
    function () {
      if (clone.parentNode) clone.parentNode.removeChild(clone);
      if (onFinish) onFinish();
    },
  );
}

/* ------------------------------------------------------------ pull input */
/*
 * Things overhead are pulled down, things in the ground are pulled up.
 *
 * The sprite only follows the finger in the direction it can actually come
 * from, so the gesture teaches itself: push the wrong way and nothing moves.
 * Release short of the threshold and it springs back with a soft sound.
 *
 * A plain tap is not a harvest — but three fruitless taps on the same thing
 * are, because a child who cannot manage the drag must never be stuck.
 */
const PULL_DISTANCE = 44;
const PULL_TAP_RESCUE = 3;

function installPull(button, habitatName, onPull, onTap) {
  const sign = pullSign(habitatName);
  const sprite = button.querySelector(".pull-sprite");
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let travel = 0;
  let moved = 0;
  let taps = 0;

  button.setAttribute("data-pull", sign > 0 ? "down" : "up");
  /*
   * A small arrow on every crop, pointing the way it comes off. It is on all of
   * them at once, so it never gives away which one is being asked for — it only
   * ever answers "which way do I move this?".
   */
  button.appendChild(el("i", "pull-cue"));

  function offsetSprite(distance) {
    sprite.style.setProperty("--pull-offset", distance * sign + "px");
  }

  function release() {
    button.classList.remove("is-pulling");
    offsetSprite(0);
  }

  on(button, "pointerdown", function (event) {
    if (state.busy || pointerId !== null || button.classList.contains("is-harvested")) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    travel = 0;
    moved = 0;
    button.classList.add("is-pulling");
    if (button.setPointerCapture) button.setPointerCapture(pointerId);
    markInteraction();
  });

  on(button, "pointermove", function (event) {
    if (event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    moved = Math.max(moved, Math.sqrt(dx * dx + dy * dy));
    /* Only motion along the pull direction counts, and it eases towards a cap
     * so the sprite never flies off its plant. */
    travel = Math.max(0, dy * sign);
    offsetSprite(Math.min(travel, PULL_DISTANCE * 1.35));
  });

  function finish(event) {
    if (event.pointerId !== pointerId) return;
    if (button.releasePointerCapture && button.hasPointerCapture
      && button.hasPointerCapture(pointerId)) {
      button.releasePointerCapture(pointerId);
    }
    pointerId = null;
    if (travel >= PULL_DISTANCE) {
      release();
      taps = 0;
      onPull();
      return;
    }
    release();
    if (moved < 12) {
      taps += 1;
      onTap(taps >= PULL_TAP_RESCUE);
      return;
    }
    /* A real but too-short pull: nudge, and let the guidance step forward. */
    audio.play("nudge");
    wiggle(button);
    bumpHint();
  }

  on(button, "pointerup", finish);
  on(button, "pointercancel", finish);
}

/* Move the guidance one stage on, without speaking over anything. */
function bumpHint() {
  const quest = state.quest;
  if (!quest) return;
  quest.wrongTaps += 1;
  applyHintStage(hintStage(0, quest.wrongTaps), true);
}

/* -------------------------------------------------------------- the farm */
function renderFarmRound() {
  const parts = buildStageFrame("stage-farm");
  const field = el("div", "farm-field");
  state.round.items.forEach(function (item) {
    const habitat = habitatFor(item.habitat);
    const plot = el("div", "farm-plot habitat-" + item.habitat);
    const box = el("div", "habitat-box");
    box.innerHTML = habitat.back;

    const button = el("button", "produce");
    button.type = "button";
    button.setAttribute("data-item", item.id);
    button.setAttribute("aria-label", item.label);
    button.style.left = habitat.anchorX + "%";
    button.style.top = habitat.anchorY + "%";
    /* The habitat box is square, so equal percentages give a square target. */
    button.style.width = habitat.scale * 100 + "%";
    button.style.height = habitat.scale * 100 + "%";
    const sprite = el("i", spriteClass(item.id) + " produce-sprite pull-sprite");
    const rotation = PRODUCE_ROTATION[item.id] || 0;
    sprite.style.setProperty("--pull-rotate", rotation + "deg");
    button.appendChild(sprite);
    box.appendChild(button);

    if (habitat.front) {
      const front = el("div", "habitat-front-layer");
      front.innerHTML = habitat.front;
      box.appendChild(front);
    }
    plot.appendChild(box);
    field.appendChild(plot);

    installPull(
      button,
      item.habitat,
      function () {
        resolveTap(item.id, button);
      },
      function (rescue) {
        handleProduceTap(item, button, rescue);
      },
    );
  });
  parts.play.appendChild(field);
  buildCollectSlots(parts.collect, state.round.items.length);
  startFarmQuest();
}

/*
 * A tap is not the harvest gesture, so it either teaches the name of the wrong
 * thing or demonstrates the pull on the right one — unless the child has tried
 * three times, in which case take it and move on.
 */
function handleProduceTap(item, button, rescue) {
  const quest = state.quest;
  if (!quest || state.busy) return;
  if (item.id !== quest.targetId) {
    resolveTap(item.id, button);
    return;
  }
  if (rescue) {
    resolveTap(item.id, button);
    return;
  }
  audio.play("nudge");
  wiggle(button);
  bumpHint();
  applyHintStage(Math.max(2, state.quest ? state.quest.stage : 2), true);
}

function startFarmQuest() {
  const targetId = state.round.quest[state.stepIndex];
  const item = itemById(targetId);
  const bubble = dom.stage.querySelector(".ask-bubble-body");
  bubble.innerHTML = spriteMarkup(targetId, "ask-sprite");
  startQuest({
    targetId: targetId,
    announce: function () {
      audio.speak(item.label, "ja-JP");
    },
    findTarget: function () {
      return dom.stage.querySelector('.produce[data-item="' + targetId + '"]');
    },
    onCorrect: function (button) {
      harvest(button, item);
    },
    onWrong: function (button, id) {
      const wrongItem = itemById(id);
      audio.play("nudge");
      wiggle(button);
      if (wrongItem) audio.speak(wrongItem.label, "ja-JP");
      tanukiReact("wave", 700);
      schedule(function () {
        announceRepeat();
      }, 1500);
    },
  });
}

function harvest(button, item) {
  const habitat = habitatFor(item.habitat);
  const sprite = button.querySelector(".pull-sprite");
  const rotation = PRODUCE_ROTATION[item.id] || 0;
  const slotIndex = state.solved;
  const slot = dom.stage.querySelector('[data-collect="' + slotIndex + '"]');
  audio.play(habitat.pull === "up" ? "pull" : "pick");

  /* It comes free in the direction it was pulled, then flies to the basket. */
  const escape = pullSign(item.habitat) * habitat.rise * 120;
  animate(
    sprite,
    [
      { transform: "translateY(0) rotate(" + rotation + "deg)" },
      { transform: "translateY(" + escape + "%) rotate(" + rotation + "deg) scale(1.06)" },
    ],
    { duration: motion(60, 300), easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "forwards" },
    function () {
      burst(button, habitat.pull === "up" ? "#a9764e" : "#68b665", 12);
      button.classList.add("is-harvested");
      flyTo(button, slot, "fly-sprite", spriteMarkup(item.id), function () {
        fillCollectSlot(slotIndex, spriteMarkup(item.id, "collected"));
        audio.play("land", slotIndex);
        audio.speak(item.label, "ja-JP");
        completeStep();
      });
    },
  );
}

/* ------------------------------------------------------------ the animals */
/*
 * The question itself is a shadow: it lives in the ask bubble, and the whole
 * play area belongs to the candidates so their tap targets stay huge.
 */
function renderAnimalRound() {
  const parts = buildStageFrame("stage-animal");
  const choices = el("div", "choice-row");
  choices.setAttribute("id", "choice-row");
  choices.setAttribute("data-count", String(state.round.choiceCount));
  parts.play.appendChild(choices);
  buildCollectSlots(parts.collect, state.round.steps.length);
  startAnimalQuest();
}

function startAnimalQuest() {
  const step = state.round.steps[state.stepIndex];
  const animal = animalById(step.targetId);
  const row = dom.stage.querySelector("#choice-row");
  const bubble = dom.stage.querySelector(".ask-bubble-body");
  bubble.innerHTML = '<div class="shadow-frame" id="shadow-frame">'
    + '<i class="' + spriteClass(step.targetId) + ' shadow-sprite"></i>'
    + '<i class="' + spriteClass(step.targetId) + ' reveal-sprite"></i>'
    + "</div>";
  const card = dom.stage.querySelector("#shadow-frame");

  clear(row);
  row.setAttribute("data-count", String(step.choices.length));
  step.choices.forEach(function (id) {
    const choice = animalById(id);
    const button = el("button", "choice-card");
    button.type = "button";
    button.setAttribute("data-animal", id);
    button.setAttribute("aria-label", choice.label);
    button.innerHTML = spriteMarkup(id, "choice-sprite");
    row.appendChild(button);
    on(button, "click", function () {
      resolveTap(id, button);
    });
  });

  startQuest({
    targetId: step.targetId,
    announce: function () {
      audio.speak(ACTIVITY_META.animal.askPrefix, "ja-JP");
      pulse(card);
    },
    findTarget: function () {
      return dom.stage.querySelector('.choice-card[data-animal="' + step.targetId + '"]');
    },
    onCorrect: function (button) {
      revealAnimal(button, animal, card);
    },
    onWrong: function (button, id) {
      const wrong = animalById(id);
      audio.play("nudge");
      wiggle(button);
      audio.speak(wrong.label, "ja-JP");
      pulse(card);
      tanukiReact("wave", 700);
    },
  });
}

function pulse(node) {
  if (!node) return;
  node.classList.remove("is-pulsing");
  void node.offsetWidth;
  node.classList.add("is-pulsing");
  schedule(function () {
    node.classList.remove("is-pulsing");
  }, 900);
}

function revealAnimal(button, animal, card) {
  const slotIndex = state.solved;
  const slot = dom.stage.querySelector('[data-collect="' + slotIndex + '"]');
  audio.play("pick");
  button.classList.add("is-chosen");
  flyTo(button, card, "fly-sprite", spriteMarkup(animal.id), function () {
    card.classList.add("is-revealed");
    audio.play("correct");
    burst(card, "#f7d35b", 16);
    audio.speak(animal.label + (animal.cry ? "。" + animal.cry : ""), "ja-JP");
    tanukiReact("jump", 950);
    schedule(function () {
      fillCollectSlot(slotIndex, spriteMarkup(animal.id, "collected"));
      audio.play("land", slotIndex);
      completeStep();
    }, motion(120, 900));
  });
}

/* --------------------------------------------------------- letter fields */
/*
 * Letters growing in a field. There is no request and no wrong answer: the
 * child pulls whatever they like, hears its sound, and gets the word behind it.
 * The reward for exploring is the whole lesson.
 */
function renderLetterFieldRound() {
  const parts = buildStageFrame("stage-field stage-" + state.activity);
  const field = el("div", "farm-field");

  state.round.items.forEach(function (letter) {
    const habitat = habitatFor(letter.habitat);
    const plot = el("div", "farm-plot habitat-" + letter.habitat);
    const box = el("div", "habitat-box");
    box.innerHTML = habitat.back;

    const button = el("button", "produce letter-crop");
    button.type = "button";
    button.setAttribute("data-item", letter.id);
    button.setAttribute("aria-label", letter.label || letter.glyph);
    button.style.left = habitat.anchorX + "%";
    button.style.top = habitat.anchorY + "%";
    button.style.width = habitat.scale * 100 + "%";
    button.style.height = habitat.scale * 100 + "%";
    button.innerHTML = '<span class="pull-sprite letter-crop-face">'
      + '<span class="letter-crop-glyph">' + letter.glyph
      + (letter.secondary ? "<small>" + letter.secondary + "</small>" : "")
      + "</span></span>";

    box.appendChild(button);
    if (habitat.front) {
      const front = el("div", "habitat-front-layer");
      front.innerHTML = habitat.front;
      box.appendChild(front);
    }
    plot.appendChild(box);
    field.appendChild(plot);

    installPull(
      button,
      letter.habitat,
      function () {
        resolveTap(letter.id, button);
      },
      function (rescue) {
        if (rescue) {
          resolveTap(letter.id, button);
          return;
        }
        /* Even a tap that does not harvest still says the letter. */
        audio.play("tap");
        audio.speak(letter.speak, letter.lang);
        wiggle(button);
        bumpHint();
      },
    );
  });

  parts.play.appendChild(field);
  buildCollectSlots(parts.collect, state.round.items.length);
  startLetterFieldQuest();
}

function startLetterFieldQuest() {
  const bubble = dom.stage.querySelector(".ask-bubble-body");
  bubble.innerHTML = '<span class="ask-basket">' + remainingLetterCount() + "</span>";
  startQuest({
    targetId: null,
    free: true,
    announce: function () {},
    findTarget: function () {
      return dom.stage.querySelector(".letter-crop:not(.is-harvested)");
    },
    onCorrect: function (button) {
      const letter = letterCropById(button.getAttribute("data-item"));
      if (letter) harvestLetterCrop(button, letter);
    },
    onWrong: function () {},
  });
}

function remainingLetterCount() {
  return String(state.round.items.length - state.solved);
}

function letterCropById(id) {
  const items = state.round.items;
  for (let index = 0; index < items.length; index += 1) {
    if (items[index].id === id) return items[index];
  }
  return null;
}

function harvestLetterCrop(button, letter) {
  const habitat = habitatFor(letter.habitat);
  const sprite = button.querySelector(".pull-sprite");
  const slotIndex = state.solved;
  const slot = dom.stage.querySelector('[data-collect="' + slotIndex + '"]');
  const glyphHtml = '<span class="collected-letter">' + letter.glyph
    + (letter.secondary ? "<small>" + letter.secondary + "</small>" : "") + "</span>";

  audio.play(habitat.pull === "up" ? "pull" : "pick");
  const escape = pullSign(letter.habitat) * habitat.rise * 120;
  animate(
    sprite,
    [{ transform: "translateY(0)" }, { transform: "translateY(" + escape + "%) scale(1.06)" }],
    { duration: motion(60, 300), easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "forwards" },
    function () {
      burst(button, habitat.pull === "up" ? "#a9764e" : "#68b665", 12);
      button.classList.add("is-harvested");
      audio.speak(letter.speak, letter.lang);
      tanukiReact("jump", 850);
      flyTo(button, slot, "fly-letter", glyphHtml, function () {
        fillCollectSlot(slotIndex, glyphHtml);
        audio.play("land", slotIndex);
        showWordReward(letter, function () {
          completeStep();
        });
      });
    },
  );
}

/* ------------------------------------------------------------- literacy */
function renderLiteracyRound() {
  const parts = buildStageFrame("stage-literacy stage-" + state.activity);
  const catalog = literacyCatalog(state.activity);
  const chart = el("div", "letter-chart chart-" + state.activity);
  chart.setAttribute("id", "letter-chart");

  catalog.forEach(function (entry) {
    const cell = el("button", "letter-cell");
    cell.type = "button";
    cell.setAttribute("data-letter", entry.id);
    cell.setAttribute("aria-label", entry.label);
    cell.style.setProperty("--col", String(entry.column + 1));
    cell.style.setProperty("--row", String(entry.row + 1));
    cell.innerHTML = '<span class="letter-glyph">' + entry.glyph
      + (entry.secondary ? '<small>' + entry.secondary + "</small>" : "")
      + "</span>";
    if (state.sessionFound[entry.id]) cell.classList.add("is-found");
    chart.appendChild(cell);
    /* Every cell is live, not just the answer: tapping any letter makes it
     * say its own sound, so exploring the chart is itself the lesson. */
    on(cell, "click", function () {
      resolveTap(entry.id, cell);
    });
  });

  parts.play.appendChild(chart);
  buildCollectSlots(parts.collect, state.round.targets.length);
  /* Slots already earned in earlier rounds stay visible in the finish screen,
   * so only this round's slots are rebuilt here. */
  startLiteracyQuest();
}

function startLiteracyQuest() {
  const target = state.round.targets[state.stepIndex];
  const bubble = dom.stage.querySelector(".ask-bubble-body");
  bubble.innerHTML = '<span class="ask-letter">' + target.glyph
    + (target.secondary ? '<small>' + target.secondary + "</small>" : "")
    + "</span>";

  startQuest({
    targetId: target.id,
    announce: function () {
      speakLetter(target);
    },
    findTarget: function () {
      return dom.stage.querySelector('.letter-cell[data-letter="' + target.id + '"]');
    },
    onCorrect: function (cell) {
      collectLetter(cell, target);
    },
    onWrong: function (cell, id) {
      const catalog = literacyCatalog(state.activity);
      let tapped = null;
      for (let index = 0; index < catalog.length; index += 1) {
        if (catalog[index].id === id) tapped = catalog[index];
      }
      audio.play("tap");
      pulse(cell);
      if (tapped) audio.speak(tapped.speak, tapped.lang);
      schedule(function () {
        announceRepeat();
      }, 1600);
    },
  });
}

function speakLetter(entry) {
  if (state.activity === "hiragana") {
    audio.speak(entry.speak, "ja-JP");
  } else {
    audio.speak(entry.speak, "en-US");
  }
}

function pictureFor(entry) {
  if (!entry.sprite) return null;
  if (entry.bonusSprite && !state.bonusSprites) return null;
  return entry.sprite;
}

function collectLetter(cell, target) {
  const slotIndex = state.solved;
  const slot = dom.stage.querySelector('[data-collect="' + slotIndex + '"]');
  state.sessionFound[target.id] = true;
  cell.classList.add("is-found", "is-landing");
  audio.play("correct");
  burst(cell, state.activity === "hiragana" ? "#ef7465" : "#5a94d0", 14);
  tanukiReact("jump", 950);
  audio.speak(target.speak, target.lang);

  const glyphHtml = '<span class="collected-letter">' + target.glyph
    + (target.secondary ? "<small>" + target.secondary + "</small>" : "") + "</span>";
  flyTo(cell, slot, "fly-letter", glyphHtml, function () {
    fillCollectSlot(slotIndex, glyphHtml);
    audio.play("land", slotIndex);
    showWordReward(target, function () {
      completeStep();
    });
  });
}

/* The reward card turns a bare letter into a word the child already knows. */
function showWordReward(target, onFinish) {
  const picture = pictureFor(target);
  if (!target.word) {
    schedule(onFinish, motion(80, 420));
    return;
  }
  const card = el("div", "word-reward");
  card.innerHTML = (picture ? spriteMarkup(picture, "word-sprite") : "")
    + '<strong>' + target.word + "</strong>";
  dom.fx.appendChild(card);
  animate(
    card,
    [
      { opacity: 0, transform: "translate(-50%,-50%) scale(.6)" },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.2 },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.8 },
      { opacity: 0, transform: "translate(-50%,-50%) scale(.9)" },
    ],
    { duration: motion(160, 1500), easing: "ease-out", fill: "forwards" },
    function () {
      if (card.parentNode) card.parentNode.removeChild(card);
      onFinish();
    },
  );
  /* Late enough that the letter sound itself has finished playing. */
  schedule(function () {
    audio.speak(target.word, target.lang, { rate: target.lang === "en-US" ? 0.68 : 0.76 });
  }, motion(40, 700));
}

/* ------------------------------------------------------------ play modes */
/*
 * Four boards that ask for nothing.
 *
 * The finding games refuse input while an answer plays out, because a second
 * tap there would be scored against a question that has already been answered.
 * Here that same guard would be the bug: a toddler drums on the glass with a
 * whole hand, and every one of those touches has to make a sound. So nothing in
 * this section sets `state.busy`, every element owns its own animation, and a
 * round advances by counting what the child did rather than by clearing a queue
 * of questions.
 */

/* A free quest exists only to carry the idle guidance; it has no answer. */
function startFreePlay(findTarget, announce) {
  startQuest({
    targetId: null,
    free: true,
    announce: announce || function () {},
    findTarget: findTarget,
    onCorrect: function () {},
    onWrong: function () {},
  });
}

/*
 * Count one thing done. Returns the collect slot it claimed, or -1 when the
 * board is already full: two fingers landing together must not overrun the
 * shelf or schedule the celebration twice.
 */
function playStep() {
  const total = targetsPerRound(state.activity);
  if (state.solved >= total) return -1;
  const slotIndex = state.solved;
  state.solved += 1;
  state.stepIndex += 1;
  if (state.solved >= total) {
    if (state.roundFinale) state.roundFinale();
    /* Long enough for the last thing touched to finish its own reaction before
     * the board freezes for the celebration. */
    schedule(completeRound, motion(160, 1000));
  }
  return slotIndex;
}

function askBody() {
  return dom.stage.querySelector(".ask-bubble-body");
}

/* How many are left, as a number a child who cannot read still sees shrink. */
function showRemaining() {
  const body = askBody();
  if (!body) return;
  body.innerHTML = '<span class="ask-basket">'
    + (targetsPerRound(state.activity) - state.solved) + "</span>";
}

/* Put a word in the bubble for a moment, then hand it back to whatever was
 * there. Used for the punchline of a peekaboo. */
function flashAsk(text, restore) {
  const body = askBody();
  if (!body) return;
  body.innerHTML = '<span class="ask-shout">' + text + "</span>";
  /* A second reveal arriving mid-flash owns the bubble now: only the newest
   * shout is allowed to put the waiting line back. */
  state.flashToken += 1;
  const token = state.flashToken;
  schedule(function () {
    if (token === state.flashToken && askBody() === body) restore();
  }, motion(200, 1300));
}

function hop(node, duration) {
  if (!node) return;
  node.classList.remove("is-hopping");
  void node.offsetWidth;
  node.classList.add("is-hopping");
  schedule(function () {
    node.classList.remove("is-hopping");
  }, duration || 560);
}

/* A word that drifts up off a character: visible fun that never interrupts the
 * one voice, which is busy naming the thing the child just touched. */
function floatWord(node, text, className) {
  if (state.settings.reduceMotion || !node) return;
  const rect = node.getBoundingClientRect();
  if (!rect.width) return;
  const word = el("i", "float-word " + (className || ""), text);
  word.style.left = rect.left + rect.width / 2 + "px";
  /* Launched from the shoulder rather than the middle, so a wide word never
   * sits across the face of whoever just said it. */
  word.style.top = rect.top + rect.height * 0.3 + "px";
  word.style.setProperty("--dx", Math.round(Math.random() * 44 - 22) + "px");
  dom.fx.appendChild(word);
  schedule(function () {
    if (word.parentNode) word.parentNode.removeChild(word);
  }, 1400);
}

/* ------------------------------------------------------------- the band */
/*
 * Six friends, each with one pitch of a pentatonic scale and its own voice. The
 * pads are never used up: hitting the same drum thirty times is a perfectly
 * good way to spend a round, and the board counts the playing rather than the
 * pads. Sound is fired on `pointerdown`, not on click, because an instrument
 * that waits for the finger to lift does not feel like an instrument.
 */
function renderBandRound() {
  const parts = buildStageFrame("stage-band");
  const stage = el("div", "band-stage");

  state.round.items.forEach(function (member) {
    const pad = el("button", "band-pad");
    pad.type = "button";
    pad.setAttribute("data-item", member.id);
    pad.setAttribute("aria-label", member.label);
    pad.style.setProperty("--pad-color", member.color);
    pad.innerHTML = '<i class="band-ring"></i>' + spriteMarkup(member.animal, "band-sprite")
      + '<b class="band-badge">♪</b>';
    stage.appendChild(pad);
    on(pad, "pointerdown", function () {
      strikeBand(pad, member);
    });
  });

  parts.play.appendChild(stage);
  buildCollectSlots(parts.collect, targetsPerRound("band"));
  state.roundFinale = bandFinale;
  startFreePlay(
    function () {
      return dom.stage.querySelector(".band-pad");
    },
    function (manual) {
      if (manual) audio.note(BAND_TANUKI.frequency, BAND_TANUKI.voice);
    },
  );
  const body = askBody();
  if (body) body.innerHTML = '<span class="ask-note">♪</span>';
}

function strikeBand(pad, member) {
  const animal = animalById(member.animal);
  audio.note(member.frequency, member.voice);
  markInteraction();
  hop(pad, 460);
  floatWord(pad, "♪", "is-note");
  pulse(dom.stage.querySelector(".ask-note"));
  tanukiReact("jump", 560);
  state.playTaps += 1;
  /* The animals only speak now and then. Every tap would bury the music under
   * a voice, and the music is the reason to be here. */
  if (animal && state.playTaps % BAND_SPEAKS_EVERY === 0) {
    audio.speak(animal.cry || animal.label, "ja-JP");
  }
  const slotIndex = playStep();
  if (slotIndex < 0) return;
  fillCollectSlot(
    slotIndex,
    '<span class="collected-note" style="color:' + member.color + '">♪</span>',
  );
}

/* The whole band takes a bow: one pass along the row, left to right. */
function bandFinale() {
  const pads = dom.stage.querySelectorAll(".band-pad");
  state.round.items.forEach(function (member, index) {
    schedule(function () {
      audio.note(member.frequency, member.voice);
      hop(pads[index], 460);
    }, motion(20, 120) * index);
  });
}

/* -------------------------------------------------------------- peekaboo */
/*
 * Somebody is behind every hiding place, so there is nothing to get wrong — the
 * only question is who. A place that has already been opened stays open and
 * still answers a tap by saying its name again, because at this age doing the
 * same funny thing twelve times is the point rather than a failure to progress.
 */
function renderPeekabooRound() {
  const parts = buildStageFrame("stage-peekaboo");
  const field = el("div", "farm-field");

  state.round.items.forEach(function (guest) {
    const hideout = hideoutFor(guest.hideout);
    const plot = el("div", "farm-plot");
    const button = el("button", "hideout");
    button.type = "button";
    /* An attribute, not a modifier class: `hideout-box` as a class would collide
     * with the `.hideout-box` element inside it and restyle the button itself. */
    button.setAttribute("data-hideout", guest.hideout);
    button.setAttribute("data-item", guest.id);
    button.setAttribute("aria-label", guest.label);
    button.style.setProperty("--stir-delay", guest.slot * 0.55 + "s");

    /* Same shape as a farm plot: the box shrink-wraps a square SVG drawn at
     * full height, and everything else is positioned against that. */
    const box = el("div", "hideout-box");
    box.innerHTML = hideout.back;

    const opening = el("div", "hideout-window");
    opening.style.height = hideout.coverTop + "%";
    const figure = el("i", "hideout-guest " + guestClass(guest));
    figure.style.width = hideout.guestScale * 100 + "%";
    figure.style.height = hideout.guestScale * 100 + "%";
    figure.style.setProperty("--lip", hideout.lip + "%");
    opening.appendChild(figure);

    const front = el("div", "hideout-cover", hideout.front);

    box.appendChild(opening);
    box.appendChild(front);
    button.appendChild(box);
    plot.appendChild(button);
    field.appendChild(plot);

    on(button, "click", function () {
      openHideout(button, guest);
    });
  });

  parts.play.appendChild(field);
  buildCollectSlots(parts.collect, targetsPerRound("peekaboo"));
  startFreePlay(
    function () {
      return dom.stage.querySelector(".hideout:not(.is-open)");
    },
    function (manual) {
      if (!manual) return;
      audio.play("knock");
      audio.speak("いないいない", "ja-JP");
    },
  );
  showPeekaboo();
}

function showPeekaboo() {
  const body = askBody();
  if (body) body.innerHTML = '<span class="ask-peek">いない<br />いない</span>';
}

function guestClass(guest) {
  return guest.isTanuki ? "tanuki-sprite pose-jump" : spriteClass(guest.sprite);
}

function openHideout(button, guest) {
  markInteraction();
  const figure = button.querySelector(".hideout-guest");
  if (button.classList.contains("is-open")) {
    /* Already found. Say who it is again: a second tap must never be dead. */
    audio.play("tap");
    audio.speak(guest.speak, "ja-JP");
    hop(figure);
    return;
  }
  button.classList.add("is-open");
  audio.play("peek");
  audio.speak(guest.speak, "ja-JP");
  burst(button, guest.isTanuki ? "#f7d35b" : "#ffe9a8", 14);
  tanukiReact("jump", 900);
  flashAsk("ばあ！", showPeekaboo);
  const slotIndex = playStep();
  if (slotIndex < 0) return;
  fillCollectSlot(slotIndex, '<i class="' + guestClass(guest) + ' collected"></i>');
}

/* ----------------------------------------------------------------- feast */
/*
 * Feeding the tanuki. One tap sends the food to its mouth — no dragging, no
 * drop target — and the reward is a mouthful, a name, and a visibly rounder
 * tanuki. The belly is the progress bar, which is why nothing has to be read.
 */
function renderFeastRound() {
  const parts = buildStageFrame("stage-feast");
  const mat = el("div", "feast-mat");

  state.round.items.forEach(function (item) {
    const button = el("button", "feast-food");
    button.type = "button";
    button.setAttribute("data-item", item.id);
    button.setAttribute("aria-label", item.label);
    button.innerHTML = '<i class="feast-plate"></i>' + spriteMarkup(item.id, "feast-sprite");
    mat.appendChild(button);
    on(button, "click", function () {
      feed(button, item);
    });
  });

  parts.play.appendChild(mat);
  buildCollectSlots(parts.collect, targetsPerRound("feast"));
  state.roundFinale = feastFinale;
  startFreePlay(
    function () {
      return dom.stage.querySelector(".feast-food:not(.is-eaten)");
    },
    function (manual) {
      if (manual) audio.speak("おなか すいたなあ", "ja-JP");
    },
  );
  showRemaining();
  fattenTanuki();
}

function feed(button, item) {
  markInteraction();
  if (button.classList.contains("is-eaten")) {
    /* The plate is empty, but the touch still has to land somewhere. */
    audio.play("tap");
    wiggle(button);
    return;
  }
  button.classList.add("is-eaten");
  const tanuki = dom.stage.querySelector(".ask-tanuki");
  audio.play("pick");
  flyTo(button, tanuki, "fly-sprite", spriteMarkup(item.id), function () {
    audio.play("chomp");
    chew(tanuki);
    audio.speak(item.label, "ja-JP");
    state.yumIndex = (state.yumIndex + 1) % YUM.length;
    floatWord(tanuki, YUM[state.yumIndex]);
    const slotIndex = playStep();
    if (slotIndex >= 0) fillCollectSlot(slotIndex, spriteMarkup(item.id, "collected"));
    fattenTanuki();
    showRemaining();
  });
}

/*
 * Six mouthfuls make a visibly rounder tanuki. It is done by stretching the
 * background image rather than by transforming the element, so it survives
 * every hop and wobble the same element is also doing.
 */
function fattenTanuki() {
  const tanuki = dom.stage.querySelector(".ask-tanuki");
  if (!tanuki) return;
  tanuki.style.setProperty("--belly", String(1 + state.solved * 0.035));
}

function chew(node) {
  if (!node) return;
  node.classList.remove("is-chewing");
  void node.offsetWidth;
  node.classList.add("is-chewing");
  schedule(function () {
    node.classList.remove("is-chewing");
  }, 620);
}

/* The belly drum, not a word: `completeRound` says "おなか いっぱい" a moment
 * later, and two voices would cancel each other out. */
function feastFinale() {
  const tanuki = dom.stage.querySelector(".ask-tanuki");
  audio.play("full");
  audio.note(BAND_TANUKI.frequency, BAND_TANUKI.voice);
  burst(tanuki, "#f7d35b", 20);
  chew(tanuki);
}

/* --------------------------------------------------------------- bubbles */
/*
 * Bubbles drift slowly enough that a clumsy finger still lands on them, and one
 * per cell of a hidden grid means none of them can hide behind another. Each
 * pop is a semitone higher than the last, so clearing a board plays a little
 * rising scale the child did not know they were writing.
 */
function renderBubbleRound() {
  const parts = buildStageFrame("stage-bubble");
  const sky = el("div", "bubble-sky");

  state.round.items.forEach(function (bubble) {
    const button = el("button", "bubble");
    button.type = "button";
    button.setAttribute("data-item", bubble.id);
    button.setAttribute("aria-label", "しゃぼんだま");
    button.style.left = bubble.x + "%";
    button.style.top = bubble.y + "%";
    button.style.width = bubble.size + "vmin";
    button.style.height = bubble.size + "vmin";
    /* Centred with margins rather than a translate, so the drift, the pop and
     * the guidance pulse can each own `transform` without cancelling the
     * centring the way a shared translate would. */
    button.style.marginLeft = -bubble.size / 2 + "vmin";
    button.style.marginTop = -bubble.size / 2 + "vmin";
    button.style.setProperty("--bubble-color", bubble.color);
    button.style.setProperty("--sway", bubble.sway + "vmin");
    button.style.setProperty("--float", bubble.duration + "ms");
    /* A negative delay starts each bubble part-way through its own drift, so
     * six of them never sway in lockstep. */
    button.style.setProperty("--float-delay", "-" + Math.round(bubble.delay) + "ms");
    button.innerHTML = '<i class="bubble-shine"></i><i class="bubble-spark"></i>';
    sky.appendChild(button);
    on(button, "pointerdown", function () {
      popBubble(button, bubble);
    });
  });

  parts.play.appendChild(sky);
  buildCollectSlots(parts.collect, targetsPerRound("bubble"));
  startFreePlay(
    function () {
      return dom.stage.querySelector(".bubble:not(.is-popped)");
    },
    function (manual) {
      if (manual) audio.play("sparkle");
    },
  );
  showRemaining();
}

function popBubble(button, bubble) {
  if (button.classList.contains("is-popped")) return;
  markInteraction();
  const slotIndex = playStep();
  button.classList.add("is-popped");
  audio.play("pop", slotIndex < 0 ? 0 : slotIndex);
  burst(button, bubble.color, 10);
  tanukiReact("jump", 520);
  if (slotIndex >= 0) {
    fillCollectSlot(
      slotIndex,
      '<span class="collected-bubble" style="background:' + bubble.color + '"></span>',
    );
  }
  showRemaining();
}

/* ------------------------------------------------------------ round flow */
function completeStep() {
  state.solved += 1;
  state.stepIndex += 1;
  state.busy = false;
  /* No question is on the board until the next one is posed, so a tap in the
   * gap can never be scored against the request that was just answered. */
  state.quest = null;
  clearHintClasses();
  hideHand();
  const total = targetsPerRound(state.activity);
  if (state.solved >= total) {
    schedule(completeRound, motion(120, 700));
    return;
  }
  const pause = motion(140, STEP_PACING[state.activity] || 900);
  if (state.solved % PRAISE_EVERY === 0) {
    audio.speak(nextPraise(), "ja-JP", { delay: Math.max(700, pause - 250) });
  }
  schedule(function () {
    if (state.activity === "farm") startFarmQuest();
    else if (state.activity === "animal") startAnimalQuest();
    else if (isLetterField(state.activity)) startLetterFieldQuest();
    else startLiteracyQuest();
  }, pause);
}

function renderRound() {
  clearRuntime();
  state.stepIndex = 0;
  state.solved = 0;
  state.round = state.session.rounds[state.roundIndex];
  updateHud();
  if (state.activity === "band") renderBandRound();
  else if (state.activity === "peekaboo") renderPeekabooRound();
  else if (state.activity === "feast") renderFeastRound();
  else if (state.activity === "bubble") renderBubbleRound();
  else if (state.activity === "farm") renderFarmRound();
  else if (state.activity === "animal") renderAnimalRound();
  else if (isLetterField(state.activity)) renderLetterFieldRound();
  else renderLiteracyRound();
  bindShellControls();
}

function updateHud() {
  const meta = ACTIVITY_META[state.activity];
  dom.modeIcon.textContent = meta.icon;
  dom.modeTitle.textContent = meta.title;
  let pips = "";
  for (let index = 0; index < ROUNDS_PER_ACTIVITY; index += 1) {
    pips += '<i class="' + (index <= state.roundIndex ? "is-filled" : "") + '"></i>';
  }
  dom.pips.innerHTML = pips;
}

function completeRound() {
  state.busy = true;
  state.quest = null;
  hideHand();
  clearHintClasses();
  audio.play("celebrate");
  /* One voice: the board that just finished chooses what it says, so a play
   * mode's own line is never cut off by a generic one arriving on top of it. */
  audio.speak(ACTIVITY_META[state.activity].completeLine || "できたね", "ja-JP", { delay: 260 });
  tanukiReact("jump", 1600);
  burst(dom.stage.querySelector(".ask-tanuki"), "#f7d35b", 20);
  const isLast = state.roundIndex + 1 >= ROUNDS_PER_ACTIVITY;
  dom.nextButton.querySelector("strong").textContent = isLast ? "できた！" : "つぎへ";
  schedule(function () {
    dom.roundComplete.hidden = false;
  }, motion(60, 520));
}

function advanceFromComplete() {
  audio.play("next");
  const next = advanceRound(state.roundIndex);
  if (next.complete) {
    finishSession();
    return;
  }
  /* Carry this board's results forward so the finish screen can celebrate the
   * whole session, not just whatever happened to be on screen last. */
  state.sessionResults = collectSessionResults();
  state.roundIndex = next.roundIndex;
  renderRound();
}

/* Every literacy device walks its own random order of the chart. */
function curriculumSeedFor(activity) {
  if (!state.progress.curriculumSeed
    || !Object.prototype.hasOwnProperty.call(state.progress.curriculumSeed, activity)) {
    return 0;
  }
  if (!state.progress.curriculumSeed[activity]) {
    state.progress.curriculumSeed[activity] = Math.floor(Math.random() * 0xfffffff) + 1;
    saveProgress();
  }
  return state.progress.curriculumSeed[activity];
}

function startMode(activity) {
  clearRuntime();
  state.activity = normalizeActivity(activity);
  state.roundIndex = 0;
  state.sessionResults = [];
  state.sessionFound = {};
  /* Built once per session so the farm can still promise all eighteen foods
   * while dealing them out at random. */
  state.session = createSession(state.activity, {
    curriculumIndex: state.progress.curriculum[state.activity],
    curriculumSeed: curriculumSeedFor(state.activity),
  });
  document.body.className = document.body.className
    .split(" ")
    .filter(function (name) {
      return name.indexOf("activity-") !== 0;
    })
    .join(" ");
  document.body.classList.add("activity-" + state.activity);
  showScreen("game");
  audio.unlock();
  audio.play("open");
  renderRound();
}

function finishSession() {
  const activity = state.activity;
  const results = collectSessionResults();
  clearRuntime();
  state.activity = activity;
  state.progress.sessions += 1;
  state.progress.completed[activity] += 1;
  if (Object.prototype.hasOwnProperty.call(state.progress.curriculum, activity)) {
    const advanced = advanceCurriculum(
      activity,
      state.progress.curriculum[activity],
      state.progress.curriculumSeed[activity],
    );
    state.progress.curriculum[activity] = advanced.index;
    state.progress.curriculumSeed[activity] = advanced.seed;
  }
  saveProgress();
  renderFinish(results);
  showScreen("finish");
  audio.play("celebrate");
  audio.speak("ぜんぶ できたね。すごーい", "ja-JP", { delay: 420 });
}

function collectSessionResults() {
  const filled = dom.stage.querySelectorAll(".collect-slot.is-filled");
  const results = [];
  for (let index = 0; index < filled.length; index += 1) {
    results.push(filled[index].innerHTML);
  }
  return state.sessionResults.concat(results);
}

function renderFinish(results) {
  const meta = ACTIVITY_META[state.activity];
  dom.finishKicker.textContent = meta.finishKicker;
  dom.finishTitle.textContent = meta.finishTitle;
  const shown = results.length <= 6 ? results : pickEvenly(results, 6);
  dom.finishResults.innerHTML = shown
    .map(function (html, index) {
      return '<div class="finish-result" style="--result-index:' + index + '">' + html + "</div>";
    })
    .join("");
  renderConfetti();
}

function pickEvenly(items, count) {
  const step = (items.length - 1) / (count - 1);
  const picked = [];
  for (let index = 0; index < count; index += 1) {
    picked.push(items[Math.round(index * step)]);
  }
  return picked;
}

function renderConfetti() {
  clear(dom.confetti);
  if (state.settings.reduceMotion) return;
  const colors = ["#ef7065", "#f6cc4f", "#65bde1", "#74b97a", "#9b70cf"];
  for (let index = 0; index < 34; index += 1) {
    const piece = el("i", "");
    piece.style.setProperty("--x", Math.random() * 100 + "vw");
    piece.style.setProperty("--delay", Math.random() * 1.3 + "s");
    piece.style.setProperty("--drift", -70 + Math.random() * 140 + "px");
    piece.style.background = colors[index % colors.length];
    dom.confetti.appendChild(piece);
  }
}

function returnHome() {
  clearRuntime();
  document.body.className = document.body.className
    .split(" ")
    .filter(function (name) {
      return name.indexOf("activity-") !== 0;
    })
    .join(" ");
  closeParentOverlay();
  showScreen("home");
}

/* Controls that live in the shell must be rebound after every teardown. */
function bindShellControls() {
  on(dom.nextButton, "click", advanceFromComplete);
  on(query("#game-home-button"), "click", returnHome);
  on(query("#game-adult-button"), "click", openParentOverlay);
}

/* --------------------------------------------------------- parent screen */
function openParentOverlay() {
  audio.stop();
  dom.parentGate.hidden = false;
  dom.parentSettings.hidden = true;
  query("#gate-feedback").textContent = "";
  dom.parentOverlay.hidden = false;
}

function closeParentOverlay() {
  dom.parentOverlay.hidden = true;
}

function unlockParentSettings() {
  dom.parentGate.hidden = true;
  dom.parentSettings.hidden = false;
  dom.effectsSetting.checked = state.settings.effects;
  dom.voiceSetting.checked = state.settings.voice;
  dom.motionSetting.checked = state.settings.reduceMotion;
  dom.sessionCount.textContent = state.progress.sessions + "回";
}

function saveSettings() {
  writeStorage(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

function saveProgress() {
  writeStorage(STORAGE_KEYS.progress, JSON.stringify(state.progress));
}

/* ------------------------------------------------------------------ boot */
function bindPermanentControls() {
  for (let index = 0; index < dom.modeButtons.length; index += 1) {
    (function (button) {
      button.addEventListener("click", function () {
        startMode(button.getAttribute("data-mode"));
      });
    })(dom.modeButtons[index]);
  }
  /*
   * The tanuki on the home screen is not decoration and never was meant to be.
   * It waves by itself, and poking it drums its belly — so the very first thing
   * a child touches, before choosing anything, already answers back.
   */
  const homeTanuki = query("#home-tanuki");
  homeTanuki.addEventListener("click", function () {
    audio.unlock();
    audio.note(BAND_TANUKI.frequency, BAND_TANUKI.voice);
    homeTanuki.classList.remove("is-reacting");
    void homeTanuki.offsetWidth;
    homeTanuki.classList.add("is-reacting");
    window.setTimeout(function () {
      homeTanuki.classList.remove("is-reacting");
    }, 800);
    state.playTaps += 1;
    if (state.playTaps % 3 === 0) audio.speak("ぽんぽこ", "ja-JP");
  });

  query("#adult-button").addEventListener("click", openParentOverlay);
  query("#replay-button").addEventListener("click", function () {
    startMode(state.activity);
  });
  query("#finish-home-button").addEventListener("click", returnHome);
  query("#overlay-close").addEventListener("click", closeParentOverlay);
  dom.parentOverlay.addEventListener("click", function (event) {
    if (event.target === dom.parentOverlay) closeParentOverlay();
  });

  const gateButtons = document.querySelectorAll("[data-gate]");
  for (let index = 0; index < gateButtons.length; index += 1) {
    (function (button) {
      button.addEventListener("click", function () {
        if (button.getAttribute("data-gate") === "5") unlockParentSettings();
        else {
          query("#gate-feedback").textContent = "もう一度お試しください";
          wiggle(button);
        }
      });
    })(gateButtons[index]);
  }

  dom.effectsSetting.addEventListener("change", function () {
    state.settings.effects = dom.effectsSetting.checked;
    saveSettings();
    if (state.settings.effects) audio.play("tap");
  });
  dom.voiceSetting.addEventListener("change", function () {
    state.settings.voice = dom.voiceSetting.checked;
    saveSettings();
    if (state.settings.voice) audio.speak("こんにちは", "ja-JP");
  });
  dom.motionSetting.addEventListener("change", function () {
    state.settings.reduceMotion = dom.motionSetting.checked;
    document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
    saveSettings();
  });
  query("#reset-button").addEventListener("click", function () {
    state.progress.sessions = 0;
    ACTIVITY_ORDER.forEach(function (activity) {
      state.progress.completed[activity] = 0;
    });
    Object.keys(state.progress.curriculum).forEach(function (activity) {
      state.progress.curriculum[activity] = 0;
      state.progress.curriculumSeed[activity] = 0;
    });
    saveProgress();
    dom.sessionCount.textContent = "0回";
    audio.play("next");
  });
  query("#repair-button").addEventListener("click", repairInstallation);

  document.addEventListener(
    "pointerdown",
    function () {
      audio.unlock();
    },
    { once: true },
  );
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) audio.stop();
  });
  /* Two-finger or accidental gestures must never scroll the play surface. */
  document.addEventListener(
    "touchmove",
    function (event) {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );
}

/* Clears every cached copy and reloads: the escape hatch for a bad install. */
function repairInstallation() {
  const done = function () {
    window.location.reload();
  };
  try {
    const jobs = [];
    if (window.caches && window.caches.keys) {
      jobs.push(
        window.caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return window.caches.delete(key);
            }),
          );
        }),
      );
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
          return Promise.all(
            registrations.map(function (registration) {
              return registration.unregister();
            }),
          );
        }),
      );
    }
    if (!jobs.length) {
      done();
      return;
    }
    Promise.all(jobs).then(done, done);
    window.setTimeout(done, 1500);
  } catch (error) {
    done();
  }
}

/*
 * The optional ABC picture sheet is declared by the build, not probed at
 * runtime: a missing file must never cost a network round trip or log a 404.
 */
function readAssetFlags() {
  const flags = window.__ponpokoAssets || {};
  state.bonusSprites = flags.abc === true;
  if (state.bonusSprites) document.body.classList.add("has-abc-sprites");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (window.location.protocol === "file:") return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./service-worker.js").catch(function () {});
  });
}

function boot() {
  buildShell();
  document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
  bindPermanentControls();
  readAssetFlags();
  registerServiceWorker();
  showScreen("home");
  if (dom.buildStamp) dom.buildStamp.textContent = BUILD_REVISION;
  window.__ponpokoBooted = true;
  document.documentElement.classList.add("app-ready");
}

boot();

/* Exposed only so the browser smoke test can drive the app deterministically. */
window.__ponpoko = {
  revision: BUILD_REVISION,
  state: state,
  startMode: startMode,
  catalogs: { HIRAGANA: HIRAGANA, ALPHABET: ALPHABET, ANIMALS: ANIMALS, FARM_ITEMS: FARM_ITEMS },
};
