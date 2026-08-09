import {
  ROUNDS_PER_ACTIVITY,
  advanceRound,
  createRound,
  getActivityOrder,
  loadSavedState,
} from "./game-core.js";

const STORAGE_KEYS = {
  settings: "ponpoko-adventure-settings-v2",
  progress: "ponpoko-adventure-progress-v2",
};

const saved = loadSavedState(
  localStorage.getItem(STORAGE_KEYS.settings),
  localStorage.getItem(STORAGE_KEYS.progress),
  window.matchMedia("(prefers-reduced-motion: reduce)").matches,
);

const state = {
  screen: "home",
  settings: saved.settings,
  progress: saved.progress,
  activities: [],
  activityIndex: 0,
  roundIndex: 0,
  round: null,
  collected: 0,
  busy: false,
  timer: null,
  actorX: 0,
  audioContext: null,
  homePoseTimer: null,
};

const elements = {
  app: document.querySelector("#app"),
  screens: [...document.querySelectorAll(".screen")],
  startButton: document.querySelector("#start-button"),
  homeTanuki: document.querySelector("#home-tanuki"),
  adultButtons: [document.querySelector("#adult-button"), document.querySelector("#game-adult-button")],
  gameHomeButton: document.querySelector("#game-home-button"),
  activityLayer: document.querySelector("#activity-layer"),
  actor: document.querySelector("#tanuki-actor"),
  gestureHint: document.querySelector("#gesture-hint"),
  particleLayer: document.querySelector("#particle-layer"),
  progress: document.querySelector("#journey-progress"),
  curtain: document.querySelector("#activity-curtain"),
  curtainIcon: document.querySelector("#curtain-icon"),
  curtainTitle: document.querySelector("#curtain-title"),
  replayButton: document.querySelector("#replay-button"),
  finishHomeButton: document.querySelector("#finish-home-button"),
  finishConfetti: document.querySelector("#finish-confetti"),
  parentDialog: document.querySelector("#parent-dialog"),
  dialogClose: document.querySelector("#dialog-close"),
  parentGate: document.querySelector("#parent-gate"),
  parentSettings: document.querySelector("#parent-settings"),
  gateButtons: [...document.querySelectorAll("[data-gate]")],
  gateFeedback: document.querySelector("#gate-feedback"),
  soundSetting: document.querySelector("#sound-setting"),
  motionSetting: document.querySelector("#motion-setting"),
  activitySettings: [...document.querySelectorAll('input[name="activity"]')],
  sessionCount: document.querySelector("#session-count"),
  resetButton: document.querySelector("#reset-button"),
};

const ACTIVITY_META = {
  color: { title: "いろを あつめよう", icon: "●", className: "activity-color" },
  shape: { title: "かたちを はこぼう", icon: "◆", className: "activity-shape" },
  count: { title: "どんぐり ぽとん", icon: "♣", className: "activity-count" },
};

const COLOR_POSITIONS = [
  [14, 26], [37, 30], [63, 30], [86, 26], [18, 53], [82, 53],
];

const COUNT_POSITIONS = {
  1: [[20, 38]],
  2: [[16, 35], [74, 43]],
  3: [[13, 31], [47, 20], [79, 42]],
};

function showScreen(name) {
  state.screen = name;
  elements.app.dataset.screen = name;
  elements.screens.forEach((screen) => screen.classList.toggle("is-active", screen.id === `${name}-screen`));
  window.scrollTo(0, 0);
}

function setPose(element, pose) {
  [...element.classList].filter((className) => className.startsWith("pose-")).forEach((className) => element.classList.remove(className));
  element.classList.add(`pose-${pose}`);
}

function setActorPose(pose) {
  setPose(elements.actor, pose);
  elements.actor.classList.toggle("is-jumping", pose === "jump");
}

function setActorHome(activity = state.activities[state.activityIndex]) {
  elements.actor.classList.remove("facing-left", "is-reaching");
  state.actorX = activity === "shape" ? -window.innerWidth * 0.16 : 0;
  updateActorPosition();
  setActorPose(activity === "shape" ? "wave" : "basket");
}

function startHomeAnimation() {
  clearInterval(state.homePoseTimer);
  let jumping = false;
  state.homePoseTimer = window.setInterval(() => {
    if (state.screen !== "home" || state.settings.reduceMotion) return;
    jumping = !jumping;
    setPose(elements.homeTanuki, jumping ? "jump" : "wave");
  }, 1850);
}

function startSession() {
  clearTimeout(state.timer);
  clearInterval(state.homePoseTimer);
  ensureAudio();
  playSound("start");
  state.activities = getActivityOrder(state.settings.activity);
  state.activityIndex = 0;
  state.roundIndex = 0;
  state.actorX = 0;
  state.busy = false;
  showScreen("game");
  updateJourneyProgress();
  beginActivity();
}

function beginActivity() {
  const activity = state.activities[state.activityIndex];
  const meta = ACTIVITY_META[activity];
  document.body.classList.remove("activity-color", "activity-shape", "activity-count");
  document.body.classList.add(meta.className);
  elements.curtainIcon.textContent = meta.icon;
  elements.curtainTitle.textContent = meta.title;
  elements.curtain.hidden = false;
  elements.curtain.classList.remove("is-leaving");
  setActorPose("run");
  state.actorX = -window.innerWidth * 0.28;
  updateActorPosition();
  playSound("whoosh");

  requestAnimationFrame(() => {
    state.actorX = window.innerWidth * 0.25;
    updateActorPosition();
  });

  state.timer = window.setTimeout(() => {
    elements.curtain.classList.add("is-leaving");
    state.timer = window.setTimeout(() => {
      elements.curtain.hidden = true;
      state.actorX = 0;
      updateActorPosition();
      renderRound();
    }, state.settings.reduceMotion ? 80 : 430);
  }, state.settings.reduceMotion ? 320 : 1150);
}

function renderRound() {
  state.busy = false;
  state.collected = 0;
  const activity = state.activities[state.activityIndex];
  state.round = createRound(activity, state.roundIndex);
  elements.activityLayer.replaceChildren();
  elements.gestureHint.classList.remove("is-visible", "is-dragging");
  updateJourneyProgress();
  if (activity === "color") renderColorRound();
  if (activity === "shape") renderShapeRound();
  if (activity === "count") renderCountRound();
}

function updateJourneyProgress() {
  elements.progress.replaceChildren();
  state.activities.forEach((activity, index) => {
    const seed = document.createElement("span");
    seed.className = "journey-seed";
    if (index < state.activityIndex) seed.classList.add("is-grown");
    if (index === state.activityIndex && state.screen === "game") seed.classList.add("is-current");
    seed.innerHTML = `<i></i>`;
    seed.setAttribute("aria-hidden", "true");
    elements.progress.append(seed);
  });
  const current = Math.min(state.activityIndex + 1, Math.max(1, state.activities.length));
  elements.progress.setAttribute("aria-label", `${state.activities.length}つ中${current}つ目の遊び`);
}

function addRoundPips(container, completed = 0) {
  const pips = document.createElement("div");
  pips.className = "round-pips";
  for (let index = 0; index < ROUNDS_PER_ACTIVITY; index += 1) {
    const pip = document.createElement("i");
    if (index < completed) pip.classList.add("is-filled");
    pips.append(pip);
  }
  container.append(pips);
  return pips;
}

function renderColorRound() {
  setActorHome("color");
  const layer = document.createElement("div");
  layer.className = "color-world";

  const goal = document.createElement("div");
  goal.className = "color-goal";
  goal.style.setProperty("--target", state.round.target.value);
  goal.style.setProperty("--target-shadow", state.round.target.shadow);
  goal.innerHTML = `<span class="goal-color" aria-hidden="true"><i></i></span><div class="goal-slots">${Array.from({ length: 3 }, () => "<i></i>").join("")}</div>`;
  layer.append(goal);
  addRoundPips(layer, state.roundIndex);

  const targetButtons = [];
  state.round.items.forEach((item, index) => {
    const button = document.createElement("button");
    const [left, top] = COLOR_POSITIONS[index];
    button.type = "button";
    button.className = "berry-button";
    button.classList.toggle("is-match", item.isTarget);
    button.style.setProperty("--left", `${left}%`);
    button.style.setProperty("--top", `${top}%`);
    button.style.setProperty("--berry", item.color.value);
    button.style.setProperty("--berry-shadow", item.color.shadow);
    button.setAttribute("aria-label", item.isTarget ? "かごと同じ色の木の実" : "ちがう色の木の実");
    button.innerHTML = `<span class="berry-art" aria-hidden="true"><i></i></span>`;
    button.addEventListener("click", () => chooseBerry(button, item));
    layer.append(button);
    if (item.isTarget) targetButtons.push(button);
  });

  elements.activityLayer.append(layer);
  showTapHint(targetButtons[0]);
}

function chooseBerry(button, item) {
  hideHint();
  ensureAudio();
  if (button.disabled) return;
  if (!item.isTarget) {
    button.classList.remove("is-wiggling");
    void button.offsetWidth;
    button.classList.add("is-wiggling");
    document.querySelector(".color-goal")?.classList.add("is-calling");
    window.setTimeout(() => document.querySelector(".color-goal")?.classList.remove("is-calling"), 480);
    setActorPose("reach");
    playSound("boop");
    window.setTimeout(() => setActorPose("basket"), 420);
    return;
  }

  button.disabled = true;
  state.busy = true;
  const berryRect = button.getBoundingClientRect();
  elements.actor.classList.toggle("facing-left", berryRect.left + berryRect.width / 2 < window.innerWidth / 2);
  elements.actor.classList.add("is-reaching");
  setActorPose("reach");
  playSound("dash");
  window.setTimeout(() => {
    setActorPose("basket");
    flyToActor(button, () => {
      state.collected += 1;
      const slots = [...document.querySelectorAll(".goal-slots i")];
      slots[state.collected - 1]?.classList.add("is-filled");
      playSound("collect", state.collected);
      burstAtElement(button, item.color.value, 9);
      elements.actor.classList.remove("facing-left", "is-reaching");
      state.busy = false;
      if (state.collected >= state.round.targetCount) completeRound();
    });
  }, state.settings.reduceMotion ? 60 : 300);
}

function renderShapeRound() {
  setActorHome("shape");
  const layer = document.createElement("div");
  layer.className = "shape-world";

  const target = document.createElement("div");
  target.className = `shape-target shape-${state.round.target}`;
  target.dataset.shapeTarget = state.round.target;
  target.setAttribute("aria-label", `${state.round.target}の形の穴`);
  target.innerHTML = `<span></span>`;
  layer.append(target);
  addRoundPips(layer, state.roundIndex);

  const optionPositions = [18, 50, 82];
  let correctButton;
  state.round.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `shape-piece shape-${option.id}`;
    button.classList.toggle("is-match", option.isTarget);
    button.dataset.shape = option.id;
    button.dataset.originalLeft = String(optionPositions[index]);
    button.style.setProperty("--left", `${optionPositions[index]}%`);
    button.setAttribute("aria-label", `${option.id}の形を運ぶ`);
    button.innerHTML = `<span aria-hidden="true"></span>`;
    installShapeDrag(button, option.isTarget);
    layer.append(button);
    if (option.isTarget) correctButton = button;
  });

  elements.activityLayer.append(layer);
  showDragHint(correctButton, target);
}

function installShapeDrag(button, isTarget) {
  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let moved = false;

  button.addEventListener("pointerdown", (event) => {
    if (state.busy) return;
    hideHint();
    startX = event.clientX;
    startY = event.clientY;
    deltaX = 0;
    deltaY = 0;
    moved = false;
    button.setPointerCapture(event.pointerId);
    button.classList.add("is-held");
    setActorPose("push");
    playSound("pickup");
  });

  button.addEventListener("pointermove", (event) => {
    if (!button.hasPointerCapture(event.pointerId)) return;
    deltaX = event.clientX - startX;
    deltaY = event.clientY - startY;
    moved ||= Math.hypot(deltaX, deltaY) > 10;
    button.style.setProperty("--drag-x", `${deltaX}px`);
    button.style.setProperty("--drag-y", `${deltaY}px`);
  });

  button.addEventListener("pointerup", (event) => {
    if (!button.hasPointerCapture(event.pointerId)) return;
    button.releasePointerCapture(event.pointerId);
    button.classList.remove("is-held");
    const target = document.querySelector(".shape-target");
    const buttonRect = button.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const centerInside = buttonRect.left + buttonRect.width / 2 > targetRect.left
      && buttonRect.left + buttonRect.width / 2 < targetRect.right
      && buttonRect.top + buttonRect.height / 2 > targetRect.top
      && buttonRect.top + buttonRect.height / 2 < targetRect.bottom;
    if (isTarget && (!moved || centerInside)) {
      snapShapeIntoTarget(button, target);
    } else {
      returnShape(button, isTarget && moved);
    }
  });

  button.addEventListener("pointercancel", () => returnShape(button, false));
}

function snapShapeIntoTarget(button, target) {
  if (state.busy) return;
  state.busy = true;
  const buttonRect = button.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const currentX = Number.parseFloat(getComputedStyle(button).getPropertyValue("--drag-x")) || 0;
  const currentY = Number.parseFloat(getComputedStyle(button).getPropertyValue("--drag-y")) || 0;
  const targetX = currentX + targetRect.left + targetRect.width / 2 - (buttonRect.left + buttonRect.width / 2);
  const targetY = currentY + targetRect.top + targetRect.height / 2 - (buttonRect.top + buttonRect.height / 2);
  button.classList.add("is-snapping");
  button.style.setProperty("--drag-x", `${targetX}px`);
  button.style.setProperty("--drag-y", `${targetY}px`);
  setActorPose("push");
  playSound("slide");

  window.setTimeout(() => {
    button.classList.add("is-placed");
    target.classList.add("is-filled");
    setActorPose("jump");
    playSound("shapeDrop");
    burstAtElement(target, "#f6c744", 14);
    completeRound();
  }, state.settings.reduceMotion ? 80 : 500);
}

function returnShape(button, wasCorrectShape) {
  button.classList.add("is-returning");
  button.style.setProperty("--drag-x", "0px");
  button.style.setProperty("--drag-y", "0px");
  setActorPose(wasCorrectShape ? "reach" : "wave");
  playSound("boop");
  window.setTimeout(() => {
    button.classList.remove("is-returning");
    setActorHome("shape");
  }, 380);
}

function renderCountRound() {
  setActorHome("count");
  const layer = document.createElement("div");
  layer.className = "count-world";

  const slots = document.createElement("div");
  slots.className = "acorn-goal";
  slots.innerHTML = Array.from({ length: state.round.target }, () => `<i><span></span></i>`).join("");
  layer.append(slots);
  addRoundPips(layer, state.roundIndex);

  const buttons = [];
  state.round.items.forEach((item, index) => {
    const [left, top] = COUNT_POSITIONS[state.round.target][index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "acorn-piece";
    button.style.setProperty("--left", `${left}%`);
    button.style.setProperty("--top", `${top}%`);
    button.setAttribute("aria-label", "どんぐりをかごに入れる");
    button.innerHTML = `<span class="acorn-art" aria-hidden="true"><i></i></span>`;
    button.addEventListener("click", () => collectAcorn(button));
    layer.append(button);
    buttons.push(button);
  });

  elements.activityLayer.append(layer);
  showTapHint(buttons[0], true);
}

function collectAcorn(button) {
  if (state.busy || button.disabled) return;
  hideHint();
  ensureAudio();
  state.busy = true;
  button.disabled = true;
  const acornRect = button.getBoundingClientRect();
  elements.actor.classList.toggle("facing-left", acornRect.left + acornRect.width / 2 < window.innerWidth / 2);
  elements.actor.classList.add("is-reaching");
  setActorPose("reach");
  playSound("dash");
  window.setTimeout(() => {
    setActorPose("reach");
    const slots = [...document.querySelectorAll(".acorn-goal > i")];
    const slot = slots[state.collected];
    flyToElement(button, slot, () => {
      slot.classList.add("is-filled");
      state.collected += 1;
      playSound("count", state.collected);
      burstAtElement(slot, "#d89343", 8);
      state.busy = false;
      elements.actor.classList.remove("facing-left", "is-reaching");
      setActorPose("basket");
      if (state.collected >= state.round.target) completeRound();
    });
  }, state.settings.reduceMotion ? 60 : 290);
}

function completeRound() {
  state.busy = true;
  setActorPose("jump");
  playSound("success");
  createCelebrationBurst();
  const next = advanceRound(state.activityIndex, state.roundIndex, state.activities.length);
  state.timer = window.setTimeout(() => {
    if (next.sessionComplete) {
      finishSession();
      return;
    }
    state.activityIndex = next.activityIndex;
    state.roundIndex = next.roundIndex;
    if (next.activityComplete) {
      updateJourneyProgress();
      beginActivity();
    } else {
      renderRound();
    }
  }, state.settings.reduceMotion ? 480 : 1050);
}

function finishSession() {
  state.progress.sessions += 1;
  saveProgress();
  showScreen("finish");
  createFinishConfetti();
  playSound("finish");
}

function returnHome() {
  clearTimeout(state.timer);
  state.busy = false;
  elements.parentDialog.close();
  showScreen("home");
  setPose(elements.homeTanuki, "wave");
  startHomeAnimation();
}

function updateActorPosition() {
  elements.actor.style.setProperty("--actor-x", `${state.actorX}px`);
}

function flyToActor(element, onFinish) {
  const actorRect = elements.actor.getBoundingClientRect();
  flyToPoint(element, actorRect.left + actorRect.width * 0.51, actorRect.top + actorRect.height * 0.65, onFinish);
}

function flyToElement(element, target, onFinish) {
  const rect = target.getBoundingClientRect();
  flyToPoint(element, rect.left + rect.width / 2, rect.top + rect.height / 2, onFinish);
}

function flyToPoint(element, targetX, targetY, onFinish) {
  const rect = element.getBoundingClientRect();
  const dx = targetX - (rect.left + rect.width / 2);
  const dy = targetY - (rect.top + rect.height / 2);
  const animation = element.animate(
    [
      { transform: "translate(0, 0) rotate(0) scale(1)", opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.48}px, ${dy * 0.25 - 80}px) rotate(160deg) scale(0.8)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) rotate(360deg) scale(0.18)`, opacity: 0, offset: 1 },
    ],
    { duration: state.settings.reduceMotion ? 120 : 560, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" },
  );
  animation.addEventListener("finish", () => {
    element.style.visibility = "hidden";
    onFinish();
  }, { once: true });
}

function showTapHint(target, pointUp = false) {
  if (!target || state.settings.reduceMotion) return;
  const rect = target.getBoundingClientRect();
  elements.gestureHint.style.setProperty("--hint-x", `${rect.left + rect.width / 2}px`);
  elements.gestureHint.style.setProperty("--hint-y", `${rect.top + rect.height / 2}px`);
  elements.gestureHint.classList.toggle("points-up", pointUp);
  state.timer = window.setTimeout(() => elements.gestureHint.classList.add("is-visible"), 600);
}

function showDragHint(source, target) {
  if (!source || !target || state.settings.reduceMotion) return;
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  elements.gestureHint.style.setProperty("--hint-x", `${sourceRect.left + sourceRect.width / 2}px`);
  elements.gestureHint.style.setProperty("--hint-y", `${sourceRect.top + sourceRect.height / 2}px`);
  elements.gestureHint.style.setProperty("--hint-to-x", `${targetRect.left - sourceRect.left + (targetRect.width - sourceRect.width) / 2}px`);
  elements.gestureHint.style.setProperty("--hint-to-y", `${targetRect.top - sourceRect.top + (targetRect.height - sourceRect.height) / 2}px`);
  elements.gestureHint.classList.add("is-dragging");
  state.timer = window.setTimeout(() => elements.gestureHint.classList.add("is-visible"), 650);
}

function hideHint() {
  clearTimeout(state.timer);
  elements.gestureHint.classList.remove("is-visible", "is-dragging", "points-up");
}

function burstAtElement(element, color, amount) {
  if (state.settings.reduceMotion) return;
  const rect = element.getBoundingClientRect();
  for (let index = 0; index < amount; index += 1) {
    const particle = document.createElement("i");
    const angle = (Math.PI * 2 * index) / amount;
    particle.className = "pop-particle";
    particle.style.left = `${rect.left + rect.width / 2}px`;
    particle.style.top = `${rect.top + rect.height / 2}px`;
    particle.style.setProperty("--color", color);
    particle.style.setProperty("--px", `${Math.cos(angle) * (45 + (index % 3) * 20)}px`);
    particle.style.setProperty("--py", `${Math.sin(angle) * (45 + (index % 2) * 25)}px`);
    elements.particleLayer.append(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

function createCelebrationBurst() {
  const colors = ["#f36f63", "#f6c744", "#68b7df", "#6fb37d"];
  for (let index = 0; index < 22; index += 1) {
    const particle = document.createElement("i");
    const angle = (Math.PI * 2 * index) / 22;
    particle.className = "celebration-particle";
    particle.style.setProperty("--color", colors[index % colors.length]);
    particle.style.setProperty("--px", `${Math.cos(angle) * (120 + (index % 4) * 45)}px`);
    particle.style.setProperty("--py", `${Math.sin(angle) * (95 + (index % 3) * 35)}px`);
    elements.particleLayer.append(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

function createFinishConfetti() {
  elements.finishConfetti.replaceChildren();
  if (state.settings.reduceMotion) return;
  const colors = ["#f36f63", "#f6c744", "#68b7df", "#6fb37d", "#fff3d0"];
  for (let index = 0; index < 38; index += 1) {
    const item = document.createElement("i");
    item.style.left = `${(index * 29) % 100}%`;
    item.style.setProperty("--delay", `${(index % 12) * 80}ms`);
    item.style.setProperty("--drift", `${(index % 2 ? 1 : -1) * (20 + (index % 5) * 12)}px`);
    item.style.setProperty("--color", colors[index % colors.length]);
    elements.finishConfetti.append(item);
  }
}

function ensureAudio() {
  if (!state.settings.sound) return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!state.audioContext) state.audioContext = new AudioContext();
  if (state.audioContext.state === "suspended") state.audioContext.resume();
  return state.audioContext;
}

function tone(frequency, delay, duration, volume = 0.04, type = "sine", destination = null) {
  const context = ensureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime + delay);
  gain.gain.setValueAtTime(0.001, context.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + delay + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + delay + duration);
  oscillator.connect(gain).connect(destination || context.destination);
  oscillator.start(context.currentTime + delay);
  oscillator.stop(context.currentTime + delay + duration + 0.03);
}

function noise(delay = 0, duration = 0.12, volume = 0.02) {
  const context = ensureAudio();
  if (!context) return;
  const frames = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / frames);
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(volume, context.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + delay + duration);
  source.connect(gain).connect(context.destination);
  source.start(context.currentTime + delay);
}

function playSound(name, step = 1) {
  if (!state.settings.sound) return;
  if (name === "start") [330, 440, 554].forEach((frequency, index) => tone(frequency, index * 0.07, 0.18, 0.035, "sine"));
  if (name === "whoosh" || name === "dash") { noise(0, 0.16, 0.018); tone(240, 0, 0.13, 0.018, "triangle"); }
  if (name === "boop") { tone(280, 0, 0.12, 0.03, "sine"); tone(360, 0.08, 0.09, 0.018, "sine"); }
  if (name === "pickup") tone(410, 0, 0.1, 0.025, "triangle");
  if (name === "slide") { noise(0, 0.25, 0.012); tone(350, 0, 0.22, 0.018, "sine"); }
  if (name === "collect") { tone(480 + step * 70, 0, 0.18, 0.04, "sine"); tone(720 + step * 50, 0.08, 0.13, 0.025, "sine"); }
  if (name === "count") tone(420 + step * 110, 0, 0.22, 0.045, "sine");
  if (name === "shapeDrop") { tone(270, 0, 0.09, 0.04, "triangle"); tone(540, 0.08, 0.2, 0.04, "sine"); }
  if (name === "success") [523, 659, 784].forEach((frequency, index) => tone(frequency, index * 0.08, 0.25, 0.04, "sine"));
  if (name === "finish") [392, 523, 659, 784, 1046].forEach((frequency, index) => tone(frequency, index * 0.12, 0.34, 0.045, index % 2 ? "triangle" : "sine"));
}

function openParentDialog() {
  elements.parentGate.hidden = false;
  elements.parentSettings.hidden = true;
  elements.gateFeedback.textContent = "";
  syncSettingsUi();
  elements.parentDialog.showModal();
}

function unlockSettings() {
  elements.parentGate.hidden = true;
  elements.parentSettings.hidden = false;
  elements.sessionCount.textContent = `${state.progress.sessions}回`;
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  document.documentElement.classList.toggle("reduce-motion", state.settings.reduceMotion);
  syncSettingsUi();
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(state.progress));
  elements.sessionCount.textContent = `${state.progress.sessions}回`;
}

function syncSettingsUi() {
  elements.soundSetting.checked = state.settings.sound;
  elements.motionSetting.checked = state.settings.reduceMotion;
  elements.activitySettings.forEach((input) => { input.checked = input.value === state.settings.activity; });
  elements.sessionCount.textContent = `${state.progress.sessions}回`;
}

elements.startButton.addEventListener("click", startSession);
elements.replayButton.addEventListener("click", startSession);
elements.gameHomeButton.addEventListener("click", returnHome);
elements.finishHomeButton.addEventListener("click", returnHome);
elements.adultButtons.forEach((button) => button.addEventListener("click", openParentDialog));
elements.dialogClose.addEventListener("click", () => elements.parentDialog.close());
elements.parentDialog.addEventListener("click", (event) => { if (event.target === elements.parentDialog) elements.parentDialog.close(); });
elements.gateButtons.forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.gate === "5") unlockSettings();
  else elements.gateFeedback.textContent = "もう一度お試しください";
}));
elements.soundSetting.addEventListener("change", (event) => {
  state.settings.sound = event.target.checked;
  saveSettings();
  if (state.settings.sound) playSound("collect", 1);
});
elements.motionSetting.addEventListener("change", (event) => {
  state.settings.reduceMotion = event.target.checked;
  saveSettings();
});
elements.activitySettings.forEach((input) => input.addEventListener("change", (event) => {
  if (!event.target.checked) return;
  state.settings.activity = event.target.value;
  saveSettings();
}));
elements.resetButton.addEventListener("click", () => {
  if (!window.confirm("冒険の記録を0に戻しますか？")) return;
  state.progress.sessions = 0;
  saveProgress();
});

document.addEventListener("contextmenu", (event) => {
  if (event.target.closest("button")) event.preventDefault();
});
window.addEventListener("resize", () => { if (state.screen === "game") updateActorPosition(); });

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || sessionStorage.getItem("ponpoko-sw-v3-reloaded")) return;
    refreshing = true;
    sessionStorage.setItem("ponpoko-sw-v3-reloaded", "1");
    window.location.reload();
  });
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}

saveSettings();
saveProgress();
showScreen("home");
startHomeAnimation();
