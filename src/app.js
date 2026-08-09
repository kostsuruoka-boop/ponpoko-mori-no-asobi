import { SESSION_LENGTH, addCount, createRound, isCorrect, loadProgress } from "./game-core.js";

const STORAGE_KEYS = {
  settings: "ponpoko-settings-v1",
  progress: "ponpoko-progress-v1",
};

const defaultSettings = {
  sound: true,
  voice: true,
  reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

const state = {
  screen: "home",
  mode: "color",
  roundIndex: 0,
  currentRound: null,
  count: 0,
  locked: false,
  timer: null,
  audioContext: null,
  settings: loadJson(STORAGE_KEYS.settings, defaultSettings),
  progress: loadProgress(localStorage.getItem(STORAGE_KEYS.progress)),
};

const elements = {
  screens: [...document.querySelectorAll(".screen")],
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  homeButton: document.querySelector("#home-button"),
  finishHomeButton: document.querySelector("#finish-home-button"),
  playAgainButton: document.querySelector("#play-again-button"),
  repeatButton: document.querySelector("#repeat-button"),
  homeSoundButton: document.querySelector("#home-sound-button"),
  gamePrompt: document.querySelector("#game-prompt"),
  gameHelper: document.querySelector("#game-helper"),
  gameKicker: document.querySelector("#game-kicker"),
  playStage: document.querySelector("#play-stage"),
  roundProgress: document.querySelector("#round-progress"),
  feedback: document.querySelector("#feedback-pill"),
  burstLayer: document.querySelector("#burst-layer"),
  leafCount: document.querySelector("#leaf-count"),
  parentButton: document.querySelector("#parent-button"),
  parentDialog: document.querySelector("#parent-dialog"),
  dialogClose: document.querySelector("#dialog-close"),
  parentGate: document.querySelector("#parent-gate"),
  parentSettings: document.querySelector("#parent-settings"),
  gateFeedback: document.querySelector("#gate-feedback"),
  gateAnswers: [...document.querySelectorAll("[data-gate-answer]")],
  soundSetting: document.querySelector("#sound-setting"),
  voiceSetting: document.querySelector("#voice-setting"),
  motionSetting: document.querySelector("#motion-setting"),
  totalCorrect: document.querySelector("#total-correct"),
  resetButton: document.querySelector("#reset-button"),
};

function loadJson(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key)) };
  } catch {
    return { ...fallback };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  document.documentElement.classList.toggle("reduce-motion", state.settings.reduceMotion);
  syncSettingsUi();
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(state.progress));
  syncProgressUi();
}

function syncSettingsUi() {
  elements.soundSetting.checked = state.settings.sound;
  elements.voiceSetting.checked = state.settings.voice;
  elements.motionSetting.checked = state.settings.reduceMotion;
  elements.homeSoundButton.classList.toggle("is-muted", !state.settings.sound);
  elements.homeSoundButton.querySelector(".sound-icon").textContent = state.settings.sound ? "♪" : "×";
  elements.homeSoundButton.setAttribute("aria-label", state.settings.sound ? "音を切る" : "音をつける");
}

function syncProgressUi() {
  elements.leafCount.textContent = state.progress.leaves > 99 ? "99+" : String(state.progress.leaves);
  elements.totalCorrect.textContent = `${state.progress.totalCorrect} 回`;
}

function showScreen(name) {
  state.screen = name;
  elements.screens.forEach((screen) => screen.classList.toggle("is-active", screen.id === `${name}-screen`));
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);
}

function startMode(mode) {
  clearTimeout(state.timer);
  state.mode = mode;
  state.roundIndex = 0;
  state.locked = false;
  ensureAudio();
  tapSound();
  showScreen("game");
  renderRound();
}

function renderProgress() {
  elements.roundProgress.replaceChildren();
  for (let index = 0; index < SESSION_LENGTH; index += 1) {
    const dot = document.createElement("span");
    dot.className = "progress-dot";
    if (index < state.roundIndex) dot.classList.add("is-done");
    if (index === state.roundIndex) dot.classList.add("is-current");
    dot.setAttribute("aria-hidden", "true");
    elements.roundProgress.append(dot);
  }
  elements.roundProgress.setAttribute("aria-label", `${SESSION_LENGTH}もん中 ${state.roundIndex + 1}もん目`);
}

function renderRound() {
  state.locked = false;
  state.count = 0;
  state.currentRound = createRound(state.mode, state.roundIndex);
  elements.feedback.textContent = "";
  elements.feedback.className = "feedback-pill";
  elements.gamePrompt.textContent = state.currentRound.prompt;
  elements.gameHelper.textContent = state.currentRound.helper;
  elements.gameKicker.textContent = state.currentRound.mode === "count" ? "たぬきさん、おなかが ぺこぺこ" : "たぬきさんからの おねがい";
  renderProgress();

  if (state.currentRound.mode === "color") renderColorRound();
  if (state.currentRound.mode === "shape") renderShapeRound();
  if (state.currentRound.mode === "count") renderCountRound();

  window.setTimeout(() => speak(state.currentRound.prompt), 180);
}

function renderColorRound() {
  const round = state.currentRound;
  const target = document.createElement("div");
  target.className = "target-card color-target";
  target.innerHTML = `<span class="target-label">おなじ いろ</span><span class="target-swatch" style="--swatch:${round.target.value}; --swatch-dark:${round.target.dark}"></span>`;

  const choices = document.createElement("div");
  choices.className = "choice-row color-choices";
  round.options.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-button color-answer";
    button.dataset.answer = color.id;
    button.setAttribute("aria-label", `${color.label}のきのみ`);
    button.style.setProperty("--answer-color", color.value);
    button.style.setProperty("--answer-dark", color.dark);
    button.innerHTML = `<span class="berry" aria-hidden="true"><i></i></span><span>${color.label}</span>`;
    button.addEventListener("click", () => handleChoice(button, color.id));
    choices.append(button);
  });

  elements.playStage.replaceChildren(target, choices);
}

function renderShapeRound() {
  const round = state.currentRound;
  const target = document.createElement("div");
  target.className = "target-card shape-target";
  target.innerHTML = `<span class="target-label">おなじ かたち</span><span class="shape shape-${round.target.id} target-shape" aria-hidden="true"></span>`;

  const choices = document.createElement("div");
  choices.className = "choice-row shape-choices";
  round.options.forEach((shape) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-button shape-answer";
    button.dataset.answer = shape.id;
    button.setAttribute("aria-label", shape.label);
    button.innerHTML = `<span class="shape shape-${shape.id}" aria-hidden="true"></span><span>${shape.label}</span>`;
    button.addEventListener("click", () => handleChoice(button, shape.id));
    choices.append(button);
  });

  elements.playStage.replaceChildren(target, choices);
}

function renderCountRound() {
  const round = state.currentRound;
  const scene = document.createElement("div");
  scene.className = "count-scene";
  scene.innerHTML = `
    <div class="count-character" aria-hidden="true"></div>
    <div class="count-board">
      <span class="target-label">${round.target}こ ちょうだい</span>
      <div class="count-number">${round.target}</div>
      <div class="count-dots">${Array.from({ length: round.target }, () => "<i></i>").join("")}</div>
    </div>
    <div class="plate" aria-label="どんぐりのおさら"><div class="plate-acorns" id="plate-acorns"></div></div>
  `;

  const tray = document.createElement("div");
  tray.className = "acorn-tray";
  tray.setAttribute("aria-label", "どんぐりを選ぶ");
  for (let index = 0; index < 3; index += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "acorn-button";
    button.setAttribute("aria-label", "どんぐりをひとつあげる");
    button.innerHTML = `<span class="acorn" aria-hidden="true"><i></i></span>`;
    button.addEventListener("click", () => handleCount(button));
    tray.append(button);
  }

  elements.playStage.replaceChildren(scene, tray);
}

function handleChoice(button, answer) {
  if (state.locked) return;
  ensureAudio();
  if (isCorrect(state.currentRound, answer)) {
    button.classList.add("is-correct");
    completeRound("そう！ ぴったり！");
    return;
  }

  button.classList.remove("try-again");
  void button.offsetWidth;
  button.classList.add("try-again");
  elements.feedback.textContent = "もういっかい みてみよう";
  elements.feedback.className = "feedback-pill is-hint";
  softSound();
}

function handleCount(button) {
  if (state.locked || button.disabled) return;
  ensureAudio();
  button.disabled = true;
  button.classList.add("is-used");
  state.count = addCount(state.count, state.currentRound.target);

  const plateAcorns = document.querySelector("#plate-acorns");
  const acorn = document.createElement("span");
  acorn.className = "mini-acorn";
  acorn.setAttribute("aria-hidden", "true");
  plateAcorns.append(acorn);
  countSound(state.count);
  speak(String(state.count));

  elements.feedback.textContent = `${state.count}こ`;
  elements.feedback.className = "feedback-pill is-counting";
  if (isCorrect(state.currentRound, state.count)) {
    document.querySelectorAll(".acorn-button").forEach((acornButton) => {
      acornButton.disabled = true;
    });
    state.timer = window.setTimeout(() => completeRound("じょうずに かぞえたね！"), 360);
  }
}

function completeRound(message) {
  if (state.locked) return;
  state.locked = true;
  state.progress.totalCorrect += 1;
  state.progress.leaves += 1;
  saveProgress();
  elements.feedback.textContent = message;
  elements.feedback.className = "feedback-pill is-success";
  successSound();
  speak(message);
  createBurst();

  state.timer = window.setTimeout(() => {
    state.roundIndex += 1;
    if (state.roundIndex >= SESSION_LENGTH) finishSession();
    else renderRound();
  }, state.settings.reduceMotion ? 650 : 1250);
}

function finishSession() {
  showScreen("finish");
  finishSound();
  speak("できたね！ ぽんぽこ ぽーん！");
}

function returnHome() {
  clearTimeout(state.timer);
  state.locked = false;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  showScreen("home");
}

function ensureAudio() {
  if (!state.settings.sound) return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!state.audioContext) state.audioContext = new AudioContext();
  if (state.audioContext.state === "suspended") state.audioContext.resume();
  return state.audioContext;
}

function tone(frequency, start, duration, volume = 0.05, type = "sine") {
  const context = ensureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime + start);
  gain.gain.setValueAtTime(0.001, context.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(context.currentTime + start);
  oscillator.stop(context.currentTime + start + duration + 0.04);
}

function tapSound() {
  tone(420, 0, 0.08, 0.025, "sine");
}

function softSound() {
  tone(330, 0, 0.12, 0.025, "sine");
  tone(390, 0.09, 0.13, 0.02, "sine");
}

function countSound(count) {
  tone(360 + count * 75, 0, 0.18, 0.04, "sine");
}

function successSound() {
  [523, 659, 784].forEach((frequency, index) => tone(frequency, index * 0.1, 0.28, 0.05, "sine"));
}

function finishSound() {
  [392, 523, 659, 784].forEach((frequency, index) => tone(frequency, index * 0.12, 0.32, 0.055, "triangle"));
}

function speak(text) {
  if (!state.settings.voice || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replaceAll("？", ""));
  utterance.lang = "ja-JP";
  utterance.rate = 0.82;
  utterance.pitch = 1.12;
  utterance.volume = 0.92;
  const japaneseVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.startsWith("ja"));
  if (japaneseVoice) utterance.voice = japaneseVoice;
  window.speechSynthesis.speak(utterance);
}

function createBurst() {
  if (state.settings.reduceMotion) return;
  const symbols = ["●", "✦", "🍃", "✿", "★"];
  elements.burstLayer.replaceChildren();
  for (let index = 0; index < 18; index += 1) {
    const particle = document.createElement("span");
    particle.textContent = symbols[index % symbols.length];
    particle.style.setProperty("--x", `${Math.cos((Math.PI * 2 * index) / 18) * (120 + (index % 3) * 35)}px`);
    particle.style.setProperty("--y", `${Math.sin((Math.PI * 2 * index) / 18) * (90 + (index % 4) * 22)}px`);
    particle.style.setProperty("--delay", `${(index % 4) * 24}ms`);
    elements.burstLayer.append(particle);
  }
  window.setTimeout(() => elements.burstLayer.replaceChildren(), 1150);
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
  syncProgressUi();
}

elements.modeButtons.forEach((button) => button.addEventListener("click", () => startMode(button.dataset.mode)));
elements.homeButton.addEventListener("click", returnHome);
elements.finishHomeButton.addEventListener("click", returnHome);
elements.playAgainButton.addEventListener("click", () => startMode(state.mode));
elements.repeatButton.addEventListener("click", () => {
  tapSound();
  speak(state.currentRound?.prompt || "");
});
elements.homeSoundButton.addEventListener("click", () => {
  state.settings.sound = !state.settings.sound;
  saveSettings();
  if (state.settings.sound) tapSound();
});
elements.parentButton.addEventListener("click", openParentDialog);
elements.dialogClose.addEventListener("click", () => elements.parentDialog.close());
elements.parentDialog.addEventListener("click", (event) => {
  if (event.target === elements.parentDialog) elements.parentDialog.close();
});
elements.gateAnswers.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.gateAnswer === "4") unlockParentSettings();
    else elements.gateFeedback.textContent = "もう一度お試しください";
  });
});
elements.soundSetting.addEventListener("change", (event) => {
  state.settings.sound = event.target.checked;
  saveSettings();
  if (state.settings.sound) tapSound();
});
elements.voiceSetting.addEventListener("change", (event) => {
  state.settings.voice = event.target.checked;
  saveSettings();
});
elements.motionSetting.addEventListener("change", (event) => {
  state.settings.reduceMotion = event.target.checked;
  saveSettings();
});
elements.resetButton.addEventListener("click", () => {
  if (!window.confirm("遊んだ記録を0に戻しますか？")) return;
  state.progress = { totalCorrect: 0, leaves: 0 };
  saveProgress();
});

document.addEventListener("contextmenu", (event) => {
  if (event.target.closest("button")) event.preventDefault();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && "speechSynthesis" in window) window.speechSynthesis.cancel();
});

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}

saveSettings();
syncProgressUi();
showScreen("home");
