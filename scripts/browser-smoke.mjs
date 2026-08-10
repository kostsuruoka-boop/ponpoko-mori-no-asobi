/*
 * Browser smoke test.
 *
 * Drives a real Chrome over the DevTools protocol and plays every mode to the
 * end, using each mode's real gesture — a tap where things are chosen, a drag
 * where things are pulled off a plant. Then it checks what a unit test cannot
 * see: console errors, layout overflow, tap target sizes, that guidance points
 * at the required element and mimes the right gesture, and that a wrong choice
 * never blocks progress.
 *
 *   npm run build
 *   python3 -m http.server 4173 -d dist &
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --headless=new --remote-debugging-port=9250 \
 *     --user-data-dir=/tmp/ponpoko-profile --window-size=1194,834 \
 *     http://127.0.0.1:4173/index.html &
 *   node scripts/browser-smoke.mjs [port] [label]
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";

const port = process.argv[2] || "9250";
const label = process.argv[3] || "landscape";
const shotDirectory = "tmp/ui-check";

const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
const page = targets.find((entry) => entry.type === "page" && entry.url.startsWith("http"));
if (!page) throw new Error("No page target found");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
const consoleErrors = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    consoleErrors.push(details.exception?.description || details.text);
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    consoleErrors.push(message.params.entry.text);
  }
  if (!message.id || !pending.has(message.id)) return;
  const handlers = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(message.error.message));
  else handlers.resolve(message.result);
});

function command(method, params = {}) {
  commandId += 1;
  socket.send(JSON.stringify({ id: commandId, method, params }));
  return new Promise((resolve, reject) => pending.set(commandId, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function shot(name) {
  await mkdir(shotDirectory, { recursive: true });
  const result = await command("Page.captureScreenshot", { format: "png" });
  await writeFile(`${shotDirectory}/${label}-${name}.png`, Buffer.from(result.data, "base64"));
}

async function rect(selector) {
  const box = await evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
  if (!box) throw new Error(`Missing element: ${selector}`);
  return box;
}

async function tap(selector) {
  const box = await rect(selector);
  if (box.w < 1 || box.h < 1) throw new Error(`Zero-size target: ${selector}`);
  await command("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
}

async function waitUntil(expression, description, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await wait(90);
  }
  throw new Error(`Timed out: ${description}`);
}

const TAP_SELECTOR = {
  farm: (id) => `.produce[data-item="${id}"]`,
  animal: (id) => `.choice-card[data-animal="${id}"]`,
  hiragana: (id) => `.letter-cell[data-letter="${id}"]`,
  alphabet: (id) => `.letter-cell[data-letter="${id}"]`,
  "hiragana-field": (id) => `.letter-crop[data-item="${id}"]`,
  "alphabet-field": (id) => `.letter-crop[data-item="${id}"]`,
};

const ACTIVITIES = ["farm", "animal", "hiragana", "alphabet", "hiragana-field", "alphabet-field"];

/* Modes where taking something means dragging it off its plant. */
const PULL_ACTIVITIES = ["farm", "hiragana-field", "alphabet-field"];

const CHOICE_SELECTOR = {
  farm: ".produce",
  animal: ".choice-card",
  hiragana: ".letter-cell",
  alphabet: ".letter-cell",
  "hiragana-field": ".letter-crop",
  "alphabet-field": ".letter-crop",
};

const CHOICE_ATTRIBUTE = {
  farm: "data-item",
  animal: "data-animal",
  hiragana: "data-letter",
  alphabet: "data-letter",
  "hiragana-field": "data-item",
  "alphabet-field": "data-item",
};

/*
 * Drag the element in the direction its own `data-pull` says it comes off in.
 * Reading the direction from the DOM rather than hard-coding it means the test
 * fails if guidance and geometry ever disagree.
 */
async function pull(selector) {
  const info = await evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, pull: node.getAttribute("data-pull") };
  })()`);
  if (!info) throw new Error(`Missing pull target: ${selector}`);
  if (!info.pull) throw new Error(`${selector} has no pull direction`);
  const sign = info.pull === "down" ? 1 : -1;
  const steps = 6;
  const distance = 64;
  await command("Input.dispatchMouseEvent", { type: "mousePressed", x: info.x, y: info.y, button: "left", clickCount: 1 });
  for (let step = 1; step <= steps; step += 1) {
    await command("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: info.x,
      y: info.y + (sign * distance * step) / steps,
      button: "left",
      buttons: 1,
    });
    await wait(16);
  }
  await command("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: info.x,
    y: info.y + sign * distance,
    button: "left",
    clickCount: 1,
  });
}

/* Take one thing, using whichever gesture that mode actually requires. */
async function take(activity, id) {
  const selector = TAP_SELECTOR[activity](id);
  if (PULL_ACTIVITIES.indexOf(activity) >= 0) await pull(selector);
  else await tap(selector);
}

async function currentTarget(stepIndex) {
  const stepCheck = stepIndex === undefined ? "" : ` && window.__ponpoko.state.stepIndex === ${stepIndex}`;
  await waitUntil(
    `!!(window.__ponpoko.state.quest) && !window.__ponpoko.state.busy${stepCheck}`,
    `a quest to be ready${stepIndex === undefined ? "" : ` for step ${stepIndex}`}`,
  );
  /* A free board has no requested target; take whatever is still growing. */
  return evaluate(`(() => {
    const quest = window.__ponpoko.state.quest;
    if (!quest.free) return quest.targetId;
    const node = quest.findTarget();
    return node ? node.getAttribute("data-item") : null;
  })()`);
}

/*
 * Two thresholds on purpose. What the child is asked to hit must be generous;
 * the home and settings buttons in the corners are adult controls and are
 * deliberately smaller so they are harder to trigger by accident.
 */
const PLAY_TARGET_MINIMUM = 72;
const SHELL_TARGET_MINIMUM = 52;

async function smallestSide(selector) {
  return evaluate(`(() => {
    const nodes = document.querySelectorAll(${JSON.stringify(selector)});
    let min = Infinity;
    let name = "";
    nodes.forEach((node) => {
      const r = node.getBoundingClientRect();
      const side = Math.min(r.width, r.height);
      if (side > 0 && side < min) { min = side; name = node.className; }
    });
    return { min: min === Infinity ? 0 : min, name, count: nodes.length };
  })()`);
}

async function checkTapTargets(activity) {
  const play = await smallestSide(
    ".produce, .letter-crop, .choice-card, .letter-cell, .ask-bubble, .next-round-button",
  );
  if (!play.count) throw new Error(`${activity}: no tappable play targets found`);
  if (play.min < PLAY_TARGET_MINIMUM) {
    throw new Error(`${activity}: play target too small (${Math.round(play.min)}px, ${play.name})`);
  }
  const shell = await smallestSide(".icon-button");
  if (shell.min < SHELL_TARGET_MINIMUM) {
    throw new Error(`${activity}: shell button too small (${Math.round(shell.min)}px)`);
  }
  return play.min;
}

async function checkNoOverflow(where) {
  const view = await evaluate(
    "({ w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight })",
  );
  if (view.sw > view.w + 1 || view.sh > view.h + 1) {
    throw new Error(`${where}: page overflows ${JSON.stringify(view)}`);
  }
}

/* The escalating hint must end up pointing at the element that must be tapped. */
async function checkGuidancePointsAtTarget(activity) {
  const targetId = await currentTarget();
  const selector = TAP_SELECTOR[activity](targetId);
  const pulls = PULL_ACTIVITIES.indexOf(activity) >= 0;
  await evaluate(`(() => {
    const quest = window.__ponpoko.state.quest;
    quest.lastInteraction = Date.now() - 20000;
  })()`);
  await waitUntil(
    `document.querySelector("#tap-hand").classList.contains("is-visible")`,
    `${activity}: pointing hand to appear`,
  );
  const agreement = await evaluate(`(() => {
    const hand = document.querySelector("#tap-hand").getBoundingClientRect();
    const target = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    const hx = hand.left + hand.width / 2;
    const hy = hand.top + hand.height / 2;
    return hx >= target.left - 8 && hx <= target.right + 8 && hy >= target.top - 8 && hy <= target.bottom + 30;
  })()`);
  if (!agreement) throw new Error(`${activity}: guidance does not point at the required target`);
  /* The hand must mime the gesture the target really needs. */
  const miming = await evaluate(
    `document.querySelector("#tap-hand").classList.contains("is-pulling")`,
  );
  if (miming !== pulls) {
    throw new Error(`${activity}: guidance mimes the wrong gesture (pulling=${miming})`);
  }
  await take(activity, targetId);
  return targetId;
}

/* A wrong tap must teach, not block: the quest target has to stay the same. */
async function checkWrongTapIsForgiving(activity) {
  const targetId = await currentTarget();
  const wrongSelector = await evaluate(`(() => {
    const all = [...document.querySelectorAll(${JSON.stringify(CHOICE_SELECTOR[activity])})];
    const target = ${JSON.stringify(targetId)};
    const attribute = ${JSON.stringify(CHOICE_ATTRIBUTE[activity])};
    const other = all.find((node) => node.getAttribute(attribute) !== target);
    return other ? \`[\${attribute}="\${other.getAttribute(attribute)}"]\` : null;
  })()`);
  if (!wrongSelector) return;
  await tap(wrongSelector);
  await wait(320);
  const stillAsking = await evaluate(
    `window.__ponpoko.state.quest && window.__ponpoko.state.quest.targetId === ${JSON.stringify(targetId)}`,
  );
  if (!stillAsking) throw new Error(`${activity}: a wrong tap changed the question`);
  const wrongTaps = await evaluate("window.__ponpoko.state.quest.wrongTaps");
  if (wrongTaps < 1) throw new Error(`${activity}: a wrong tap was not registered`);
}

async function playRound(activity, roundIndex) {
  const total = await evaluate("window.__ponpoko.state.round.items ? window.__ponpoko.state.round.items.length : (window.__ponpoko.state.round.steps ? window.__ponpoko.state.round.steps.length : window.__ponpoko.state.round.targets.length)");
  const free = await evaluate("!!(window.__ponpoko.state.quest && window.__ponpoko.state.quest.free)");
  for (let step = 0; step < total; step += 1) {
    await currentTarget(step);
    /* A free board has nothing to get wrong, so those checks only run where a
     * particular thing is being asked for. */
    if (roundIndex === 0 && step === 0 && !free) {
      await checkWrongTapIsForgiving(activity);
      await checkGuidancePointsAtTarget(activity);
    } else {
      const targetId = await currentTarget(step);
      await take(activity, targetId);
    }
    await wait(120);
  }
  await waitUntil('!document.querySelector("#round-complete").hidden', `${activity} round ${roundIndex} to complete`, 12000);
  const filled = await evaluate('document.querySelectorAll(".collect-slot.is-filled").length');
  if (filled !== total) {
    throw new Error(`${activity} round ${roundIndex}: board kept ${filled} of ${total} results`);
  }
}

async function playActivity(activity) {
  await tap(`[data-mode="${activity}"]`);
  await waitUntil(`document.querySelector("#app").dataset.screen === "game"`, `${activity} to open`);
  await waitUntil("!!window.__ponpoko.state.quest", `${activity} first quest`);
  await wait(400);
  const smallest = await checkTapTargets(activity);
  await checkNoOverflow(activity);
  await shot(activity);

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    await playRound(activity, roundIndex);
    if (roundIndex === 0) await shot(`${activity}-complete`);
    await tap("#next-round-button");
    await wait(roundIndex === 2 ? 600 : 300);
  }
  await waitUntil(`document.querySelector("#app").dataset.screen === "finish"`, `${activity} finish screen`);
  await checkNoOverflow(`${activity} finish`);
  if (activity === "farm") await shot("finish");
  await tap("#finish-home-button");
  await wait(300);
  return smallest;
}

await command("Page.enable");
await command("Runtime.enable");
await command("Log.enable");
await wait(600);

/* Start from a genuinely clean install: a stale service-worker cache is exactly
 * the class of bug this test exists to catch, so it must not hide one. */
await evaluate(`(async () => {
  try { localStorage.clear(); } catch (error) {}
  if (window.caches && caches.keys) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  localStorage.setItem("ponpoko-settings-v6", JSON.stringify({ effects: false, voice: false, reduceMotion: false }));
  location.reload(true);
})()`);
await wait(1600);

await waitUntil("window.__ponpokoBooted === true", "the app to boot");

/*
 * Refuse to test yesterday's build. A service worker that keeps serving an old
 * bundle has already cost this project two rounds of chasing a bug that was
 * fixed, so the revision the page is running is compared with the one on disk.
 */
const expectedRevision = (await readFile("dist/app.js", "utf8"))
  .match(/const BUILD_REVISION = "([a-f0-9]+)"/)[1];
let loadedRevision = await evaluate("window.__ponpoko.revision");
if (loadedRevision !== expectedRevision) {
  await evaluate("location.reload(true)");
  await wait(1500);
  await waitUntil("window.__ponpokoBooted === true", "the app to boot after a forced reload");
  loadedRevision = await evaluate("window.__ponpoko.revision");
}
if (loadedRevision !== expectedRevision) {
  throw new Error(`Stale build in the browser: ${loadedRevision} but dist is ${expectedRevision}`);
}
if (await evaluate('!document.querySelector("#boot-error").hidden')) {
  throw new Error("Boot diagnostics panel appeared");
}
if ((await evaluate('document.querySelectorAll("[data-mode]").length')) !== ACTIVITIES.length) {
  throw new Error(`Home screen does not offer ${ACTIVITIES.length} modes`);
}
await checkNoOverflow("home");
await shot("home");

const sizes = {};
for (const activity of ACTIVITIES) {
  sizes[activity] = Math.round(await playActivity(activity));
}

/* Leaving mid-animation must not let a stale callback corrupt the next scene. */
await tap('[data-mode="farm"]');
await waitUntil("!!window.__ponpoko.state.quest", "farm restart");
const stale = await currentTarget();
await take("farm", stale);
await tap("#game-home-button");
await tap('[data-mode="animal"]');
await waitUntil("!!window.__ponpoko.state.quest", "animal after interrupt");
await wait(900);
if (!(await evaluate('document.body.classList.contains("activity-animal") && document.querySelectorAll(".choice-card").length >= 2'))) {
  throw new Error("A stale farm callback corrupted the next session");
}
await tap("#game-home-button");

/* Parent gate. */
await tap("#adult-button");
await tap('[data-gate="4"]');
await tap('[data-gate="5"]');
if ((await evaluate('document.querySelector("#parent-settings").hidden')) !== false) {
  throw new Error("Parent settings did not unlock");
}
if ((await evaluate('document.querySelector("#session-count").textContent')) !== "6回") {
  throw new Error("Completed sessions were not persisted");
}
await tap("#overlay-close");

/*
 * Reduced motion takes a different code path: animate() resolves immediately
 * instead of waiting for a Web Animation, so every "and then" callback has to
 * still fire. A round that never completes here would strand the child.
 */
await evaluate(`(() => {
  localStorage.setItem("ponpoko-settings-v6", JSON.stringify({ effects: false, voice: false, reduceMotion: true }));
  location.reload();
})()`);
await wait(1200);
await waitUntil("window.__ponpokoBooted === true", "the app to reboot with reduced motion");
if (!(await evaluate("window.__ponpoko.state.settings.reduceMotion"))) {
  throw new Error("Reduced motion setting did not load");
}
for (const activity of ACTIVITIES) {
  await tap(`[data-mode="${activity}"]`);
  await waitUntil("!!window.__ponpoko.state.quest", `${activity} quest with reduced motion`);
  const total = await evaluate("window.__ponpoko.state.round.items ? window.__ponpoko.state.round.items.length : (window.__ponpoko.state.round.steps ? window.__ponpoko.state.round.steps.length : window.__ponpoko.state.round.targets.length)");
  for (let step = 0; step < total; step += 1) {
    const targetId = await currentTarget(step);
    await take(activity, targetId);
  }
  await waitUntil(
    '!document.querySelector("#round-complete").hidden',
    `${activity} round to complete with reduced motion`,
  );
  const kept = await evaluate('document.querySelectorAll(".collect-slot.is-filled").length');
  if (kept !== total) throw new Error(`${activity} (reduced motion): kept ${kept} of ${total}`);
  await tap("#game-home-button");
  await wait(200);
}

if (consoleErrors.length) throw new Error(`Browser errors: ${consoleErrors.join(" | ")}`);

const viewport = await evaluate("({ w: innerWidth, h: innerHeight })");
console.log(
  `smoke(${label}) passed at ${viewport.w}x${viewport.h} — smallest tap target per mode: `
  + Object.keys(sizes).map((key) => `${key} ${sizes[key]}px`).join(", "),
);
socket.close();
