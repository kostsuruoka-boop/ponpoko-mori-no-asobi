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
  TOY_LINES,
  YUM,
} from "./content.js";
import {
  advanceCurriculum,
  advanceRound,
  animalById,
  CHEER_EVERY,
  createSession,
  dealBand,
  dealBubbles,
  dealFeast,
  dealPeekaboo,
  hintStage,
  isLetterField,
  isPlayActivity,
  literacyCatalog,
  loadSavedState,
  makeBubble,
  nextCourse,
  nextGuest,
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
  playTaps: 0,
  yumIndex: 0,
  /* Toy state. None of it is progress: it is just what is on screen. */
  danceToken: 0,
  lineIndex: 0,
  lastToyTouch: 0,
  belly: 0,
  bubbleSerial: 0,
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
  state.danceToken += 1;
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
  const tanuki = tanukiNode();
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
  const tanuki = node || tanukiNode();
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

function hop(node, duration) {
  if (!node) return;
  node.classList.remove("is-hopping");
  void node.offsetWidth;
  node.classList.add("is-hopping");
  schedule(function () {
    node.classList.remove("is-hopping");
  }, duration || 560);
}

/*
 * A word that drifts up off a character. Deliberately not spoken: there is one
 * voice, and it is busy naming the thing the child just touched.
 */
function floatWord(node, text, className) {
  if (state.settings.reduceMotion || !node) return;
  const rect = node.getBoundingClientRect();
  if (!rect.width) return;
  const word = el("i", "float-word " + (className || ""), text);
  word.style.left = rect.left + rect.width / 2 + "px";
  /* Launched from just above the head. Starting it lower put the word across
   * the face of whoever had just said it. */
  word.style.top = rect.top + rect.height * 0.04 + "px";
  word.style.setProperty("--dx", Math.round(Math.random() * 44 - 22) + "px");
  dom.fx.appendChild(word);
  schedule(function () {
    if (word.parentNode) word.parentNode.removeChild(word);
  }, 1400);
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

/* ---------------------------------------------------------------- toys */
/*
 * A toy is not a game.
 *
 * These four have no request, no answer, no round, no score and no end. The
 * child plays until an adult takes the iPad away. That is why they do not use
 * the ask/play/collect frame the finding games share: a speech bubble with
 * nothing to ask, a shelf counting to six and a "next" button are the
 * furniture of a quiz, and putting a toy inside them made it feel like one.
 *
 * What replaces all of it is a single arrangement, the same in all four: the
 * tanuki is the biggest thing on screen and always in the same place, and
 * everything else is something to touch. Nothing here can be finished, so
 * nothing here can be failed.
 */

const TOY_BEAT = 460;
const TOY_IDLE = 7000;
/* The tanuki only has still poses, so the dance is made by cutting between
 * them on a beat while the body hops. Five reads as choreography; two reads as
 * a glitch. */
const DANCE_POSES = ["jump", "wave", "reach", "run", "push", "basket"];

/*
 * Toys speak English. It is not a language lesson — the words are there because
 * a sound with a shape is funnier than a sound without one — and the English
 * voices on the device are markedly more natural than the Japanese ones.
 */
function toySpeak(text) {
  if (!text) return;
  audio.speak(text, "en-US", { rate: 0.86 });
}

function toyCycle(list) {
  state.lineIndex = (state.lineIndex + 1) % list.length;
  return list[state.lineIndex];
}

function tanukiNode() {
  return dom.stage.querySelector(".toy-tanuki") || dom.stage.querySelector(".ask-tanuki");
}

function buildToyStage(activity) {
  clear(dom.stage);
  const stage = el("div", "toy-stage toy-" + activity);
  const field = el("div", "toy-field");
  const tanuki = el("button", "toy-tanuki tanuki-sprite pose-" + ACTIVITY_META[activity].pose);
  tanuki.type = "button";
  tanuki.setAttribute("aria-label", "たぬきを つつく");
  const floor = el("div", "toy-floor");

  stage.appendChild(floor);
  stage.appendChild(field);
  stage.appendChild(tanuki);
  dom.stage.appendChild(stage);

  on(tanuki, "click", function () {
    pokeTanuki(tanuki);
    danceTanuki(3);
  });
  return { stage: stage, field: field, tanuki: tanuki };
}

/*
 * Dance for a number of beats. A later call simply takes over — a child hitting
 * the drum ten times in a row should get ten beats of dancing, not ten dances
 * fighting each other for the same element.
 */
function danceTanuki(beats) {
  const node = tanukiNode();
  if (!node) return;
  state.danceToken += 1;
  const token = state.danceToken;
  const base = ACTIVITY_META[state.activity].pose;
  if (state.settings.reduceMotion) {
    setPose(node, "jump");
    schedule(function () {
      if (token === state.danceToken) setPose(node, base);
    }, 200);
    return;
  }
  node.classList.add("is-dancing");
  let beat = 0;
  const step = function () {
    if (token !== state.danceToken) return;
    beat += 1;
    if (beat > beats) {
      node.classList.remove("is-dancing");
      setPose(node, base);
      return;
    }
    setPose(node, DANCE_POSES[beat % DANCE_POSES.length]);
    schedule(step, TOY_BEAT);
  };
  step();
}

function hopTanuki() {
  const node = tanukiNode();
  if (!node) return;
  node.classList.remove("is-hopping");
  void node.offsetWidth;
  node.classList.add("is-hopping");
  schedule(function () {
    node.classList.remove("is-hopping");
  }, 620);
}

/*
 * Every touch on a toy goes through here. It keeps the idle attractor honest
 * and, every so often, lets the whole thing boil over into a celebration —
 * which gates nothing, because there is nothing to gate.
 */
function toyTouched() {
  state.lastToyTouch = Date.now();
  state.playTaps += 1;
  if (state.playTaps % CHEER_EVERY === 0) cheer();
}

function cheer() {
  audio.play("fanfare");
  toySpeak(toyCycle(TOY_LINES.yay));
  danceTanuki(6);
  const node = tanukiNode();
  burst(node, "#f7d35b", 18);
  toyConfetti();
}

/* A short shower, not the full finish-screen storm: it happens often. */
function toyConfetti() {
  if (state.settings.reduceMotion) return;
  const colors = ["#ef7065", "#f6cc4f", "#65bde1", "#74b97a", "#9b70cf"];
  for (let index = 0; index < 18; index += 1) {
    const piece = el("i", "toy-confetti");
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty("--delay", Math.random() * 0.5 + "s");
    piece.style.setProperty("--drift", -60 + Math.random() * 120 + "px");
    dom.fx.appendChild(piece);
    schedule(function () {
      if (piece.parentNode) piece.parentNode.removeChild(piece);
    }, 2400);
  }
}

/*
 * If nothing has been touched for a while, the tanuki hops and one of the
 * things on the board wobbles. No pointing hand and no glow: on a board where
 * everything works, singling one thing out would be a lie.
 */
function startToyIdle(getObjects) {
  state.lastToyTouch = Date.now();
  const lifecycle = state.lifecycle;
  state.hintTicker = window.setInterval(function () {
    if (lifecycle !== state.lifecycle) return;
    if (Date.now() - state.lastToyTouch < TOY_IDLE) return;
    state.lastToyTouch = Date.now();
    hopTanuki();
    const nodes = getObjects();
    if (nodes.length) wiggle(nodes[Math.floor(Math.random() * nodes.length)]);
  }, 1000);
}

/* --------------------------------------------------------- おんがくたい */
/*
 * Six friends who each own one pitch of a pentatonic scale, so no order of
 * taps is sour and hitting all six at once is a chord. Nothing is counted and
 * nothing is used up: playing the same drum thirty times is the point.
 */
function renderBand() {
  const parts = buildToyStage("band");
  const row = el("div", "band-row");

  dealBand(Math.random).forEach(function (member) {
    const pad = el("button", "band-pad");
    pad.type = "button";
    pad.setAttribute("data-item", member.id);
    pad.setAttribute("aria-label", member.label);
    pad.style.setProperty("--pad-color", member.color);
    pad.innerHTML = '<i class="band-ring"></i>' + spriteMarkup(member.animal, "band-sprite")
      + '<b class="band-badge">♪</b>';
    row.appendChild(pad);
    /* Sound on the finger landing, not on it lifting: an instrument that waits
     * for the release does not feel like an instrument. */
    on(pad, "pointerdown", function () {
      strikeBand(pad, member);
    });
  });

  parts.field.appendChild(row);
  startToyIdle(function () {
    return dom.stage.querySelectorAll(".band-pad");
  });
  danceTanuki(3);
}

function strikeBand(pad, member) {
  audio.note(member.frequency, member.voice);
  hop(pad, 460);
  floatWord(pad, "♪", "is-note");
  danceTanuki(3);
  toyTouched();
}

/* ------------------------------------------------------ いないいないばあ */
/*
 * Somebody is behind every hiding place, and when they have been found they
 * duck back down and somebody else moves in. The board therefore never empties
 * and the joke never runs out.
 */
function renderPeekaboo() {
  const parts = buildToyStage("peekaboo");
  const field = el("div", "peek-field");

  dealPeekaboo(Math.random).forEach(function (spot) {
    const button = el("button", "hideout");
    button.type = "button";
    button.setAttribute("data-item", "spot-" + spot.slot);
    /* An attribute, not a modifier class: `hideout-box` as a class would
     * collide with the `.hideout-box` element inside it. */
    button.setAttribute("data-hideout", spot.hideout);
    button.style.setProperty("--stir-delay", spot.slot * 0.55 + "s");
    field.appendChild(button);
    dressHideout(button, spot);
    on(button, "click", function () {
      openHideout(button);
    });
  });

  parts.field.appendChild(field);
  startToyIdle(function () {
    return dom.stage.querySelectorAll(".hideout:not(.is-open)");
  });
  danceTanuki(2);
}

/* Put a hiding place and whoever is in it on screen, closed. */
function dressHideout(button, spot) {
  const hideout = hideoutFor(spot.hideout);
  button.__guest = spot;
  button.classList.remove("is-open");
  button.setAttribute("aria-label", spot.label);
  clear(button);

  const box = el("div", "hideout-box");
  box.innerHTML = hideout.back;

  const opening = el("div", "hideout-window");
  opening.style.height = hideout.coverTop + "%";
  const figure = el("i", "hideout-guest " + guestClass(spot));
  figure.style.width = hideout.guestScale * 100 + "%";
  figure.style.height = hideout.guestScale * 100 + "%";
  figure.style.setProperty("--lip", hideout.lip + "%");
  opening.appendChild(figure);

  const front = el("div", "hideout-cover", hideout.front);
  box.appendChild(opening);
  box.appendChild(front);
  button.appendChild(box);
}

function guestClass(guest) {
  return guest.isTanuki ? "tanuki-sprite pose-jump" : spriteClass(guest.sprite);
}

function visibleGuests() {
  const nodes = dom.stage.querySelectorAll(".hideout");
  const ids = [];
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index].__guest) ids.push(nodes[index].__guest.id);
  }
  return ids;
}

function openHideout(button) {
  const spot = button.__guest;
  if (!spot) return;
  toyTouched();
  if (button.classList.contains("is-open")) {
    /* Already out. A second tap must never be a dead touch, so they bounce. */
    audio.play("tap");
    hop(button.querySelector(".hideout-guest"));
    return;
  }
  button.classList.add("is-open");
  audio.play("peek");
  burst(button, spot.isTanuki ? "#f7d35b" : "#ffe9a8", 14);
  /* "Peekaboo" for the tanuki, a name for everybody else: the joke lands
   * harder when the one you were hoping for gets the punchline. */
  toySpeak(spot.isTanuki ? TOY_LINES.peekaboo : spot.en);
  danceTanuki(spot.isTanuki ? 4 : 2);

  /* Long enough to be looked at, short enough that the spot is worth coming
   * back to. Then somebody new moves in and it is a surprise again. */
  schedule(function () {
    if (!button.parentNode) return;
    button.classList.remove("is-open");
    schedule(function () {
      if (!button.parentNode) return;
      const taken = visibleGuests();
      const spotIndex = taken.indexOf(spot.id);
      if (spotIndex >= 0) taken.splice(spotIndex, 1);
      const guest = nextGuest(taken, Math.random);
      dressHideout(button, {
        slot: spot.slot,
        hideout: spot.hideout,
        id: guest.id,
        label: guest.label,
        speak: guest.speak,
        sprite: guest.sprite,
        isTanuki: guest.isTanuki === true,
      });
    }, motion(40, 520));
  }, motion(120, 3200));
}

/* --------------------------------------------------------------- ごはん */
/*
 * Tap the food and it goes into the tanuki's mouth. The plate refills, so
 * there is always something to give; the tanuki gets visibly rounder with
 * every mouthful, and when it can hold no more it does the belly-drum dance
 * and starts again hungry.
 */
const FEAST_FULL = 6;

function renderFeast() {
  const parts = buildToyStage("feast");
  const tray = el("div", "feast-tray");

  dealFeast(Math.random).forEach(function (item) {
    const plate = el("button", "feast-food");
    plate.type = "button";
    plate.setAttribute("data-item", "plate-" + item.slot);
    tray.appendChild(plate);
    serveFood(plate, item);
    on(plate, "click", function () {
      feed(plate);
    });
  });

  parts.field.appendChild(tray);
  state.belly = 0;
  fattenTanuki();
  startToyIdle(function () {
    return dom.stage.querySelectorAll(".feast-food:not(.is-eaten)");
  });
  danceTanuki(2);
}

function serveFood(plate, item) {
  plate.__food = item;
  plate.classList.remove("is-eaten");
  plate.setAttribute("aria-label", item.label);
  plate.innerHTML = '<i class="feast-plate"></i>' + spriteMarkup(item.id, "feast-sprite");
}

function servedFoods() {
  const nodes = dom.stage.querySelectorAll(".feast-food");
  const ids = [];
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index].__food) ids.push(nodes[index].__food.id);
  }
  return ids;
}

function feed(plate) {
  toyTouched();
  if (plate.classList.contains("is-eaten")) {
    /* An empty plate still answers: nothing on a toy is ever dead. */
    audio.play("tap");
    wiggle(plate);
    return;
  }
  const item = plate.__food;
  plate.classList.add("is-eaten");
  const tanuki = tanukiNode();
  audio.play("pick");

  flyTo(plate, tanuki, "fly-sprite", spriteMarkup(item.id), function () {
    audio.play("chomp");
    chew(tanuki);
    toySpeak(item.en);
    state.yumIndex = (state.yumIndex + 1) % YUM.length;
    floatWord(tanuki, YUM[state.yumIndex]);
    state.belly += 1;
    fattenTanuki();
    if (state.belly >= FEAST_FULL) schedule(feastFull, motion(60, 520));
  });

  /* The plate is refilled rather than left empty, so the child never has to
   * wait for permission to give the next thing. */
  schedule(function () {
    if (!plate.parentNode) return;
    const taken = servedFoods();
    const at = taken.indexOf(item.id);
    if (at >= 0) taken.splice(at, 1);
    serveFood(plate, nextCourse(taken, Math.random));
  }, motion(80, 1100));
}

function feastFull() {
  const tanuki = tanukiNode();
  audio.play("full");
  audio.note(BAND_TANUKI.frequency, BAND_TANUKI.voice);
  burst(tanuki, "#f7d35b", 20);
  toyConfetti();
  toySpeak(toyCycle(TOY_LINES.full));
  danceTanuki(7);
  /* Hungry again, so the best part can happen as often as she likes. */
  schedule(function () {
    state.belly = 0;
    fattenTanuki();
  }, motion(120, 2600));
}

/*
 * Six mouthfuls make a visibly rounder tanuki. Stretching the background image
 * rather than transforming the element means the belly survives every hop,
 * chew and dance the same element is also doing.
 */
function fattenTanuki() {
  const node = tanukiNode();
  if (!node) return;
  node.style.setProperty("--belly", String(1 + state.belly * 0.04));
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

/* --------------------------------------------------------- しゃぼんだま */
/*
 * The tanuki blows them and they keep coming. Each pop climbs a pentatonic
 * scale, and a popped bubble is replaced a moment later, so the sky is never
 * empty and there is nothing to clear.
 */
function renderBubbles() {
  const parts = buildToyStage("bubble");
  const sky = el("div", "bubble-sky");
  parts.field.appendChild(sky);
  state.bubbleSerial = 0;
  dealBubbles(Math.random).forEach(function (bubble) {
    state.bubbleSerial = Math.max(state.bubbleSerial, 1);
    sky.appendChild(makeBubbleNode(bubble));
  });
  state.bubbleSerial = 6;
  startToyIdle(function () {
    return dom.stage.querySelectorAll(".bubble:not(.is-popped)");
  });
  danceTanuki(2);
}

function makeBubbleNode(bubble) {
  const button = el("button", "bubble");
  button.type = "button";
  button.setAttribute("data-item", bubble.id);
  button.setAttribute("data-cell", String(bubble.cell));
  button.setAttribute("aria-label", "しゃぼんだま");
  button.style.left = bubble.x + "%";
  button.style.top = bubble.y + "%";
  button.style.width = bubble.size + "vmin";
  button.style.height = bubble.size + "vmin";
  /* Centred with margins rather than a translate, so the drift and the pop can
   * each own `transform` without cancelling the centring. */
  button.style.marginLeft = -bubble.size / 2 + "vmin";
  button.style.marginTop = -bubble.size / 2 + "vmin";
  button.style.setProperty("--bubble-color", bubble.color);
  button.style.setProperty("--sway", bubble.sway + "vmin");
  button.style.setProperty("--float", bubble.duration + "ms");
  button.style.setProperty("--float-delay", "-" + Math.round(bubble.delay) + "ms");
  button.innerHTML = '<i class="bubble-shine"></i><i class="bubble-spark"></i>';
  on(button, "pointerdown", function () {
    popBubble(button, bubble);
  });
  return button;
}

function popBubble(button, bubble) {
  if (button.classList.contains("is-popped")) return;
  toyTouched();
  button.classList.add("is-popped");
  audio.play("pop", state.playTaps % 6);
  burst(button, bubble.color, 10);
  hopTanuki();
  if (state.playTaps % 3 === 0) toySpeak(TOY_LINES.pop);

  /*
   * Replaced as soon as the pop has finished playing. A slower refill let a
   * fast pair of hands empty the sky, and an empty sky is the one state this
   * toy is not allowed to reach.
   */
  const sky = dom.stage.querySelector(".bubble-sky");
  schedule(function () {
    if (button.parentNode) button.parentNode.removeChild(button);
    if (!sky || !sky.parentNode) return;
    state.bubbleSerial += 1;
    sky.appendChild(makeBubbleNode(makeBubble(bubble.cell, state.bubbleSerial, Math.random)));
  }, motion(60, 420));
}

/* -------------------------------------------------------------- opening */
function startToy(activity) {
  clearRuntime();
  state.activity = activity;
  state.playTaps = 0;
  state.belly = 0;
  state.session = null;
  state.round = null;
  setBodyActivity(activity);
  showScreen("game");
  audio.unlock();
  audio.play("open");
  updateHud();
  if (activity === "band") renderBand();
  else if (activity === "peekaboo") renderPeekaboo();
  else if (activity === "feast") renderFeast();
  else renderBubbles();
  bindShellControls();
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
  if (state.activity === "farm") renderFarmRound();
  else if (state.activity === "animal") renderAnimalRound();
  else if (isLetterField(state.activity)) renderLetterFieldRound();
  else renderLiteracyRound();
  bindShellControls();
}

function updateHud() {
  const meta = ACTIVITY_META[state.activity];
  dom.modeIcon.textContent = meta.icon;
  dom.modeTitle.textContent = meta.title;
  /* A toy has no rounds to be part-way through, so it shows no progress. */
  dom.pips.hidden = isPlayActivity(state.activity);
  if (dom.pips.hidden) return;
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

function setBodyActivity(activity) {
  document.body.className = document.body.className
    .split(" ")
    .filter(function (name) {
      return name.indexOf("activity-") !== 0;
    })
    .join(" ");
  document.body.classList.add("activity-" + activity);
}

function startMode(activity) {
  const resolved = normalizeActivity(activity);
  /* The toys do not have sessions, rounds or an end, so they never enter the
   * machinery below. */
  if (isPlayActivity(resolved)) {
    startToy(resolved);
    return;
  }
  clearRuntime();
  state.activity = resolved;
  state.roundIndex = 0;
  state.sessionResults = [];
  state.sessionFound = {};
  /* Built once per session so the farm can still promise all eighteen foods
   * while dealing them out at random. */
  state.session = createSession(state.activity, {
    curriculumIndex: state.progress.curriculum[state.activity],
    curriculumSeed: curriculumSeedFor(state.activity),
  });
  setBodyActivity(state.activity);
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
