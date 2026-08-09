/*
 * ぽんぽこ もりの だいぼうけん — application shell.
 *
 * Design rules this file enforces:
 *  - Every interaction is a single tap on a large target. Nothing is dragged.
 *  - Whatever the guidance points at is exactly what must be tapped.
 *  - A wrong tap teaches (the tapped thing says its own name) and never blocks.
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
  FARM_ITEMS,
  HIRAGANA,
  PRAISE,
  ROUNDS_PER_ACTIVITY,
} from "./content.js";
import {
  advanceCurriculum,
  advanceRound,
  animalById,
  createSession,
  hintStage,
  literacyCatalog,
  loadSavedState,
  normalizeActivity,
  targetsPerRound,
} from "./game-core.js";
import {
  backdropMarkup,
  habitatFor,
  PRODUCE_ROTATION,
} from "./scenery.js";

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

function animate(node, keyframes, options, onFinish) {
  const lifecycle = state.lifecycle;
  function done() {
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
  const tanuki = el("div", "ask-tanuki tanuki-sprite pose-" + ACTIVITY_META[state.activity].pose);
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

function positionHand(target) {
  if (!target || state.settings.reduceMotion) return;
  const rect = target.getBoundingClientRect();
  if (!rect.width) return;
  dom.hand.style.left = rect.left + rect.width / 2 + "px";
  dom.hand.style.top = rect.top + rect.height * 0.62 + "px";
  dom.hand.classList.add("is-visible");
}

function hideHand() {
  if (!dom.hand) return;
  dom.hand.classList.remove("is-visible");
}

function resolveTap(id, element) {
  const quest = state.quest;
  if (!quest || state.busy) return;
  markInteraction();
  if (id === quest.targetId) {
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
  tanuki.classList.add("is-reacting");
  schedule(function () {
    tanuki.classList.remove("is-reacting");
    setPose(tanuki, base);
  }, duration || 900);
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
    const sprite = el("i", spriteClass(item.id) + " produce-sprite");
    const rotation = PRODUCE_ROTATION[item.id] || 0;
    if (rotation) sprite.style.transform = "rotate(" + rotation + "deg)";
    button.appendChild(sprite);
    box.appendChild(button);

    if (habitat.front) {
      const front = el("div", "habitat-front-layer");
      front.innerHTML = habitat.front;
      box.appendChild(front);
    }
    plot.appendChild(box);
    field.appendChild(plot);

    on(button, "click", function () {
      resolveTap(item.id, button);
    });
  });
  parts.play.appendChild(field);
  buildCollectSlots(parts.collect, state.round.items.length);
  startFarmQuest();
}

function startFarmQuest() {
  const targetId = state.round.quest[state.stepIndex];
  const item = itemById(targetId);
  const bubble = dom.stage.querySelector(".ask-bubble-body");
  bubble.innerHTML = spriteMarkup(targetId, "ask-sprite");
  startQuest({
    targetId: targetId,
    announce: function () {
      audio.speak(item.label + ACTIVITY_META.farm.askSuffix, "ja-JP");
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
  const sprite = button.querySelector(".produce-sprite");
  const rotation = PRODUCE_ROTATION[item.id] || 0;
  const slotIndex = state.solved;
  const slot = dom.stage.querySelector('[data-collect="' + slotIndex + '"]');
  audio.play(item.habitat === "soil" ? "pull" : "pick");

  /* Buried roots rise out of the ridge first: that lift is the whole point. */
  animate(
    sprite,
    [
      { transform: "translateY(0) rotate(" + rotation + "deg)" },
      { transform: "translateY(" + -habitat.rise * 100 + "%) rotate(" + rotation + "deg) scale(1.06)" },
    ],
    { duration: motion(60, 320), easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "forwards" },
    function () {
      burst(button, item.habitat === "soil" ? "#a9764e" : "#68b665", 12);
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
    audio.speak(entry.speak + ACTIVITY_META.hiragana.askSuffix, "ja-JP");
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
  audio.speak("できたね", "ja-JP", { delay: 260 });
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
  if (activity !== "hiragana" && activity !== "alphabet") return 0;
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
  if (activity === "hiragana" || activity === "alphabet") {
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
    state.progress.curriculum = { hiragana: 0, alphabet: 0 };
    state.progress.curriculumSeed = { hiragana: 0, alphabet: 0 };
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
  if (dom.buildStamp) dom.buildStamp.textContent = "v6";
  window.__ponpokoBooted = true;
  document.documentElement.classList.add("app-ready");
}

boot();

/* Exposed only so the browser smoke test can drive the app deterministically. */
window.__ponpoko = {
  state: state,
  startMode: startMode,
  catalogs: { HIRAGANA: HIRAGANA, ALPHABET: ALPHABET, ANIMALS: ANIMALS, FARM_ITEMS: FARM_ITEMS },
};
