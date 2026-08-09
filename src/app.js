import {
  ACTIVITY_ORDER,
  ROUNDS_PER_ACTIVITY,
  advanceRound,
  clamp,
  createRound,
  dragProgress,
  getActivityOrder,
  loadSavedState,
} from "./game-core.js";

const STORAGE_KEYS = {
  settings: "ponpoko-adventure-settings-v3",
  progress: "ponpoko-adventure-progress-v3",
  legacySettings: "ponpoko-adventure-settings-v2",
  legacyProgress: "ponpoko-adventure-progress-v2",
};

const saved = loadSavedState(
  localStorage.getItem(STORAGE_KEYS.settings) ?? localStorage.getItem(STORAGE_KEYS.legacySettings),
  localStorage.getItem(STORAGE_KEYS.progress) ?? localStorage.getItem(STORAGE_KEYS.legacyProgress),
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
  animalStep: 0,
  busy: false,
  actorX: 0,
  audioContext: null,
  homePoseTimer: null,
  hintTimer: null,
  timers: new Set(),
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
  curtainObject: document.querySelector("#curtain-object"),
  curtainGesture: document.querySelector("#curtain-gesture"),
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
  fruit: {
    title: "くだもの かくれんぼ",
    className: "activity-fruit",
    objectClass: "cell-apple",
    gestureClass: "gesture-rub",
    actorPose: "basket",
  },
  vegetable: {
    title: "やさい すっぽん",
    className: "activity-vegetable",
    objectClass: "cell-carrot",
    gestureClass: "gesture-pull",
    actorPose: "wave",
  },
  animal: {
    title: "どうぶつ ぽんぽこパレード",
    className: "activity-animal",
    objectClass: "cell-dog",
    gestureClass: "gesture-trace",
    actorPose: "run",
  },
};

const FRUIT_POSITIONS = {
  2: [[29, 38], [71, 34]],
  3: [[17, 35], [50, 43], [83, 33]],
};

const VEGETABLE_POSITIONS = {
  2: [36, 70],
  3: [27, 55, 82],
};

const ANIMAL_PATHS = {
  garden: [[11, 57], [27, 42], [43, 53], [59, 39], [75, 51]],
  savanna: [[11, 52], [27, 45], [43, 55], [59, 41], [75, 50]],
  world: [[11, 58], [27, 49], [43, 39], [59, 51], [75, 40]],
};

function schedule(callback, delay) {
  const timer = window.setTimeout(() => {
    state.timers.delete(timer);
    callback();
  }, delay);
  state.timers.add(timer);
  return timer;
}

function clearTimers() {
  state.timers.forEach((timer) => clearTimeout(timer));
  state.timers.clear();
  hideHint();
}

function showScreen(name) {
  state.screen = name;
  elements.app.dataset.screen = name;
  elements.screens.forEach((screen) => screen.classList.toggle("is-active", screen.id === `${name}-screen`));
  window.scrollTo(0, 0);
}

function setPose(element, pose) {
  [...element.classList]
    .filter((className) => className.startsWith("pose-"))
    .forEach((className) => element.classList.remove(className));
  element.classList.add(`pose-${pose}`);
}

function setActorPose(pose) {
  setPose(elements.actor, pose);
  elements.actor.classList.toggle("is-jumping", pose === "jump");
}

function updateActorPosition() {
  elements.actor.style.setProperty("--actor-x", `${state.actorX}px`);
}

function getAnimalActorX(step = state.animalStep) {
  const actorWidth = elements.actor.getBoundingClientRect().width || Math.min(window.innerWidth * 0.38, 315);
  const safeLimit = Math.max(0, window.innerWidth / 2 - actorWidth / 2 - 8);
  const desired = window.innerWidth * (-0.36 + step * 0.14);
  return clamp(desired, -safeLimit, safeLimit);
}

function setActorHome(activity = state.activities[state.activityIndex]) {
  elements.actor.classList.remove("facing-left", "is-reaching");
  if (activity === "vegetable") state.actorX = -window.innerWidth * 0.31;
  else if (activity === "animal") state.actorX = getAnimalActorX(0);
  else state.actorX = 0;
  updateActorPosition();
  setActorPose(ACTIVITY_META[activity]?.actorPose || "wave");
}

function startHomeAnimation() {
  clearInterval(state.homePoseTimer);
  let jumping = false;
  state.homePoseTimer = window.setInterval(() => {
    if (state.screen !== "home" || state.settings.reduceMotion) return;
    jumping = !jumping;
    setPose(elements.homeTanuki, jumping ? "jump" : "wave");
  }, 1900);
}

function startSession() {
  clearTimers();
  clearInterval(state.homePoseTimer);
  ensureAudio();
  playSound("start");
  state.activities = getActivityOrder(state.settings.activity);
  state.activityIndex = 0;
  state.roundIndex = 0;
  state.busy = true;
  showScreen("game");
  updateJourneyProgress();
  beginActivity();
}

function beginActivity() {
  clearTimers();
  const activity = state.activities[state.activityIndex];
  const meta = ACTIVITY_META[activity];
  document.body.classList.remove(...ACTIVITY_ORDER.map((name) => `activity-${name}`));
  document.body.classList.add(meta.className);
  elements.curtainTitle.textContent = meta.title;
  elements.curtainObject.className = `curtain-object world-sprite ${meta.objectClass}`;
  elements.curtainGesture.className = `curtain-gesture ${meta.gestureClass}`;
  elements.curtain.hidden = false;
  elements.curtain.classList.remove("is-leaving");
  setActorHome(activity);
  playSound("whoosh");

  schedule(() => {
    elements.curtain.classList.add("is-leaving");
    schedule(() => {
      elements.curtain.hidden = true;
      renderRound();
    }, state.settings.reduceMotion ? 80 : 360);
  }, state.settings.reduceMotion ? 420 : 1450);
}

function renderRound() {
  clearTimers();
  clearActorInput();
  state.busy = false;
  state.collected = 0;
  state.animalStep = 0;
  const activity = state.activities[state.activityIndex];
  state.round = createRound(activity, state.roundIndex);
  elements.activityLayer.replaceChildren();
  elements.gestureHint.className = "gesture-hint";
  updateJourneyProgress();
  setActorHome(activity);

  if (activity === "fruit") renderFruitRound();
  else if (activity === "vegetable") renderVegetableRound();
  else renderAnimalRound();
}

function clearActorInput() {
  elements.actor.onpointerdown = null;
  elements.actor.onpointermove = null;
  elements.actor.onpointerup = null;
  elements.actor.onpointercancel = null;
  elements.actor.onkeydown = null;
  elements.actor.style.setProperty("--actor-drag", "0px");
}

function addRoundPips(container) {
  const pips = document.createElement("div");
  pips.className = "round-pips";
  pips.innerHTML = Array.from({ length: ROUNDS_PER_ACTIVITY }, (_, index) => `<i class="${index <= state.roundIndex ? "is-filled" : ""}"></i>`).join("");
  container.append(pips);
}

function setFruitRevealStyles(button, progress) {
  const normalized = clamp(progress, 0, 1);
  button.style.setProperty("--reveal", normalized.toFixed(3));
  button.style.setProperty("--spread", `${Math.round(normalized * 78)}px`);
  button.style.setProperty("--leaf-alpha", String(1 - normalized * 0.78));
}

function setPlantPullStyles(button, progress) {
  const normalized = clamp(progress, 0, 1.2);
  button.style.setProperty("--pull", normalized.toFixed(3));
  button.style.setProperty("--pull-y", `${Math.round(normalized * 112)}px`);
}

function renderFruitRound() {
  const layer = document.createElement("div");
  layer.className = "fruit-world";
  const orchard = document.createElement("div");
  orchard.className = "orchard-canopy";
  layer.append(orchard);
  addRoundPips(layer);

  const positions = FRUIT_POSITIONS[state.round.items.length];
  const spots = state.round.items.map((item, index) => {
    const button = document.createElement("button");
    const [left, top] = positions[index];
    button.type = "button";
    button.className = "fruit-hide";
    button.style.setProperty("--left", `${left}%`);
    button.style.setProperty("--top", `${top}%`);
    button.style.setProperty("--accent", item.accent);
    setFruitRevealStyles(button, 0);
    button.setAttribute("aria-label", `${item.label}を葉の中から見つける`);
    button.innerHTML = `
      <span class="hidden-fruit world-sprite cell-${item.id}" aria-hidden="true"></span>
      <span class="leaf-cluster" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <span class="fruit-spark" aria-hidden="true"></span>`;
    installFruitReveal(button, item);
    layer.append(button);
    return button;
  });

  elements.activityLayer.append(layer);
  showGestureHint(spots[0], "rub", { dx: 58, dy: 0 });
}

function installFruitReveal(button, item) {
  let activePointer = null;
  let lastX = 0;
  let lastY = 0;
  let travel = 0;
  let reveal = 0;
  let taps = 0;
  let particleDistance = 0;

  button.addEventListener("pointerdown", (event) => {
    if (state.busy || button.classList.contains("is-found") || activePointer !== null) return;
    activePointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    travel = 0;
    particleDistance = 0;
    button.setPointerCapture(event.pointerId);
    button.classList.add("is-rubbing");
    hideHint();
    playSound("touch");
  });

  button.addEventListener("pointermove", (event) => {
    if (activePointer !== event.pointerId || !button.hasPointerCapture(event.pointerId)) return;
    const distance = Math.hypot(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
    travel += distance;
    particleDistance += distance;
    reveal = clamp(reveal + distance / state.round.revealDistance, 0, 1);
    setFruitRevealStyles(button, reveal);
    if (particleDistance > 34) {
      particleDistance = 0;
      createLeafParticle(event.clientX, event.clientY);
      playSound("rustle");
    }
    if (reveal >= 1) discoverFruit(button, item);
  });

  const end = (event) => {
    if (activePointer !== event.pointerId) return;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    activePointer = null;
    button.classList.remove("is-rubbing");
    if (button.classList.contains("is-found")) return;
    if (travel < 12) {
      taps += 1;
      reveal = clamp(reveal + 0.52, 0, 1);
      setFruitRevealStyles(button, reveal);
      button.classList.add("is-tapped");
      schedule(() => button.classList.remove("is-tapped"), 300);
      playSound("rustle");
      if (taps >= 2 || reveal >= 1) discoverFruit(button, item);
    }
    if (!button.classList.contains("is-found")) schedule(() => showGestureHint(button, "rub", { dx: 58, dy: 0 }), 700);
  };

  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && !button.classList.contains("is-found")) discoverFruit(button, item);
  });
}

function discoverFruit(button, item) {
  if (state.busy || button.classList.contains("is-found")) return;
  state.busy = true;
  hideHint();
  button.classList.add("is-found");
  setFruitRevealStyles(button, 1);
  const fruit = button.querySelector(".hidden-fruit");
  setActorPose("reach");
  elements.actor.classList.add("is-reaching");
  playSound("reveal");
  burstAtElement(button, item.accent, 9, "leaf");

  schedule(() => {
    flyToActor(fruit, () => {
      state.collected += 1;
      playSound("catch", state.collected);
      elements.actor.classList.remove("is-reaching");
      setActorPose("basket");
      state.busy = false;
      if (state.collected >= state.round.items.length) completeRound();
      else {
        const next = [...document.querySelectorAll(".fruit-hide:not(.is-found)")][0];
        schedule(() => showGestureHint(next, "rub", { dx: 58, dy: 0 }), 850);
      }
    });
  }, state.settings.reduceMotion ? 80 : 330);
}

function renderVegetableRound() {
  const layer = document.createElement("div");
  layer.className = "vegetable-world";
  layer.innerHTML = `
    <div class="field-rows" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="harvest-cart" aria-hidden="true"><span class="cart-bin" id="cart-bin"></span><i></i><i></i></div>
    <div class="soil-front" aria-hidden="true"></div>`;
  addRoundPips(layer);
  const positions = VEGETABLE_POSITIONS[state.round.items.length];

  const plants = state.round.items.map((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `plant plant-${item.id}`;
    button.style.setProperty("--left", `${positions[index]}%`);
    setPlantPullStyles(button, 0);
    button.setAttribute("aria-label", `${item.label}を上に引き抜く`);
    button.innerHTML = `
      <span class="plant-sprite world-sprite cell-${item.id}" aria-hidden="true"></span>
      <span class="soil-crack" aria-hidden="true"></span>`;
    installVegetablePull(button, item);
    layer.append(button);
    return button;
  });

  elements.activityLayer.append(layer);
  showGestureHint(plants[0], "pull", { dx: 0, dy: -92 });
}

function installVegetablePull(button, item) {
  let activePointer = null;
  let startY = 0;
  let travel = 0;
  let tapCount = 0;
  let lastSoundProgress = 0;

  button.addEventListener("pointerdown", (event) => {
    if (state.busy || button.classList.contains("is-harvested") || activePointer !== null) return;
    activePointer = event.pointerId;
    startY = event.clientY;
    travel = 0;
    lastSoundProgress = 0;
    button.setPointerCapture(event.pointerId);
    button.classList.add("is-pulling");
    setActorPose("push");
    hideHint();
    playSound("grab");
  });

  button.addEventListener("pointermove", (event) => {
    if (activePointer !== event.pointerId || !button.hasPointerCapture(event.pointerId)) return;
    travel = Math.max(0, startY - event.clientY);
    const progress = dragProgress(travel, state.round.pullDistance * item.pull);
    setPlantPullStyles(button, progress);
    if (progress - lastSoundProgress > 0.22) {
      lastSoundProgress = progress;
      playSound("soil", Math.ceil(progress * 3));
      burstAtElement(button, "#9d683d", 2, "soil");
    }
    if (progress >= 0.96) harvestVegetable(button, item);
  });

  const end = (event) => {
    if (activePointer !== event.pointerId) return;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    activePointer = null;
    button.classList.remove("is-pulling");
    if (button.classList.contains("is-harvested")) return;
    if (travel < 12) tapCount += 1;
    if (tapCount >= 2) {
      harvestVegetable(button, item);
      return;
    }
    button.classList.add("is-returning");
    setPlantPullStyles(button, travel < 12 ? 0.5 : dragProgress(travel, state.round.pullDistance * item.pull));
    playSound("boop");
    schedule(() => {
      setPlantPullStyles(button, 0);
      schedule(() => button.classList.remove("is-returning"), 420);
    }, 30);
    setActorPose("wave");
    schedule(() => showGestureHint(button, "pull", { dx: 0, dy: -92 }), 650);
  };

  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && !button.classList.contains("is-harvested")) harvestVegetable(button, item);
  });
}

function harvestVegetable(button, item) {
  if (state.busy || button.classList.contains("is-harvested")) return;
  state.busy = true;
  hideHint();
  button.classList.add("is-harvested");
  setPlantPullStyles(button, 1.2);
  setActorPose("push");
  playSound("pop");
  burstAtElement(button, "#9d683d", 13, "soil");
  const sprite = button.querySelector(".plant-sprite");

  schedule(() => {
    const cart = document.querySelector(".harvest-cart");
    flyToElement(sprite, cart, () => {
      const badge = document.createElement("i");
      badge.className = `cart-produce world-sprite cell-${item.id}`;
      document.querySelector("#cart-bin")?.append(badge);
      button.style.visibility = "hidden";
      cart.classList.add("is-bouncing");
      schedule(() => cart.classList.remove("is-bouncing"), 420);
      state.collected += 1;
      state.busy = false;
      playSound("catch", state.collected);
      setActorPose("wave");
      if (state.collected >= state.round.items.length) completeRound();
      else {
        const next = [...document.querySelectorAll(".plant:not(.is-harvested)")][0];
        schedule(() => showGestureHint(next, "pull", { dx: 0, dy: -92 }), 850);
      }
    });
  }, state.settings.reduceMotion ? 90 : 420);
}

function renderAnimalRound() {
  const { animals, scene, stepCount } = state.round;
  const path = ANIMAL_PATHS[scene];
  const layer = document.createElement("div");
  layer.className = `animal-world animal-scene-${scene}`;
  layer.innerHTML = `
    <div class="animal-scene-detail" aria-hidden="true"></div>
    <div class="path-ribbon" aria-hidden="true"></div>
    <div class="parade-line" id="parade-line" aria-hidden="true"></div>`;
  addRoundPips(layer);

  for (let step = 1; step <= stepCount; step += 1) {
    const animal = animals[step - 1];
    const [left, top] = path[step];
    const footprint = document.createElement("button");
    footprint.type = "button";
    footprint.className = `trail-step animal-stop ${step === 1 ? "is-next" : ""}`;
    footprint.dataset.step = String(step);
    footprint.style.setProperty("--left", `${left}%`);
    footprint.style.setProperty("--top", `${top}%`);
    footprint.setAttribute("aria-label", `${animal.label}が待つ次の足あとへ進む`);
    footprint.innerHTML = `
      <span class="waiting-animal world-sprite cell-${animal.id}" aria-hidden="true"></span>
      <span class="waiting-leaves" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="paw-mark" aria-hidden="true"><i></i><i></i><b></b></span>`;
    footprint.addEventListener("click", () => {
      if (Number(footprint.dataset.step) === state.animalStep + 1) advanceAnimal();
      else gentleWiggle(footprint);
    });
    layer.append(footprint);
  }

  elements.activityLayer.append(layer);
  const firstStep = layer.querySelector('.trail-step[data-step="1"]');
  installAnimalTravel(elements.actor);
  showGestureHint(elements.actor, "trace", offsetBetween(elements.actor, firstStep));
}

function installAnimalTravel(traveler) {
  let activePointer = null;
  let startX = 0;
  let latestX = 0;
  let moved = false;

  traveler.onpointerdown = (event) => {
    if (state.busy || activePointer !== null) return;
    activePointer = event.pointerId;
    startX = event.clientX;
    latestX = event.clientX;
    moved = false;
    traveler.setPointerCapture(event.pointerId);
    traveler.classList.add("is-traveling");
    hideHint();
    setActorPose("run");
    playSound("touch");
  };

  traveler.onpointermove = (event) => {
    if (activePointer !== event.pointerId || !traveler.hasPointerCapture(event.pointerId)) return;
    latestX = event.clientX;
    const threshold = clamp(window.innerWidth * 0.1, 72, 122);
    const distance = Math.max(0, latestX - startX);
    moved ||= distance > 10;
    traveler.style.setProperty("--actor-drag", `${Math.min(distance, threshold) * 0.72}px`);
    if (distance >= threshold) {
      traveler.style.setProperty("--actor-drag", "0px");
      startX = latestX;
      advanceAnimal();
      if (state.busy || state.animalStep >= state.round.stepCount) {
        if (traveler.hasPointerCapture(event.pointerId)) traveler.releasePointerCapture(event.pointerId);
        activePointer = null;
      }
    }
  };

  const end = (event) => {
    if (activePointer !== event.pointerId) return;
    if (traveler.hasPointerCapture(event.pointerId)) traveler.releasePointerCapture(event.pointerId);
    activePointer = null;
    traveler.classList.remove("is-traveling");
    traveler.style.setProperty("--actor-drag", "0px");
    if (!moved && !state.busy) {
      gentleWiggle(traveler);
      const next = document.querySelector(`.trail-step[data-step="${state.animalStep + 1}"]`);
      schedule(() => showGestureHint(traveler, "trace", offsetBetween(traveler, next)), 450);
    }
  };

  traveler.onpointerup = end;
  traveler.onpointercancel = end;
  traveler.onkeydown = (event) => {
    if ((event.key === "Enter" || event.key === " ") && !state.busy) advanceAnimal();
  };
}

function advanceAnimal() {
  if (state.busy || state.animalStep >= state.round.stepCount) return;
  hideHint();
  state.animalStep += 1;
  const { animals, scene, stepCount } = state.round;
  const animal = animals[state.animalStep - 1];
  const reached = document.querySelector(`.trail-step[data-step="${state.animalStep}"]`);
  elements.actor.style.setProperty("--actor-drag", "0px");
  elements.actor.classList.add("is-stepping");
  schedule(() => elements.actor.classList.remove("is-stepping"), 430);
  reached?.classList.remove("is-next");
  reached?.classList.add("is-reached", "is-revealing");
  const next = document.querySelector(`.trail-step[data-step="${state.animalStep + 1}"]`);
  next?.classList.add("is-next");

  state.actorX = getAnimalActorX(state.animalStep);
  updateActorPosition();
  setActorPose("run");
  playSound("step", state.animalStep);
  if (reached) burstAtElement(reached, scene === "savanna" ? "#f0b84d" : "#75ba70", 10, "leaf");
  schedule(() => addParadeFriend(animal, reached), state.settings.reduceMotion ? 80 : 390);

  if (state.animalStep >= stepCount) {
    state.busy = true;
    schedule(() => finishAnimalParade(), state.settings.reduceMotion ? 320 : 1050);
  } else {
    schedule(() => {
      if (!state.busy) showGestureHint(elements.actor, "trace", offsetBetween(elements.actor, next));
    }, 1200);
  }
}

function addParadeFriend(animal, reached) {
  if (!reached) return;
  reached.classList.add("has-joined");
  const friend = document.createElement("i");
  friend.className = `parade-friend world-sprite cell-${animal.id}`;
  friend.setAttribute("aria-hidden", "true");
  document.querySelector("#parade-line")?.append(friend);
  playSound("reveal");
}

function finishAnimalParade() {
  document.querySelector(".animal-world")?.classList.add("is-parading");
  setActorPose("wave");
  playSound("home");
  const line = document.querySelector("#parade-line");
  if (line) burstAtElement(line, "#f3cf58", 16, "spark");
  schedule(() => completeRound(), state.settings.reduceMotion ? 260 : 900);
}

function completeRound() {
  if (elements.activityLayer.classList.contains("round-complete")) return;
  state.busy = true;
  hideHint();
  elements.activityLayer.classList.add("round-complete");
  setActorPose("jump");
  playSound("success");
  createCelebrationBurst();
  const next = advanceRound(state.activityIndex, state.roundIndex, state.activities.length);

  schedule(() => {
    elements.activityLayer.classList.remove("round-complete");
    if (next.sessionComplete) {
      finishSession();
      return;
    }
    state.activityIndex = next.activityIndex;
    state.roundIndex = next.roundIndex;
    if (next.activityComplete) beginActivity();
    else renderRound();
  }, state.settings.reduceMotion ? 560 : 1250);
}

function finishSession() {
  state.progress.sessions += 1;
  saveProgress();
  showScreen("finish");
  createFinishConfetti();
  playSound("finish");
}

function updateJourneyProgress() {
  const activeActivity = state.activities[state.activityIndex];
  const currentGlobalIndex = state.activityIndex * ROUNDS_PER_ACTIVITY + state.roundIndex;
  elements.progress.innerHTML = state.activities.map((activity, activityIndex) => {
    const icon = activity === "fruit" ? "apple" : activity === "vegetable" ? "carrot" : "dog";
    const activityStart = activityIndex * ROUNDS_PER_ACTIVITY;
    const isComplete = activityIndex < state.activityIndex;
    return `<span class="progress-theme ${activity === activeActivity ? "is-current" : ""} ${isComplete ? "is-complete" : ""}">
      <b class="world-sprite cell-${icon}" aria-hidden="true"></b>
      <em>${Array.from({ length: ROUNDS_PER_ACTIVITY }, (_, round) => `<i class="${activityStart + round < currentGlobalIndex || (activityIndex === state.activityIndex && round < state.roundIndex) ? "is-filled" : ""}"></i>`).join("")}</em>
    </span>`;
  }).join("");
}

function showGestureHint(target, mode, offset = { dx: 0, dy: 0 }) {
  if (!target || state.settings.reduceMotion || state.busy) return;
  hideHint();
  const rect = target.getBoundingClientRect();
  elements.gestureHint.className = `gesture-hint hint-${mode}`;
  elements.gestureHint.style.setProperty("--hint-x", `${rect.left + rect.width / 2}px`);
  elements.gestureHint.style.setProperty("--hint-y", `${rect.top + rect.height / 2}px`);
  elements.gestureHint.style.setProperty("--hint-dx", `${offset.dx || 0}px`);
  elements.gestureHint.style.setProperty("--hint-dy", `${offset.dy || 0}px`);
  state.hintTimer = schedule(() => {
    state.hintTimer = null;
    if (!state.busy) elements.gestureHint.classList.add("is-visible");
  }, 550);
}

function hideHint() {
  if (state.hintTimer !== null) {
    clearTimeout(state.hintTimer);
    state.timers.delete(state.hintTimer);
    state.hintTimer = null;
  }
  elements.gestureHint.classList.remove("is-visible");
}

function offsetBetween(source, target) {
  if (!source || !target) return { dx: 72, dy: 0 };
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return {
    dx: targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2),
    dy: targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2),
  };
}

function flyToActor(element, onFinish) {
  const actorRect = elements.actor.getBoundingClientRect();
  flyToPoint(element, actorRect.left + actorRect.width * 0.52, actorRect.top + actorRect.height * 0.66, onFinish);
}

function flyToElement(element, target, onFinish) {
  const rect = target.getBoundingClientRect();
  flyToPoint(element, rect.left + rect.width / 2, rect.top + rect.height * 0.38, onFinish);
}

function flyToPoint(element, targetX, targetY, onFinish) {
  const rect = element.getBoundingClientRect();
  const dx = targetX - (rect.left + rect.width / 2);
  const dy = targetY - (rect.top + rect.height / 2);
  element.style.zIndex = "80";
  const animation = element.animate([
    { transform: "translate(0, 0) rotate(0) scale(1)", opacity: 1, offset: 0 },
    { transform: `translate(${dx * 0.48}px, ${dy * 0.34 - 75}px) rotate(150deg) scale(0.92)`, opacity: 1, offset: 0.52 },
    { transform: `translate(${dx}px, ${dy}px) rotate(340deg) scale(0.24)`, opacity: 0, offset: 1 },
  ], {
    duration: state.settings.reduceMotion ? 120 : 620,
    easing: "cubic-bezier(.18,.76,.24,1)",
    fill: "forwards",
  });
  animation.addEventListener("finish", () => {
    element.style.visibility = "hidden";
    onFinish();
  }, { once: true });
}

function gentleWiggle(element) {
  element.classList.remove("is-wiggling");
  requestAnimationFrame(() => element.classList.add("is-wiggling"));
  schedule(() => element.classList.remove("is-wiggling"), 430);
  playSound("boop");
}

function createLeafParticle(x, y) {
  if (state.settings.reduceMotion) return;
  const particle = document.createElement("i");
  particle.className = "play-particle particle-leaf";
  particle.style.left = `${x}px`;
  particle.style.top = `${y}px`;
  particle.style.setProperty("--dx", `${-28 + Math.random() * 56}px`);
  particle.style.setProperty("--dy", `${20 + Math.random() * 50}px`);
  elements.particleLayer.append(particle);
  schedule(() => particle.remove(), 780);
}

function burstAtElement(element, color, amount, type = "spark") {
  if (state.settings.reduceMotion) return;
  const rect = element.getBoundingClientRect();
  for (let index = 0; index < amount; index += 1) {
    const angle = (Math.PI * 2 * index) / amount + Math.random() * 0.3;
    const distance = 34 + Math.random() * 65;
    const particle = document.createElement("i");
    particle.className = `play-particle particle-${type}`;
    particle.style.left = `${rect.left + rect.width / 2}px`;
    particle.style.top = `${rect.top + rect.height / 2}px`;
    particle.style.background = color;
    particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    elements.particleLayer.append(particle);
    schedule(() => particle.remove(), 900);
  }
}

function createCelebrationBurst() {
  const rect = elements.actor.getBoundingClientRect();
  const fakeTarget = { getBoundingClientRect: () => rect };
  burstAtElement(fakeTarget, "#f6c94f", state.settings.reduceMotion ? 0 : 18, "spark");
}

function createFinishConfetti() {
  elements.finishConfetti.replaceChildren();
  if (state.settings.reduceMotion) return;
  const colors = ["#ef6f61", "#f6c94f", "#65bde1", "#74b97a", "#9b70cf"];
  for (let index = 0; index < 42; index += 1) {
    const piece = document.createElement("i");
    piece.style.setProperty("--x", `${Math.random() * 100}vw`);
    piece.style.setProperty("--delay", `${Math.random() * 1.3}s`);
    piece.style.setProperty("--drift", `${-80 + Math.random() * 160}px`);
    piece.style.background = colors[index % colors.length];
    elements.finishConfetti.append(piece);
  }
}

function ensureAudio() {
  if (!state.settings.sound || state.audioContext) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  state.audioContext = new AudioContext();
}

function playTone(frequency, duration, options = {}) {
  if (!state.settings.sound) return;
  ensureAudio();
  const context = state.audioContext;
  if (!context) return;
  if (context.state === "suspended") context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = options.type || "sine";
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  if (options.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, context.currentTime + duration);
  gain.gain.setValueAtTime(options.volume || 0.045, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function playSound(kind, variant = 0) {
  const sounds = {
    start: () => { playTone(330, 0.12); schedule(() => playTone(520, 0.18), 90); },
    whoosh: () => playTone(190, 0.22, { endFrequency: 430, type: "triangle", volume: 0.025 }),
    touch: () => playTone(240, 0.07, { type: "triangle", volume: 0.025 }),
    rustle: () => playTone(120 + Math.random() * 40, 0.06, { type: "sawtooth", volume: 0.012 }),
    reveal: () => { playTone(410, 0.11); schedule(() => playTone(620, 0.16), 65); },
    catch: () => playTone(520 + variant * 80, 0.16, { type: "triangle" }),
    grab: () => playTone(170, 0.09, { type: "square", volume: 0.02 }),
    soil: () => playTone(115 + variant * 18, 0.07, { type: "triangle", volume: 0.018 }),
    pop: () => playTone(190, 0.24, { endFrequency: 720, type: "sine", volume: 0.055 }),
    step: () => playTone(260 + variant * 55, 0.1, { type: "triangle", volume: 0.035 }),
    home: () => { playTone(430, 0.14); schedule(() => playTone(650, 0.2), 90); },
    boop: () => playTone(165, 0.13, { type: "sine", volume: 0.025 }),
    success: () => [0, 85, 170].forEach((delay, index) => schedule(() => playTone([440, 570, 720][index], 0.2, { type: "triangle" }), delay)),
    finish: () => [0, 95, 190, 310].forEach((delay, index) => schedule(() => playTone([392, 523, 659, 784][index], 0.28, { type: "triangle", volume: 0.05 }), delay)),
  };
  sounds[kind]?.();
}

function returnHome() {
  clearTimers();
  state.busy = false;
  if (elements.parentDialog.open) elements.parentDialog.close();
  document.body.classList.remove(...ACTIVITY_ORDER.map((name) => `activity-${name}`));
  showScreen("home");
  setPose(elements.homeTanuki, "wave");
  startHomeAnimation();
}

function openParentDialog() {
  elements.parentGate.hidden = false;
  elements.parentSettings.hidden = true;
  elements.gateFeedback.textContent = "";
  elements.parentDialog.showModal();
}

function unlockParentSettings() {
  elements.parentGate.hidden = true;
  elements.parentSettings.hidden = false;
  elements.soundSetting.checked = state.settings.sound;
  elements.motionSetting.checked = state.settings.reduceMotion;
  elements.activitySettings.forEach((input) => { input.checked = input.value === state.settings.activity; });
  elements.sessionCount.textContent = `${state.progress.sessions}回`;
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(state.progress));
}

elements.startButton.addEventListener("click", startSession);
elements.replayButton.addEventListener("click", startSession);
elements.finishHomeButton.addEventListener("click", returnHome);
elements.gameHomeButton.addEventListener("click", returnHome);
elements.adultButtons.forEach((button) => button.addEventListener("click", openParentDialog));
elements.dialogClose.addEventListener("click", () => elements.parentDialog.close());
elements.parentDialog.addEventListener("click", (event) => {
  if (event.target === elements.parentDialog) elements.parentDialog.close();
});

elements.gateButtons.forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.gate === "5") {
    unlockParentSettings();
    playSound("touch");
  } else {
    elements.gateFeedback.textContent = "もう一度お試しください";
    gentleWiggle(button);
  }
}));

elements.soundSetting.addEventListener("change", () => {
  state.settings.sound = elements.soundSetting.checked;
  saveSettings();
  if (state.settings.sound) playSound("touch");
});

elements.motionSetting.addEventListener("change", () => {
  state.settings.reduceMotion = elements.motionSetting.checked;
  document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
  saveSettings();
});

elements.activitySettings.forEach((input) => input.addEventListener("change", () => {
  if (!input.checked) return;
  state.settings.activity = input.value;
  saveSettings();
}));

elements.resetButton.addEventListener("click", () => {
  state.progress.sessions = 0;
  saveProgress();
  elements.sessionCount.textContent = "0回";
  playSound("boop");
});

window.addEventListener("resize", () => {
  if (state.screen !== "game" || state.busy) return;
  const activity = state.activities[state.activityIndex];
  if (activity === "animal") {
    state.actorX = getAnimalActorX(state.animalStep);
    updateActorPosition();
  } else {
    setActorHome(activity);
  }
});

document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
startHomeAnimation();

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || sessionStorage.getItem("ponpoko-sw-v4-reloaded")) return;
    refreshing = true;
    sessionStorage.setItem("ponpoko-sw-v4-reloaded", "1");
    window.location.reload();
  });
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}
