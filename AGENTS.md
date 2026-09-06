# ぽんぽこ もりの だいぼうけん — Agent Guide

A production-minded static web game for one specific child: the maintainer's
daughter, **22 months old**. The product goal is not a demo. It is a joyful,
immediately understandable play experience with an animated tanuki.

**The tanuki is the toy, and delight comes first.** Ten activities ship, and
they are two different kinds of thing:

- **Four toys** (`band`, `peekaboo`, `feast`, `bubble`) — no question, no answer,
  no round, no score, **no end**. They stop when an adult presses home.
- **Six finding games** — the older quiz-shaped activities, still there, sitting
  in a strip under the toys.

The distinction is not cosmetic and it has already been got wrong once: putting
the toys inside the finding games' frame — a speech bubble with nothing to ask,
a shelf counting to six, a "next" button — turned them into chores, and the
owner rejected it on sight (`docs/product-requirements.md` §1.6). **A toy must
never grow a round, a counter or a next button.**

Read [`docs/product-requirements.md`](./docs/product-requirements.md) first —
it records what the owner actually asked for. Then
[`docs/game-design.md`](./docs/game-design.md) for the current design and
[`docs/implementation-guide.md`](./docs/implementation-guide.md) for why the
implementation looks the way it does.

## Product priorities

Use this order when trade-offs arise.

1. It works when launched from the iPad home-screen icon. Nothing else counts if this fails.
2. A child of roughly 1.5–3 can understand the next action without reading or spoken instructions.
3. On-screen guidance and the required action are the same thing. A mismatch is a bug, not polish.
4. Every touch produces immediate visual and audio feedback. No touch anywhere is ever dead.
5. It is fun. A board that is educationally sound and joyless has failed.
6. The learning relationship is carried by the interaction itself, not by labels.
7. The tanuki is visibly part of play, is itself tappable, and never covers the active object.
8. The whole screen is purposeful and safe in both portrait and landscape.
9. Parent controls, persistence, offline support, accessibility, tests and maintainability stay reliable.

## Experience rules

- **The tanuki is a button, everywhere.** On the home screen and in every activity,
  poking it plays its belly drum and makes it dance, with no effect on progress. It is the
  standing guarantee that a child who cannot read the board can still make something happen.
- **A toy never ends.** No rounds, no counter, no "next", no finish screen, and no text on
  screen at all. It has no session (`createSession` throws for a toy on purpose). What
  replaces a round is a board that refills: hiding places take a new guest, plates are
  restocked, bubbles come back. **The one state a toy may never reach is empty.**
- **A toy never refuses a touch.** They must not set `state.busy`: a toddler drums the
  glass with a whole hand and every one of those touches has to answer. Each element owns
  its own animation, and an already-used one still responds. Adding a busy guard here is a
  regression, not a fix.
- **An animal that can be pressed makes its own noise.** The band's cries are synthesised in
  `AudioDirector.cry()`, not spoken: speech is late, dies with the voice setting, and cancels
  itself when a child hammers six pads. Only animals with an iconic cry may join the band —
  a pad with nothing to say when pressed is a dead button — and `tests/audio.test.mjs`
  enforces it by driving the synthesiser against a recording stand-in for Web Audio.
- **A toy has no wrong answer, by construction.** Not "forgiven" — absent. Every hiding
  place has someone in it; every band pitch is pentatonic so no order is sour.
- **All four toys share one arrangement**: the tanuki is the largest thing on screen and
  always in the same place (left in landscape, bottom in portrait); everything touchable is
  on the other side of it. One thing to learn, not four.
- **Two gestures, no more.** Tap to choose; drag to harvest. Things overhead are pulled down, things in the ground are pulled up, and a sprite only follows the finger in the direction it can actually come off in. No double taps, long presses, diagonal swipes, pinches, or precise drop targets.
- Every pullable crop carries a standing arrow pointing the way it comes off. It is on all of them at once, so it teaches the gesture without hinting at the answer, and it hides the moment a finger lands.
- Three fruitless taps on the same crop harvest it. A child who cannot manage the drag must never be stuck.
- Play targets are at least 72 CSS px on the shortest side. Adult-only shell buttons may be smaller (52px minimum) so they are harder to hit by accident. `scripts/browser-smoke.mjs` enforces both.
- No scores, timers, lives, or failure states. A wrong tap makes the tapped thing say its own name and nudges the guidance one stage further.
- Guidance escalates with idle time and wrong taps: repeat the request, glow the answer, then put a hand on the exact element — miming a tap or a pull according to that element's own `data-pull`. Never show a permanent "correct answer" outline.
- A completed object stays in the scene. A completed board waits for the child to press the large next control; never auto-dismiss.
- A round reaches a satisfying reaction within a few seconds and a full celebration within about a minute.
- **Toys speak English, finding games speak Japanese.** The device's Japanese voice was
  reported as unpleasant; words in a toy are decoration rather than curriculum, so they
  moved to English ("Peekaboo", "Apple", "Pop"), where the shipped voices are far more
  natural. Japanese stays where the language *is* the lesson. Never slow a Japanese voice
  below ~0.9 or raise its pitch — that combination is what made it sound wrong.
- Speech is never instructions or narration. Because a new utterance cancels the previous
  one, keep the pacing constants in `STEP_PACING` honest, and where a reaction would talk
  over a name, show it as a floating word instead: there is one voice.
- Each activity has a distinct interaction. Do not ship three reskinned quizzes.
- A letter field has no request and no wrong answer. Do not add one: choosing for yourself is the point.
- No BGM, ads, analytics, external tracking, network gameplay or runtime CDN dependencies.

## Architecture

- `src/content.js` — every word, picture, chart and label the child meets.
- `src/game-core.js` — pure rules. No DOM, no timers, no storage. Deterministic given an injected `random`.
- `src/audio.js` — synthesised effects and speech.
- `src/scenery.js` — hand-authored SVG habitats, peekaboo hideouts and backdrop.
- `src/app.js` — screens, scene lifecycle, quests, feedback.
- `assets/` — master sprite sheets (repository only). `assets/sprites/` — sliced sprites (shipped).
- `public/` — manifest, icons, service worker. `scripts/` — build, asset generation, browser smoke test.
- `tests/` — deterministic rule tests. `docs/` — requirements, design, handover. `dist/` — generated; never edit.

Must remain deployable as static files on GitHub Pages. No servers, secrets, or databases.

## Implementation conventions

- **Browser baseline is Safari 13.4 / iPadOS 13.4.** Do not introduce `||=`, `&&=`, `??=`, `Array.prototype.at`, `replaceChildren`, `AbortController` listener signals, `Object.hasOwn`, `structuredClone` or `<dialog>`. In CSS avoid `inset`, `aspect-ratio`, flexbox `gap`, standalone `translate`/`rotate`/`scale`, `:is()`/`:where()`/`:has()`, `color-mix()`, `svh`/`dvh`.
- The browser bundle ships as one **classic** script produced by `scripts/build.mjs`. Never add `type="module"` to `index.html`; the build fails if you do.
- `PascalCase` for classes, `camelCase` for functions and variables, lowercase kebab-case for assets and docs.
- Every timer, listener, animation and delayed callback belongs to one scene lifecycle. `clearRuntime()` must invalidate all of it before new state exists.
- Wrap all `localStorage` access in try/catch. A blocked storage must not stop play.
- Respect `prefers-reduced-motion` and the in-app setting.
- Account for iPad safe areas. Prevent scrolling inside play surfaces only.
- Never commit secrets or user-specific absolute paths.

## Required quality loop

For every material gameplay or layout change:

1. Update `docs/game-design.md` when the interaction, learning goal or visual grammar changes.
2. Add or update deterministic tests in `tests/`.
3. Run `npm test`, `npm run lint`, `npm run build`, `git diff --check`.
4. Run `node scripts/browser-smoke.mjs` in **both** landscape (1194x834) and portrait (834x1194). It drives all ten modes — the six games to the end, and the four toys against the promise they actually make: every touch registers, the board refills, the tanuki answers, and no round-complete gate ever appears with each mode's real gesture and fails on console errors, overflow, undersized tap targets, guidance that points at the wrong element or mimes the wrong gesture, wrong choices that break progression, direction arrows that are missing or point the wrong way, and a browser running a stale build. Launch Chrome with `--mute-audio`; a headless audio device error would otherwise be reported as a console error.
5. Look at the screenshots in `tmp/ui-check/`. Check overlap, clipping, safe areas and tanuki placement.
6. Verify the production URL from the iPad home-screen icon, not only a desktop browser.

Do not call an activity complete because it works technically. Iterate until the
objective, action, feedback and completion are legible from motion alone.

## Things that have already gone wrong here

Do not reintroduce them.

- ES modules loaded through a service worker left an iPad rendering the page with every tap dead. The bundle is classic script now.
- A hand-versioned service-worker cache pinned old artwork after it was fixed. The cache name is now a content hash generated by the build.
- CSS sprite sheets bled a neighbouring cell into view at fractional scale. Sprites are individual files now, and `scripts/make-sprites.py` strips fragments that crossed a cell border.
- Free-form dragging to a drop target, with hints that mimed a different gesture, was unusable for a toddler. Harvesting is a short pull along one fixed axis now, the sprite refuses to move the wrong way, and the hand mimes the same direction the input reads.
- Leaving `state.quest` set between a solved step and the next question scored the next tap against the answered question.
- Chaining scene steps on the Web Animations `finish` event alone froze the board whenever the page was hidden, because a hidden document stops delivering them. `animate()` now also arms the callback on a timer.
- Two smoke runs were spent debugging a bug that was already fixed, because the browser was serving an older bundle. The build stamps a revision into `app.js` and the smoke test refuses to run against a page that does not match `dist/`.
- The toys were built on the finding games' frame — ask bubble, collect shelf, three rounds,
  a "next" button. It shipped, and the owner rejected all of it in one sitting: a bubble
  with nothing to say, a number that means nothing to a toddler, and music that stops after
  six notes. A toy and a quiz are different objects; do not give one the other's furniture.
- A per-kind modifier class named `hideout-box` silently restyled the button it was on, because `.hideout-box` was also the name of the element *inside* it: that one hiding place came out half width. Variant goes on a data attribute (`data-hideout`), not a class that can collide with a descendant's. The smoke test now checks that boards whose cells are uniform by construction really are.

## Common commands

- `npm run dev` — build and serve `dist/` on http://localhost:4173
- `npm test` — deterministic rule tests
- `npm run lint` — syntax checks
- `npm run build` — produce `dist/`
- `npm run icons` — regenerate home-screen icons
- `.venv/bin/python scripts/make-sprites.py` — reslice sprite sheets

If these change, update this file and the README in the same commit.
