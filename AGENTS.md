# ぽんぽこ もりの だいぼうけん — Agent Guide

A production-minded static web game for one specific child: the maintainer's
daughter, **22 months old**. The product goal is not a demo. It is a joyful,
immediately understandable play experience with an animated tanuki that also
teaches something real.

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
4. Every touch produces immediate visual and audio feedback.
5. The learning relationship is carried by the interaction itself, not by labels.
6. The tanuki is visibly part of play and never covers the active object.
7. The whole screen is purposeful and safe in both portrait and landscape.
8. Parent controls, persistence, offline support, accessibility, tests and maintainability stay reliable.

## Experience rules

- **Tap only.** No dragging, double taps, long presses, swipes or pinches — anywhere.
- Play targets are at least 72 CSS px on the shortest side. Adult-only shell buttons may be smaller (52px minimum) so they are harder to hit by accident. `scripts/browser-smoke.mjs` enforces both.
- No scores, timers, lives, or failure states. A wrong tap makes the tapped thing say its own name and nudges the guidance one stage further.
- Guidance escalates with idle time and wrong taps: repeat the request, glow the answer, then point a hand at the exact element to tap. Never show a permanent "correct answer" outline.
- A completed object stays in the scene. A completed board waits for the child to press the large next control; never auto-dismiss.
- A round reaches a satisfying reaction within a few seconds and a full celebration within about a minute.
- Speech is for the learning content — object names, letter sounds, words. Never spoken instructions or narration. Because a new utterance cancels the previous one, keep the pacing constants in `STEP_PACING` honest.
- Each activity has a distinct interaction. Do not ship three reskinned quizzes.
- No BGM, ads, analytics, external tracking, network gameplay or runtime CDN dependencies.

## Architecture

- `src/content.js` — every word, picture, chart and label the child meets.
- `src/game-core.js` — pure rules. No DOM, no timers, no storage. Deterministic given an injected `random`.
- `src/audio.js` — synthesised effects and speech.
- `src/scenery.js` — hand-authored SVG habitats and backdrop.
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
4. Run `node scripts/browser-smoke.mjs` in **both** landscape (1194x834) and portrait (834x1194). It plays every mode to the end and fails on console errors, overflow, undersized tap targets, guidance that does not point at the required element, and wrong taps that break progression.
5. Look at the screenshots in `tmp/ui-check/`. Check overlap, clipping, safe areas and tanuki placement.
6. Verify the production URL from the iPad home-screen icon, not only a desktop browser.

Do not call an activity complete because it works technically. Iterate until the
objective, action, feedback and completion are legible from motion alone.

## Things that have already gone wrong here

Do not reintroduce them.

- ES modules loaded through a service worker left an iPad rendering the page with every tap dead. The bundle is classic script now.
- A hand-versioned service-worker cache pinned old artwork after it was fixed. The cache name is now a content hash generated by the build.
- CSS sprite sheets bled a neighbouring cell into view at fractional scale. Sprites are individual files now, and `scripts/make-sprites.py` strips fragments that crossed a cell border.
- Drag-based play with drag-shaped hints was unusable for a toddler and the hints did not match what actually worked. Everything is tap now.
- Leaving `state.quest` set between a solved step and the next question scored the next tap against the answered question.

## Common commands

- `npm run dev` — build and serve `dist/` on http://localhost:4173
- `npm test` — deterministic rule tests
- `npm run lint` — syntax checks
- `npm run build` — produce `dist/`
- `npm run icons` — regenerate home-screen icons
- `.venv/bin/python scripts/make-sprites.py` — reslice sprite sheets

If these change, update this file and the README in the same commit.
