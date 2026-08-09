import { AudioDirector } from "./audio.js";
import {
  ACTIVITY_ORDER,
  ROUNDS_PER_ACTIVITY,
  advanceRound,
  createRound,
  dragDistance,
  isPointInsideRect,
  loadSavedState,
  nextCurriculumIndex,
  normalizeActivity,
} from "./game-core.js";

const STORAGE_KEYS = {
  settings: "ponpoko-adventure-settings-v5",
  progress: "ponpoko-adventure-progress-v5",
  legacySettings: "ponpoko-adventure-settings-v3",
  legacyProgress: "ponpoko-adventure-progress-v3",
};

const saved = loadSavedState(
  localStorage.getItem(STORAGE_KEYS.settings) ?? localStorage.getItem(STORAGE_KEYS.legacySettings),
  localStorage.getItem(STORAGE_KEYS.progress) ?? localStorage.getItem(STORAGE_KEYS.legacyProgress),
  window.matchMedia("(prefers-reduced-motion: reduce)").matches,
);

const state = {
  screen: "home",
  activity: "farm",
  roundIndex: 0,
  round: null,
  completedCount: 0,
  literacyTargetIndex: 0,
  busy: false,
  settings: saved.settings,
  progress: saved.progress,
  sessionResults: [],
  lifecycle: 0,
  timers: new Set(),
  animations: new Set(),
  roundAbort: null,
  hintTimer: null,
};

const elements = {
  app: document.querySelector("#app"),
  screens: [...document.querySelectorAll(".screen")],
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  homeTanuki: document.querySelector("#home-tanuki"),
  adultButtons: [document.querySelector("#adult-button"), document.querySelector("#game-adult-button")],
  gameHomeButton: document.querySelector("#game-home-button"),
  activityLayer: document.querySelector("#activity-layer"),
  actor: document.querySelector("#tanuki-actor"),
  reaction: document.querySelector("#tanuki-reaction"),
  gestureHint: document.querySelector("#gesture-hint"),
  particleLayer: document.querySelector("#particle-layer"),
  modeIcon: document.querySelector("#mode-icon"),
  modeTitle: document.querySelector("#mode-title"),
  roundPips: document.querySelector("#round-pips"),
  curtain: document.querySelector("#activity-curtain"),
  curtainDemo: document.querySelector("#curtain-demo"),
  curtainTitle: document.querySelector("#curtain-title"),
  roundComplete: document.querySelector("#round-complete"),
  nextRoundButton: document.querySelector("#next-round-button"),
  replayButton: document.querySelector("#replay-button"),
  finishHomeButton: document.querySelector("#finish-home-button"),
  finishTitle: document.querySelector("#finish-title"),
  finishKicker: document.querySelector("#finish-kicker"),
  finishResults: document.querySelector("#finish-results"),
  finishConfetti: document.querySelector("#finish-confetti"),
  parentDialog: document.querySelector("#parent-dialog"),
  parentGate: document.querySelector("#parent-gate"),
  parentSettings: document.querySelector("#parent-settings"),
  dialogClose: document.querySelector("#dialog-close"),
  gateButtons: [...document.querySelectorAll("[data-gate]")],
  gateFeedback: document.querySelector("#gate-feedback"),
  effectsSetting: document.querySelector("#effects-setting"),
  voiceSetting: document.querySelector("#voice-setting"),
  motionSetting: document.querySelector("#motion-setting"),
  sessionCount: document.querySelector("#session-count"),
  resetButton: document.querySelector("#reset-button"),
};

const ACTIVITY_META = {
  farm: {
    title: "ぽんぽこ農園",
    icon: "🌱",
    actorPose: "basket",
    actorLeft: "89%",
    actorBottom: "0%",
    reactionLeft: "80%",
    reactionBottom: "34%",
    finishTitle: "たくさん とれたね！",
    finishKicker: "ぽんぽこ だいしゅうかく！",
  },
  animal: {
    title: "どうぶつ広場",
    icon: "🐾",
    actorPose: "wave",
    actorLeft: "89%",
    actorBottom: "0%",
    reactionLeft: "80%",
    reactionBottom: "34%",
    finishTitle: "みんな なかよし！",
    finishKicker: "どうぶつ だいしゅうごう！",
  },
  hiragana: {
    title: "ひらがな おとの森",
    icon: "あ",
    actorPose: "basket",
    actorLeft: "13%",
    actorBottom: "0%",
    reactionLeft: "22%",
    reactionBottom: "34%",
    finishTitle: "おとと もじが つながった！",
    finishKicker: "ひらがな ぽんぽこ！",
  },
  alphabet: {
    title: "ABC おとの森",
    icon: "A",
    actorPose: "basket",
    actorLeft: "13%",
    actorBottom: "0%",
    reactionLeft: "22%",
    reactionBottom: "34%",
    finishTitle: "ABCを みつけたね！",
    finishKicker: "ABC ぽんぽこ！",
  },
};

const TILE_COLORS = ["#ffe17e", "#aee2b0", "#a9d6ff"];
const audio = new AudioDirector(() => state.settings);

function showScreen(name) {
  state.screen = name;
  elements.app.dataset.screen = name;
  elements.screens.forEach((screen) => screen.classList.toggle("is-active", screen.id === `${name}-screen`));
  window.scrollTo(0, 0);
}

function clearRuntime() {
  state.lifecycle += 1;
  state.roundAbort?.abort();
  state.roundAbort = null;
  state.timers.forEach((timer) => clearTimeout(timer));
  state.timers.clear();
  state.animations.forEach((animation) => animation.cancel());
  state.animations.clear();
  state.hintTimer = null;
  elements.gestureHint.className = "gesture-hint";
  elements.gestureHint.removeAttribute("style");
  elements.particleLayer.replaceChildren();
  elements.roundComplete.hidden = true;
  elements.activityLayer.classList.remove("round-complete");
  audio.stop();
}

function schedule(callback, delay) {
  const lifecycle = state.lifecycle;
  const timer = window.setTimeout(() => {
    state.timers.delete(timer);
    if (lifecycle === state.lifecycle) callback();
  }, delay);
  state.timers.add(timer);
  return timer;
}

function animate(element, keyframes, options, onFinish) {
  const lifecycle = state.lifecycle;
  const animation = element.animate(keyframes, options);
  state.animations.add(animation);
  animation.finished.then(() => {
    state.animations.delete(animation);
    if (lifecycle === state.lifecycle) onFinish?.();
  }).catch(() => state.animations.delete(animation));
  return animation;
}

function setPose(element, pose) {
  [...element.classList].filter((className) => className.startsWith("pose-")).forEach((className) => element.classList.remove(className));
  element.classList.add(`pose-${pose}`);
}

function setActorForActivity() {
  const meta = ACTIVITY_META[state.activity];
  positionActor();
  elements.actor.style.setProperty("--actor-bottom", meta.actorBottom);
  elements.reaction.style.setProperty("--reaction-left", meta.reactionLeft);
  elements.reaction.style.setProperty("--reaction-bottom", meta.reactionBottom);
  elements.actor.classList.remove("is-reacting", "is-thinking");
  setPose(elements.actor, meta.actorPose);
}

function positionActor() {
  const requested = window.innerWidth * parseFloat(ACTIVITY_META[state.activity].actorLeft) / 100;
  const actorWidth = elements.actor.getBoundingClientRect().width || Math.min(window.innerWidth * .29, 285);
  const halfWidth = actorWidth / 2;
  const safeX = Math.min(Math.max(requested, halfWidth + 8), window.innerWidth - halfWidth - 8);
  elements.actor.style.setProperty("--actor-left", `${safeX}px`);
}

function setBodyActivity(activity) {
  document.body.classList.remove(...ACTIVITY_ORDER.map((name) => `activity-${name}`));
  if (activity) document.body.classList.add(`activity-${activity}`);
}

function startMode(requestedActivity) {
  clearRuntime();
  state.activity = normalizeActivity(requestedActivity);
  state.roundIndex = 0;
  state.sessionResults = [];
  state.busy = true;
  setBodyActivity(state.activity);
  setActorForActivity();
  updateHud();
  showScreen("game");
  audio.unlock();
  audio.play("open");
  showActivityIntro();
}

function showActivityIntro() {
  const meta = ACTIVITY_META[state.activity];
  elements.curtainTitle.textContent = meta.title;
  elements.curtainDemo.innerHTML = createIntroDemo(state.activity);
  elements.curtain.hidden = false;
  elements.curtain.classList.remove("is-leaving");
  schedule(() => {
    elements.curtain.classList.add("is-leaving");
    schedule(() => {
      elements.curtain.hidden = true;
      renderRound();
    }, state.settings.reduceMotion ? 60 : 320);
  }, state.settings.reduceMotion ? 360 : 1250);
}

function createIntroDemo(activity) {
  if (activity === "farm") return '<i class="demo-sprite world-sprite cell-apple"></i>';
  if (activity === "animal") return '<i class="demo-shadow world-sprite cell-dog"></i><i class="demo-sprite world-sprite cell-dog"></i>';
  const glyph = activity === "hiragana" ? "あ" : "A a";
  return `<span class="demo-letter">${glyph}</span><span class="demo-sound">♪</span>`;
}

function renderRound() {
  clearRuntime();
  state.roundAbort = new AbortController();
  state.busy = false;
  state.completedCount = 0;
  state.literacyTargetIndex = 0;
  const curriculumIndex = state.progress.curriculum[state.activity] || 0;
  state.round = createRound(state.activity, state.roundIndex, { curriculumIndex });
  elements.activityLayer.replaceChildren();
  setActorForActivity();
  updateHud();

  if (state.activity === "farm") renderFarmRound();
  else if (state.activity === "animal") renderAnimalRound();
  else renderLiteracyRound();
}

function updateHud() {
  const meta = ACTIVITY_META[state.activity];
  elements.modeIcon.textContent = meta.icon;
  elements.modeTitle.textContent = meta.title;
  elements.roundPips.innerHTML = Array.from({ length: ROUNDS_PER_ACTIVITY }, (_, index) => `<i class="${index <= state.roundIndex ? "is-filled" : ""}"></i>`).join("");
}

/* Farm: every item starts in an authored growing place and remains on the shelf. */
function renderFarmRound() {
  const world = document.createElement("div");
  world.className = `farm-world farm-scene-${state.round.scene}`;
  const scene = document.createElement("div");
  scene.className = "farm-scene";
  const shelf = document.createElement("div");
  shelf.id = "harvest-shelf";
  shelf.className = "harvest-shelf";
  shelf.setAttribute("aria-label", "収穫したものを並べる棚");
  shelf.innerHTML = state.round.items.map((item, index) => `<button type="button" class="harvest-slot" data-slot="${index}" aria-label="${item.label}の置き場所"></button>`).join("");

  state.round.items.forEach((item, index) => {
    const plot = document.createElement("div");
    plot.className = `farm-plot source-${item.source}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `farm-produce origin-${item.source}`;
    button.dataset.item = item.id;
    button.setAttribute("aria-label", `${item.label}を収穫する`);
    button.innerHTML = `<span class="produce-sprite world-sprite cell-${item.id}" aria-hidden="true"></span>`;
    installFarmDrag(button, item, index);
    plot.append(button);
    scene.append(plot);
  });

  world.append(scene, shelf);
  elements.activityLayer.append(world);
  const first = scene.querySelector(".farm-produce");
  const firstItem = state.round.items[0];
  if (firstItem.source === "root") showDirectionalHint(first, { dx: 0, dy: -75 });
  else showHintBetween(first, shelf);
}

function installFarmDrag(button, item, slotIndex) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let latestX = 0;
  let latestY = 0;
  let tapCount = 0;
  const signal = state.roundAbort.signal;

  button.addEventListener("pointerdown", (event) => {
    if (state.busy || pointerId !== null || button.classList.contains("is-harvested")) return;
    pointerId = event.pointerId;
    startX = latestX = event.clientX;
    startY = latestY = event.clientY;
    button.setPointerCapture(pointerId);
    button.classList.add("is-dragging", "is-lifting");
    button.style.setProperty("--drag-scale", "1.08");
    hideHint();
    setPose(elements.actor, "reach");
    audio.play(item.source === "root" ? "lift" : "touch");
  }, { signal });

  button.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || !button.hasPointerCapture(pointerId)) return;
    latestX = event.clientX;
    latestY = event.clientY;
    button.style.setProperty("--drag-x", `${latestX - startX}px`);
    button.style.setProperty("--drag-y", `${latestY - startY}px`);
  }, { signal });

  const finish = (event) => {
    if (event.pointerId !== pointerId) return;
    if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    const distance = dragDistance(startX, startY, latestX, latestY);
    const upwardPull = startY - latestY;
    const shelfRect = document.querySelector("#harvest-shelf")?.getBoundingClientRect();
    const reachedShelf = isPointInsideRect({ x: latestX, y: latestY }, shelfRect, 35);
    pointerId = null;
    button.classList.remove("is-dragging");

    const harvested = item.source === "root" ? upwardPull >= 34 || reachedShelf : distance >= 44 || reachedShelf;
    if (harvested) {
      harvestFarmItem(button, item, slotIndex);
      return;
    }
    if (distance < 12) tapCount += 1;
    if (tapCount >= 2) {
      harvestFarmItem(button, item, slotIndex);
      return;
    }
    button.classList.remove("is-lifting");
    resetDragStyle(button);
    setPose(elements.actor, ACTIVITY_META.farm.actorPose);
    audio.play("return");
    gentleWiggle(button);
    schedule(() => item.source === "root" ? showDirectionalHint(button, { dx: 0, dy: -75 }) : showHintBetween(button, document.querySelector("#harvest-shelf")), 520);
  };
  button.addEventListener("pointerup", finish, { signal });
  button.addEventListener("pointercancel", finish, { signal });
}

function harvestFarmItem(button, item, slotIndex) {
  if (state.busy || button.classList.contains("is-harvested")) return;
  state.busy = true;
  hideHint();
  button.classList.add("is-harvested", "is-lifting");
  resetDragStyle(button);
  setPose(elements.actor, "reach");
  audio.play(item.source === "root" ? "root" : "pluck");
  burstAt(button, item.source === "root" ? "#9d6b47" : "#67aa62", 10, item.source === "root" ? "soil" : "leaf");
  const slot = document.querySelector(`[data-slot="${slotIndex}"]`);

  flySprite(button.querySelector(".produce-sprite"), slot, `cell-${item.id}`, () => {
    slot.classList.add("is-filled");
    slot.innerHTML = `<i class="harvested-item world-sprite cell-${item.id}" aria-hidden="true"></i>`;
    state.completedCount += 1;
    state.sessionResults.push({ type: "sprite", id: item.id });
    audio.play("drop", state.completedCount);
    audio.speak(item.label, "ja-JP");
    reactTanuki("♥");
    state.busy = false;
    if (state.completedCount === state.round.items.length) {
      schedule(completeRound, state.settings.reduceMotion ? 180 : 850);
    } else {
      const next = document.querySelector(".farm-produce:not(.is-harvested)");
      const nextItem = state.round.items.find((candidate) => candidate.id === next?.dataset.item);
      schedule(() => nextItem?.source === "root" ? showDirectionalHint(next, { dx: 0, dy: -75 }) : showHintBetween(next, document.querySelector("#harvest-shelf")), 850);
    }
  });
}

/* Animals: drag freely, match in any order, and keep every match in the habitat. */
function renderAnimalRound() {
  const world = document.createElement("div");
  world.className = `animal-world animal-scene-${state.round.scene}`;
  world.innerHTML = '<div class="habitat-decoration" aria-hidden="true"></div><div class="animal-targets" id="animal-targets"></div><div class="animal-dock" id="animal-dock"></div>';
  const targets = world.querySelector("#animal-targets");
  const dock = world.querySelector("#animal-dock");

  state.round.targets.forEach((animal, index) => {
    const home = document.createElement("div");
    home.className = "animal-home";
    home.dataset.animal = animal.id;
    home.style.setProperty("--dance-index", String(index));
    home.setAttribute("aria-label", `${animal.label}の形`);
    home.innerHTML = `<i class="animal-shadow world-sprite cell-${animal.id}" aria-hidden="true"></i><i class="matched-animal world-sprite cell-${animal.id}" aria-hidden="true"></i>`;
    targets.append(home);
  });

  state.round.animals.forEach((animal) => {
    const token = document.createElement("button");
    token.type = "button";
    token.className = "animal-token";
    token.dataset.animal = animal.id;
    token.setAttribute("aria-label", `${animal.label}を同じ形へ運ぶ`);
    token.innerHTML = `<span class="animal-token-sprite world-sprite cell-${animal.id}" aria-hidden="true"></span>`;
    installAnimalDrag(token, animal);
    dock.append(token);
  });

  elements.activityLayer.append(world);
  const first = dock.querySelector(".animal-token");
  const target = targets.querySelector(`[data-animal="${first.dataset.animal}"]`);
  showHintBetween(first, target);
}

function installAnimalDrag(token, animal) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let latestX = 0;
  let latestY = 0;
  let tapCount = 0;
  const signal = state.roundAbort.signal;

  token.addEventListener("pointerdown", (event) => {
    if (state.busy || pointerId !== null || token.classList.contains("is-matched")) return;
    pointerId = event.pointerId;
    startX = latestX = event.clientX;
    startY = latestY = event.clientY;
    token.setPointerCapture(pointerId);
    token.classList.add("is-dragging");
    token.style.setProperty("--drag-scale", "1.12");
    hideHint();
    setPose(elements.actor, "reach");
    audio.play("animalLift");
    audio.speak(animal.label, "ja-JP");
  }, { signal });

  token.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || !token.hasPointerCapture(pointerId)) return;
    latestX = event.clientX;
    latestY = event.clientY;
    token.style.setProperty("--drag-x", `${latestX - startX}px`);
    token.style.setProperty("--drag-y", `${latestY - startY}px`);
  }, { signal });

  const finish = (event) => {
    if (event.pointerId !== pointerId) return;
    if (token.hasPointerCapture(pointerId)) token.releasePointerCapture(pointerId);
    pointerId = null;
    token.classList.remove("is-dragging");
    const targetUnderPointer = [...document.querySelectorAll(".animal-home:not(.is-matched)")].find((home) => isPointInsideRect({ x: latestX, y: latestY }, home.getBoundingClientRect(), 24));
    const distance = dragDistance(startX, startY, latestX, latestY);
    if (targetUnderPointer?.dataset.animal === animal.id) {
      matchAnimal(token, targetUnderPointer, animal);
      return;
    }
    if (distance < 12) tapCount += 1;
    if (tapCount >= 2) {
      matchAnimal(token, document.querySelector(`.animal-home[data-animal="${animal.id}"]`), animal);
      return;
    }
    resetDragStyle(token);
    setPose(elements.actor, ACTIVITY_META.animal.actorPose);
    audio.play("return");
    if (targetUnderPointer) gentleWiggle(targetUnderPointer);
    thinkTanuki();
    schedule(() => showHintBetween(token, document.querySelector(`.animal-home[data-animal="${animal.id}"]`)), 600);
  };
  token.addEventListener("pointerup", finish, { signal });
  token.addEventListener("pointercancel", finish, { signal });
}

function matchAnimal(token, home, animal) {
  if (!home || state.busy || token.classList.contains("is-matched")) return;
  state.busy = true;
  hideHint();
  resetDragStyle(token);
  token.classList.add("is-matched");
  home.classList.add("is-inviting");
  setPose(elements.actor, "reach");
  flySprite(token.querySelector(".animal-token-sprite"), home, `cell-${animal.id}`, () => {
    home.classList.remove("is-inviting");
    home.classList.add("is-matched");
    state.completedCount += 1;
    state.sessionResults.push({ type: "sprite", id: animal.id });
    audio.play("match");
    audio.speak(animal.label, "ja-JP");
    burstAt(home, "#f7d35b", 12, "spark");
    reactTanuki("♥");
    state.busy = false;
    if (state.completedCount === state.round.animals.length) {
      document.querySelector(".animal-world")?.classList.add("is-complete");
      schedule(completeRound, state.settings.reduceMotion ? 180 : 900);
    } else {
      const next = document.querySelector(".animal-token:not(.is-matched)");
      schedule(() => showHintBetween(next, document.querySelector(`.animal-home[data-animal="${next?.dataset.animal}"]`)), 900);
    }
  });
}

/* Literacy: hear a target, move its matching sound bubble to tanuki, keep the set. */
function renderLiteracyRound() {
  const world = document.createElement("div");
  world.className = "literacy-world";
  world.innerHTML = `
    <div class="sound-sparkles" aria-hidden="true"></div>
    <div class="sound-prompt" id="sound-prompt"><div class="prompt-glyph" id="prompt-glyph"></div><button class="prompt-speaker" id="prompt-speaker" type="button" aria-label="もう一度聞く">♪</button></div>
    <div class="sound-options" id="sound-options"></div>
    <div class="sound-nest is-ready" id="sound-nest" aria-label="たぬきへ文字を届ける場所"></div>
    <div class="letter-collection" id="letter-collection">${state.round.targets.map((_, index) => `<div class="letter-slot" data-letter-slot="${index}">●</div>`).join("")}</div>`;
  elements.activityLayer.append(world);
  world.querySelector("#prompt-speaker").addEventListener("click", () => speakCurrentTarget(true), { signal: state.roundAbort.signal });
  showLiteracyTarget();
}

function showLiteracyTarget() {
  const target = state.round.targets[state.literacyTargetIndex];
  const options = state.round.choices[target.id];
  document.querySelector("#prompt-glyph").innerHTML = formatGlyph(target);
  const optionsLayer = document.querySelector("#sound-options");
  optionsLayer.replaceChildren();

  options.forEach((choice, index) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "sound-tile";
    tile.dataset.letter = choice.id;
    tile.style.setProperty("--tile-color", TILE_COLORS[index % TILE_COLORS.length]);
    tile.setAttribute("aria-label", `${choice.label}の音`);
    tile.innerHTML = `<span class="tile-glyph">${formatGlyph(choice)}</span>`;
    installLetterDrag(tile, choice, target);
    optionsLayer.append(tile);
  });

  schedule(() => speakCurrentTarget(true), 350);
  const correct = optionsLayer.querySelector(`[data-letter="${target.id}"]`);
  schedule(() => showHintBetween(correct, document.querySelector("#sound-nest")), 700);
}

function formatGlyph(item) {
  return item.secondary ? `${item.glyph}<small>${item.secondary}</small>` : item.glyph;
}

function speakCurrentTarget(withEffect = false) {
  const target = state.round?.targets?.[state.literacyTargetIndex];
  if (!target) return;
  audio.speak(target.speak, target.lang);
  if (withEffect) {
    const speaker = document.querySelector("#prompt-speaker");
    speaker?.classList.remove("is-speaking");
    requestAnimationFrame(() => speaker?.classList.add("is-speaking"));
    schedule(() => speaker?.classList.remove("is-speaking"), 650);
  }
}

function installLetterDrag(tile, choice, target) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let latestX = 0;
  let latestY = 0;
  const signal = state.roundAbort.signal;

  tile.addEventListener("pointerdown", (event) => {
    if (state.busy || pointerId !== null) return;
    pointerId = event.pointerId;
    startX = latestX = event.clientX;
    startY = latestY = event.clientY;
    tile.setPointerCapture(pointerId);
    tile.classList.add("is-dragging");
    tile.style.setProperty("--drag-scale", "1.12");
    hideHint();
    setPose(elements.actor, "reach");
    audio.play("touch");
    audio.speak(choice.speak, choice.lang);
  }, { signal });

  tile.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || !tile.hasPointerCapture(pointerId)) return;
    latestX = event.clientX;
    latestY = event.clientY;
    tile.style.setProperty("--drag-x", `${latestX - startX}px`);
    tile.style.setProperty("--drag-y", `${latestY - startY}px`);
  }, { signal });

  const finish = (event) => {
    if (event.pointerId !== pointerId) return;
    if (tile.hasPointerCapture(pointerId)) tile.releasePointerCapture(pointerId);
    pointerId = null;
    tile.classList.remove("is-dragging");
    const nest = document.querySelector("#sound-nest");
    const atNest = isPointInsideRect({ x: latestX, y: latestY }, nest.getBoundingClientRect(), 30);
    const distance = dragDistance(startX, startY, latestX, latestY);
    if (atNest && choice.id === target.id) {
      collectLetter(tile, target);
      return;
    }
    if (choice.id === target.id && distance < 12) {
      collectLetter(tile, target);
      return;
    }
    resetDragStyle(tile);
    setPose(elements.actor, ACTIVITY_META[state.activity].actorPose);
    audio.play("return");
    if (atNest) {
      gentleWiggle(tile);
      thinkTanuki();
      schedule(() => speakCurrentTarget(true), 420);
    }
    schedule(() => showHintBetween(document.querySelector(`[data-letter="${target.id}"]`), nest), 650);
  };
  tile.addEventListener("pointerup", finish, { signal });
  tile.addEventListener("pointercancel", finish, { signal });
}

function collectLetter(tile, target) {
  if (state.busy || tile.classList.contains("is-used")) return;
  state.busy = true;
  hideHint();
  resetDragStyle(tile);
  tile.classList.add("is-used");
  const slot = document.querySelector(`[data-letter-slot="${state.literacyTargetIndex}"]`);
  const source = tile.querySelector(".tile-glyph");
  flyText(source, slot, formatGlyph(target), () => {
    slot.classList.add("is-filled");
    slot.innerHTML = formatGlyph(target);
    state.completedCount += 1;
    state.sessionResults.push({ type: "letter", glyph: target.glyph, secondary: target.secondary || "" });
    audio.play("word");
    audio.speak(target.speak, target.lang);
    burstAt(slot, state.activity === "hiragana" ? "#ef7465" : "#5a94d0", 12, "spark");
    reactTanuki("♪");
    schedule(() => {
      state.literacyTargetIndex += 1;
      if (state.literacyTargetIndex >= state.round.targets.length) {
        state.busy = false;
        completeRound();
      } else {
        state.busy = false;
        setPose(elements.actor, ACTIVITY_META[state.activity].actorPose);
        showLiteracyTarget();
      }
    }, state.settings.reduceMotion ? 180 : 900);
  });
}

function completeRound() {
  if (elements.activityLayer.classList.contains("round-complete")) return;
  state.busy = true;
  hideHint();
  elements.activityLayer.classList.add("round-complete");
  setPose(elements.actor, "jump");
  reactTanuki("★", true);
  audio.play("celebrate");
  createCelebrationBurst();
  const isLast = state.roundIndex + 1 >= ROUNDS_PER_ACTIVITY;
  elements.nextRoundButton.querySelector("strong").textContent = isLast ? "できた" : "つぎへ";
  schedule(() => { elements.roundComplete.hidden = false; }, state.settings.reduceMotion ? 70 : 420);
}

function advanceFromComplete() {
  const next = advanceRound(state.roundIndex);
  audio.play("next");
  if (next.complete) {
    finishSession();
    return;
  }
  state.roundIndex = next.roundIndex;
  renderRound();
}

function finishSession() {
  const activity = state.activity;
  const results = [...state.sessionResults];
  clearRuntime();
  state.activity = activity;
  state.sessionResults = results;
  state.progress.sessions += 1;
  state.progress.completed[activity] += 1;
  if (activity === "hiragana" || activity === "alphabet") {
    state.progress.curriculum[activity] = nextCurriculumIndex(activity, state.progress.curriculum[activity]);
  }
  saveProgress();
  renderFinish();
  showScreen("finish");
  audio.play("celebrate");
}

function renderFinish() {
  const meta = ACTIVITY_META[state.activity];
  elements.finishKicker.textContent = meta.finishKicker;
  elements.finishTitle.textContent = meta.finishTitle;
  const results = selectFinishResults(state.sessionResults);
  elements.finishResults.innerHTML = results.map((result, index) => {
    if (result.type === "sprite") return `<i class="finish-result world-sprite cell-${result.id}" style="--result-index:${index}"></i>`;
    return `<i class="finish-result letter-result" style="--result-index:${index}">${result.glyph}${result.secondary ? `<small>${result.secondary}</small>` : ""}</i>`;
  }).join("");
  createFinishConfetti();
}

function selectFinishResults(results) {
  if (results.length <= 6) return results;
  const step = (results.length - 1) / 5;
  return Array.from({ length: 6 }, (_, index) => results[Math.round(index * step)]);
}

function returnHome() {
  clearRuntime();
  state.busy = false;
  if (elements.parentDialog.open) elements.parentDialog.close();
  setBodyActivity(null);
  setPose(elements.homeTanuki, "wave");
  showScreen("home");
}

/* Shared motion and feedback */
function resetDragStyle(element) {
  element.style.setProperty("--drag-x", "0px");
  element.style.setProperty("--drag-y", "0px");
  element.style.setProperty("--drag-scale", "1");
}

function flySprite(source, target, cellClass, onFinish) {
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const clone = document.createElement("i");
  clone.className = `world-sprite ${cellClass}`;
  Object.assign(clone.style, {
    position: "fixed", zIndex: "165", pointerEvents: "none",
    left: `${sourceRect.left}px`, top: `${sourceRect.top}px`,
    width: `${sourceRect.width}px`, height: `${sourceRect.height}px`,
    filter: "drop-shadow(0 15px 10px rgba(55,55,34,.24))",
  });
  elements.particleLayer.append(clone);
  const dx = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
  const dy = targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2);
  animate(clone, [
    { transform: "translate(0,0) scale(1) rotate(0deg)" },
    { transform: `translate(${dx * .48}px,${dy * .35 - 45}px) scale(1.08) rotate(7deg)`, offset: .52 },
    { transform: `translate(${dx}px,${dy}px) scale(.52) rotate(-4deg)` },
  ], { duration: state.settings.reduceMotion ? 130 : 620, easing: "cubic-bezier(.18,.78,.24,1)", fill: "forwards" }, () => {
    clone.remove();
    onFinish?.();
  });
}

function flyText(source, target, html, onFinish) {
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const clone = document.createElement("i");
  clone.innerHTML = html;
  Object.assign(clone.style, {
    position: "fixed", zIndex: "165", pointerEvents: "none", display: "grid", placeItems: "center",
    left: `${sourceRect.left}px`, top: `${sourceRect.top}px`, width: `${sourceRect.width}px`, height: `${sourceRect.height}px`,
    fontSize: getComputedStyle(source).fontSize, fontWeight: "900", fontStyle: "normal",
  });
  elements.particleLayer.append(clone);
  const dx = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
  const dy = targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2);
  animate(clone, [
    { transform: "translate(0,0) scale(1) rotate(0deg)" },
    { transform: `translate(${dx * .45}px,${dy * .38 - 55}px) scale(1.15) rotate(-7deg)`, offset: .5 },
    { transform: `translate(${dx}px,${dy}px) scale(.55) rotate(4deg)` },
  ], { duration: state.settings.reduceMotion ? 130 : 620, easing: "cubic-bezier(.18,.78,.24,1)", fill: "forwards" }, () => {
    clone.remove();
    onFinish?.();
  });
}

function reactTanuki(symbol = "♥", holdPose = false) {
  elements.reaction.querySelector("span").textContent = symbol;
  elements.reaction.classList.remove("is-visible");
  elements.actor.classList.remove("is-reacting", "is-thinking");
  setPose(elements.actor, "jump");
  requestAnimationFrame(() => {
    elements.reaction.classList.add("is-visible");
    elements.actor.classList.add("is-reacting");
  });
  schedule(() => {
    elements.reaction.classList.remove("is-visible");
    elements.actor.classList.remove("is-reacting");
    if (!holdPose && !elements.activityLayer.classList.contains("round-complete")) setPose(elements.actor, ACTIVITY_META[state.activity].actorPose);
  }, 940);
}

function thinkTanuki() {
  elements.actor.classList.remove("is-thinking");
  setPose(elements.actor, "wave");
  requestAnimationFrame(() => elements.actor.classList.add("is-thinking"));
  schedule(() => elements.actor.classList.remove("is-thinking"), 520);
}

function gentleWiggle(element) {
  element?.classList.remove("is-wiggling");
  requestAnimationFrame(() => element?.classList.add("is-wiggling"));
  schedule(() => element?.classList.remove("is-wiggling"), 440);
}

function showHintBetween(source, target, delay = 480) {
  if (!source || !target || state.settings.reduceMotion || state.busy) return;
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  showDirectionalHint(source, {
    dx: targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2),
    dy: targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2),
  }, delay);
}

function showDirectionalHint(source, offset, delay = 480) {
  if (!source || state.settings.reduceMotion || state.busy) return;
  hideHint();
  const rect = source.getBoundingClientRect();
  elements.gestureHint.style.setProperty("--hint-x", `${rect.left + rect.width / 2}px`);
  elements.gestureHint.style.setProperty("--hint-y", `${rect.top + rect.height / 2}px`);
  elements.gestureHint.style.setProperty("--hint-dx", `${offset.dx}px`);
  elements.gestureHint.style.setProperty("--hint-dy", `${offset.dy}px`);
  state.hintTimer = schedule(() => {
    state.hintTimer = null;
    if (!state.busy) elements.gestureHint.classList.add("is-visible");
  }, delay);
}

function hideHint() {
  if (state.hintTimer !== null) {
    clearTimeout(state.hintTimer);
    state.timers.delete(state.hintTimer);
    state.hintTimer = null;
  }
  elements.gestureHint.classList.remove("is-visible");
}

function burstAt(element, color, amount, type = "spark") {
  if (state.settings.reduceMotion || !element) return;
  const rect = element.getBoundingClientRect();
  for (let index = 0; index < amount; index += 1) {
    const angle = Math.PI * 2 * index / amount + Math.random() * .3;
    const distance = 35 + Math.random() * 62;
    const particle = document.createElement("i");
    particle.className = `play-particle particle-${type}`;
    particle.style.left = `${rect.left + rect.width / 2}px`;
    particle.style.top = `${rect.top + rect.height / 2}px`;
    particle.style.background = color;
    particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    elements.particleLayer.append(particle);
    schedule(() => particle.remove(), 850);
  }
}

function createCelebrationBurst() {
  burstAt(elements.actor, "#f7d35b", state.settings.reduceMotion ? 0 : 20, "spark");
}

function createFinishConfetti() {
  elements.finishConfetti.replaceChildren();
  if (state.settings.reduceMotion) return;
  const colors = ["#ef7065", "#f6cc4f", "#65bde1", "#74b97a", "#9b70cf"];
  for (let index = 0; index < 38; index += 1) {
    const piece = document.createElement("i");
    piece.style.setProperty("--x", `${Math.random() * 100}vw`);
    piece.style.setProperty("--delay", `${Math.random() * 1.25}s`);
    piece.style.setProperty("--drift", `${-75 + Math.random() * 150}px`);
    piece.style.background = colors[index % colors.length];
    elements.finishConfetti.append(piece);
  }
}

/* Parent controls and persistence */
function openParentDialog() {
  window.speechSynthesis?.cancel();
  elements.parentGate.hidden = false;
  elements.parentSettings.hidden = true;
  elements.gateFeedback.textContent = "";
  elements.parentDialog.showModal();
}

function unlockParentSettings() {
  elements.parentGate.hidden = true;
  elements.parentSettings.hidden = false;
  elements.effectsSetting.checked = state.settings.effects;
  elements.voiceSetting.checked = state.settings.voice;
  elements.motionSetting.checked = state.settings.reduceMotion;
  elements.sessionCount.textContent = `${state.progress.sessions}回`;
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(state.progress));
}

elements.modeButtons.forEach((button) => button.addEventListener("click", () => startMode(button.dataset.mode)));
elements.nextRoundButton.addEventListener("click", advanceFromComplete);
elements.replayButton.addEventListener("click", () => startMode(state.activity));
elements.finishHomeButton.addEventListener("click", returnHome);
elements.gameHomeButton.addEventListener("click", returnHome);
elements.adultButtons.forEach((button) => button.addEventListener("click", openParentDialog));
elements.dialogClose.addEventListener("click", () => elements.parentDialog.close());
elements.parentDialog.addEventListener("click", (event) => { if (event.target === elements.parentDialog) elements.parentDialog.close(); });
elements.gateButtons.forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.gate === "5") unlockParentSettings();
  else {
    elements.gateFeedback.textContent = "もう一度お試しください";
    gentleWiggle(button);
  }
}));
elements.effectsSetting.addEventListener("change", () => {
  state.settings.effects = elements.effectsSetting.checked;
  saveSettings();
  if (state.settings.effects) audio.play("touch");
});
elements.voiceSetting.addEventListener("change", () => {
  state.settings.voice = elements.voiceSetting.checked;
  saveSettings();
  if (state.settings.voice) audio.speak("こんにちは", "ja-JP");
});
elements.motionSetting.addEventListener("change", () => {
  state.settings.reduceMotion = elements.motionSetting.checked;
  document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
  saveSettings();
});
elements.resetButton.addEventListener("click", () => {
  state.progress.sessions = 0;
  state.progress.completed = Object.fromEntries(ACTIVITY_ORDER.map((activity) => [activity, 0]));
  state.progress.curriculum = { hiragana: 0, alphabet: 0 };
  saveProgress();
  elements.sessionCount.textContent = "0回";
  audio.play("return");
});
window.addEventListener("resize", () => {
  if (state.screen === "game") positionActor();
});

document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || sessionStorage.getItem("ponpoko-sw-v5-reloaded")) return;
    refreshing = true;
    sessionStorage.setItem("ponpoko-sw-v5-reloaded", "1");
    window.location.reload();
  });
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}
