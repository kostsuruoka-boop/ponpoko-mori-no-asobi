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
  band: (id) => `.band-pad[data-item="${id}"]`,
  peekaboo: (id) => `.hideout[data-item="${id}"]`,
  feast: (id) => `.feast-food[data-item="${id}"]`,
  bubble: (id) => `.bubble[data-item="${id}"]`,
  farm: (id) => `.produce[data-item="${id}"]`,
  animal: (id) => `.choice-card[data-animal="${id}"]`,
  hiragana: (id) => `.letter-cell[data-letter="${id}"]`,
  alphabet: (id) => `.letter-cell[data-letter="${id}"]`,
  "hiragana-field": (id) => `.letter-crop[data-item="${id}"]`,
  "alphabet-field": (id) => `.letter-crop[data-item="${id}"]`,
};

/* Toys have no rounds and no end, so they are driven and checked differently. */
const TOYS = ["band", "peekaboo", "feast", "bubble"];
const GAMES = ["farm", "animal", "hiragana", "alphabet", "hiragana-field", "alphabet-field"];
const ACTIVITIES = TOYS.concat(GAMES);

/* Modes where taking something means dragging it off its plant. */
const PULL_ACTIVITIES = ["farm", "hiragana-field", "alphabet-field"];

const CHOICE_SELECTOR = {
  band: ".band-pad",
  peekaboo: ".hideout",
  feast: ".feast-food",
  bubble: ".bubble",
  farm: ".produce",
  animal: ".choice-card",
  hiragana: ".letter-cell",
  alphabet: ".letter-cell",
  "hiragana-field": ".letter-crop",
  "alphabet-field": ".letter-crop",
};

const CHOICE_ATTRIBUTE = {
  band: "data-item",
  peekaboo: "data-item",
  feast: "data-item",
  bubble: "data-item",
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

/*
 * Every pullable crop must carry a visible arrow, and it must point the way the
 * input actually reads. This is the child's only standing instruction.
 */
async function checkPullCues(activity) {
  if (PULL_ACTIVITIES.indexOf(activity) < 0) return;
  const report = await evaluate(`(() => {
    const crops = [...document.querySelectorAll("[data-pull]")];
    if (!crops.length) return { missing: "no crops" };
    for (const crop of crops) {
      const cue = crop.querySelector(".pull-cue");
      if (!cue) return { missing: crop.getAttribute("data-item") };
      const style = getComputedStyle(cue);
      if (style.display === "none" || style.visibility === "hidden") {
        return { hidden: crop.getAttribute("data-item") };
      }
      const wantsDown = crop.getAttribute("data-pull") === "down";
      const box = crop.getBoundingClientRect();
      const mark = cue.getBoundingClientRect();
      const below = mark.top + mark.height / 2 > box.top + box.height / 2;
      if (below !== wantsDown) return { backwards: crop.getAttribute("data-item") };
    }
    return { ok: crops.length };
  })()`);
  if (!report.ok) {
    throw new Error(`${activity}: direction cue problem ${JSON.stringify(report)}`);
  }
}

async function checkTapTargets(activity) {
  const play = await smallestSide(
    ".produce, .letter-crop, .choice-card, .letter-cell, .band-pad, .hideout, .feast-food,"
    + " .bubble, .ask-bubble, .ask-tanuki, .toy-tanuki, .next-round-button",
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

/*
 * Whatever the ask bubble is showing has to fit inside the bubble. The card is
 * a fixed square sized from the viewport, so a phrase whose font size is also
 * derived from the viewport can — and once did — walk straight out of it.
 */
async function checkAskFits(where) {
  const report = await evaluate(`(() => {
    const bubble = document.querySelector(".ask-bubble");
    const body = document.querySelector(".ask-bubble-body");
    /* A toy has no ask bubble at all, which is the point of it. */
    if (!bubble && !body) return { none: true };
    if (!bubble || !body) return { missing: true };
    const outer = bubble.getBoundingClientRect();
    const children = [...body.children];
    if (!children.length) return { empty: true };
    for (const child of children) {
      const box = child.getBoundingClientRect();
      if (!box.width) continue;
      /* A few pixels of slack for the idle bob and the landing pop. */
      if (box.left < outer.left - 6 || box.right > outer.right + 6
        || box.top < outer.top - 12 || box.bottom > outer.bottom + 12) {
        return {
          spills: child.className || child.tagName,
          box: [Math.round(box.left), Math.round(box.top), Math.round(box.right), Math.round(box.bottom)],
          bubble: [Math.round(outer.left), Math.round(outer.top), Math.round(outer.right), Math.round(outer.bottom)],
        };
      }
    }
    return { ok: children.length };
  })()`);
  if (report.none) return;
  if (report.missing) throw new Error(`${where}: no ask bubble on the board`);
  if (!report.ok && !report.empty) {
    throw new Error(`${where}: ask bubble content overflows ${JSON.stringify(report)}`);
  }
}

/*
 * Boards whose cells are all the same shape by construction. One cell coming
 * out a different size means a layout collision, and a smaller-but-still-legal
 * tap target is exactly the kind of thing that slips past a minimum-size check:
 * a modifier class named `hideout-box` once restyled the button it was on,
 * because `.hideout-box` was also the element inside it.
 */
const UNIFORM_SELECTOR = {
  band: ".band-pad",
  feast: ".feast-food",
  peekaboo: ".hideout",
  animal: ".choice-card",
  hiragana: ".letter-cell",
  alphabet: ".letter-cell",
};

async function checkUniformBoard(activity) {
  const selector = UNIFORM_SELECTOR[activity];
  if (!selector) return;
  const report = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
    if (nodes.length < 2) return { ok: nodes.length };
    const boxes = nodes.map((node) => node.getBoundingClientRect());
    const widths = boxes.map((box) => box.width);
    const heights = boxes.map((box) => box.height);
    const spread = (values) => Math.max(...values) - Math.min(...values);
    if (spread(widths) > 4 || spread(heights) > 4) {
      return {
        uneven: true,
        widths: widths.map(Math.round),
        heights: heights.map(Math.round),
      };
    }
    return { ok: nodes.length };
  })()`);
  if (!report.ok) {
    throw new Error(`${activity}: board cells are not uniform ${JSON.stringify(report)}`);
  }
}

/*
 * A hiding place is drawn on a square, sized from its cell's height, so on a
 * tall narrow cell it grows wider than the cell and spills over its neighbour
 * or off the screen. Checked rather than reasoned about, because the cell shape
 * depends on the viewport.
 */
/*
 * The rest of the run plays with the effects switched off so it stays quiet,
 * which means the synthesised animal cries — six separate code paths, each
 * building its own graph of oscillators and filters — would otherwise never be
 * executed at all. Chrome is launched muted, so this makes the graphs without
 * making a sound, and any exception lands in the console errors that fail the
 * run at the end.
 */
async function checkCriesRun() {
  await evaluate("window.__ponpoko.state.settings.effects = true");
  const pads = await evaluate(
    '[...document.querySelectorAll(".band-pad")].map((n) => n.getAttribute("data-item"))',
  );
  if (pads.length < 2) throw new Error("band: no pads to sound");
  for (const id of pads) {
    await tap(`.band-pad[data-item="${id}"]`);
    await wait(90);
  }
  await evaluate("window.__ponpoko.state.settings.effects = false");
}

async function checkHideoutsFit() {
  const report = await evaluate(`(() => {
    const spots = [...document.querySelectorAll(".hideout")];
    if (!spots.length) return { ok: 0 };
    for (const spot of spots) {
      const box = spot.querySelector(".hideout-box");
      if (!box) return { missing: true };
      const cell = spot.getBoundingClientRect();
      const art = box.getBoundingClientRect();
      if (art.left < cell.left - 1 || art.right > cell.right + 1) {
        return {
          spills: Math.round(Math.max(cell.left - art.left, art.right - cell.right)),
          cell: [Math.round(cell.width), Math.round(cell.height)],
          art: [Math.round(art.width), Math.round(art.height)],
        };
      }
    }
    return { ok: spots.length };
  })()`);
  if (report.ok === undefined) {
    throw new Error(`peekaboo: a hiding place overflows its cell ${JSON.stringify(report)}`);
  }
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
    /* Peekaboo swaps the bubble for a shout the moment somebody appears, and
     * that shout is the largest thing the bubble ever has to hold. */
    if (activity === "peekaboo" && roundIndex === 0 && step === 0) {
      await checkAskFits(`${activity} mid-reveal`);
    }
  }
  await waitUntil('!document.querySelector("#round-complete").hidden', `${activity} round ${roundIndex} to complete`, 12000);
  const filled = await evaluate('document.querySelectorAll(".collect-slot.is-filled").length');
  if (filled !== total) {
    throw new Error(`${activity} round ${roundIndex}: board kept ${filled} of ${total} results`);
  }
}

/*
 * A toy cannot be "completed", so completion is not what is checked. What is
 * checked is the promise the toys actually make: that they never stop
 * answering. Every touch has to register, an already-used thing has to answer
 * a second touch, the tanuki has to answer anywhere, and no round-complete
 * gate may ever appear — a toy that puts up a "next" button has turned back
 * into a quiz.
 */
async function playToy(activity) {
  await tap(`[data-mode="${activity}"]`);
  await waitUntil(`document.querySelector("#app").dataset.screen === "game"`, `${activity} to open`);
  await waitUntil('!!document.querySelector(".toy-stage")', `${activity} stage to appear`);
  await wait(500);
  const smallest = await checkTapTargets(activity);
  await checkAskFits(activity);
  await checkUniformBoard(activity);
  if (activity === "peekaboo") await checkHideoutsFit();
  if (activity === "band") await checkCriesRun();
  await checkNoOverflow(activity);
  await shot(activity);

  for (let touch = 0; touch < 14; touch += 1) {
    /* Read the board fresh every time: a popped bubble is replaced by a new
     * one with a new id, so a snapshot of ids would go stale. */
    const board = await evaluate(`(() => {
      const all = [...document.querySelectorAll("[data-item]")];
      const live = all.filter((node) => !node.classList.contains("is-popped"));
      return {
        id: live.length ? live[0].getAttribute("data-item") : null,
        total: all.length,
        live: live.length,
        stage: !!document.querySelector(".toy-stage"),
        screen: document.querySelector("#app").dataset.screen,
      };
    })()`);
    if (!board.id) {
      throw new Error(
        `${activity}: the board ran out of things to touch at touch ${touch} `
        + JSON.stringify(board),
      );
    }
    const id = board.id;
    const before = await evaluate("window.__ponpoko.state.playTaps");
    await tap(`[data-item="${id}"]`);
    await wait(150);
    const after = await evaluate("window.__ponpoko.state.playTaps");
    if (after <= before) throw new Error(`${activity}: touching ${id} did nothing`);
  }

  /*
   * The promise is not that a burst of taps can never outrun the refill — it is
   * that the board always comes back. So give it a moment and then require it
   * to be whole again, minus at most one still in flight.
   */
  await wait(1400);
  const left = await evaluate('document.querySelectorAll("[data-item]:not(.is-popped)").length');
  if (left < 5) throw new Error(`${activity}: the board did not refill (${left} left)`);

  const beforePoke = await evaluate("window.__ponpoko.state.playTaps");
  await tap(".toy-tanuki");
  await wait(200);
  if ((await evaluate("window.__ponpoko.state.playTaps")) <= beforePoke) {
    throw new Error(`${activity}: the tanuki did not answer a poke`);
  }

  if (!(await evaluate('document.querySelector("#round-complete").hidden'))) {
    throw new Error(`${activity}: a toy put up a round-complete gate`);
  }
  if ((await evaluate('document.querySelector("#app").dataset.screen')) !== "game") {
    throw new Error(`${activity}: a toy ended on its own`);
  }
  await shot(`${activity}-played`);
  await checkNoOverflow(`${activity} after play`);
  await tap("#game-home-button");
  await wait(300);
  return smallest;
}

async function playActivity(activity) {
  await tap(`[data-mode="${activity}"]`);
  await waitUntil(`document.querySelector("#app").dataset.screen === "game"`, `${activity} to open`);
  await waitUntil("!!window.__ponpoko.state.quest", `${activity} first quest`);
  await wait(400);
  const smallest = await checkTapTargets(activity);
  await checkPullCues(activity);
  await checkAskFits(activity);
  await checkUniformBoard(activity);
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
for (const activity of TOYS) {
  sizes[activity] = Math.round(await playToy(activity));
}
for (const activity of GAMES) {
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
/* Only the finding games finish, so only they are counted. */
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
for (const activity of TOYS) {
  await tap(`[data-mode="${activity}"]`);
  await waitUntil('!!document.querySelector(".toy-stage")', `${activity} with reduced motion`);
  for (let touch = 0; touch < 8; touch += 1) {
    const id = await evaluate(`(() => {
      const node = document.querySelector("[data-item]:not(.is-popped)");
      return node ? node.getAttribute("data-item") : null;
    })()`);
    if (!id) throw new Error(`${activity} (reduced motion): nothing left to touch`);
    const before = await evaluate("window.__ponpoko.state.playTaps");
    await tap(`[data-item="${id}"]`);
    await wait(120);
    if ((await evaluate("window.__ponpoko.state.playTaps")) <= before) {
      throw new Error(`${activity} (reduced motion): touching ${id} did nothing`);
    }
  }
  await tap("#game-home-button");
  await wait(200);
}

for (const activity of GAMES) {
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
