# PONPOKO MORI NO ASOBI — Agent Guide

This repository is a production-minded, static web game for a toddler using an iPad. The product goal is not a generic demo: it is a joyful, immediately understandable play experience centered on an animated tanuki. Any coding agent working here should preserve that goal while being free to improve architecture, visuals, content, and tooling.

## Product priorities

Use this order when trade-offs arise:

1. A child aged roughly 1–2 can understand the next action without reading or spoken instructions.
2. Every touch creates immediate, delightful visual and action-sound feedback.
3. The educational relationship is embodied by the interaction itself—not explained with labels.
4. The tanuki is visibly involved in play and remains naturally grounded in the scene.
5. The entire iPad screen is purposeful, uncluttered, safe, and responsive in portrait and landscape.
6. Parent controls, persistence, offline support, accessibility, tests, and maintainability remain reliable.

## Experience rules

- Use large touch targets (at least 72 CSS px where practical) with generous spacing.
- Do not require reading, speech comprehension, precise dragging, double taps, timers, scores, lives, or failure states.
- A wrong choice should produce a gentle reaction and invite another try; never punish or block the child.
- Teach by synchronized motion, matching appearance, spatial placement, and a short silent demonstration.
- Each activity must have a distinct interaction—not three reskinned tap-the-answer quizzes.
- A completed object or match stays visibly in the scene. A completed board must remain until the child explicitly presses the large next control; never auto-dismiss the result.
- Keep a round short. It should reach a satisfying reaction within a few seconds and a larger celebration within about a minute.
- Use gentle action sounds for physical feedback. Vocabulary names and letter sounds are allowed only when they are the learning content; do not use spoken instructions, narration, music, ads, analytics, or external tracking.
- Keep the tanuki's home position intentional for each scene. It may animate between authored positions, but it must not follow the pointer or cover the active object.
- Prefer playful physical metaphors: shake, roll, reveal, feed, sort, open, stack, or guide.
- Do not expose an answer with a permanent “correct option” outline. Hints should demonstrate the action or relationship and may become more explicit after inactivity.

## Architecture and repository layout

- `src/`: application HTML, CSS, JavaScript, and game logic.
- `assets/`: checked-in production artwork and sprite sheets.
- `public/`: static deployment files such as the manifest and service worker.
- `tests/`: deterministic tests that mirror observable game behavior.
- `scripts/`: build and validation utilities.
- `docs/`: product design, activity specifications, visual rules, and maintenance notes for humans and agents.
- `dist/`: generated release output; never edit it directly.

The app must remain deployable as static files on GitHub Pages. Avoid servers, secrets, databases, network-dependent gameplay, and runtime CDN dependencies. Small focused modules are preferred, but restructuring is allowed when it materially improves the product.

## Implementation conventions

- Use semantic HTML and modern browser-native JavaScript/CSS unless a dependency clearly earns its cost.
- Keep game rules and session progression testable without a DOM.
- Centralize activity metadata, timings, and round content rather than scattering magic values.
- Use `PascalCase` for classes/types and `camelCase` for functions and variables.
- Asset and documentation names use lowercase kebab-case.
- Respect `prefers-reduced-motion` and the in-app reduced-motion setting.
- Handle touch with Pointer Events and prevent accidental page scrolling only inside active play surfaces.
- Account for iPad safe areas and dynamic viewport units.
- Preserve offline behavior. Bump the service-worker cache version whenever shipped static assets or application files change.
- Every timer, Pointer Event listener, Web Animation, particle, and delayed callback belongs to one scene lifecycle. Leaving or restarting a scene must invalidate all prior callbacks before new state is created.
- Never commit secrets or user-specific absolute paths.

## Required quality loop

For every material gameplay or layout change:

1. Update `docs/game-design.md` when the interaction, learning goal, or visual grammar changes.
2. Add or update deterministic tests for game rules and progression.
3. Run `npm test`, `npm run lint`, and `npm run build`.
4. Run `git diff --check`.
5. Exercise the complete journey in a browser, including wrong interactions, all rounds, completion, parent settings, repeated sessions, and leaving during an active animation.
6. Inspect screenshots at representative iPad portrait and landscape sizes. Check overlap, clipping, safe areas, target size, and tanuki placement.
7. Verify the production URL after deployment, not only the local build.

Do not call an activity complete merely because it works technically. Iterate until its objective, action, feedback, and completion are legible from motion alone.

## Common commands

- `npm run dev`: serve the local release for browser testing.
- `npm test`: run all deterministic tests.
- `npm run lint`: run syntax and static checks.
- `npm run build`: produce `dist/`.

If these commands change, update this file and the README in the same change.

## Documentation contract

`docs/game-design.md` is the source of truth for the current product and activity design. It must explain:

- the audience and nonverbal design principles;
- the learning objective and unique input mechanic of every activity;
- round structure and content progression;
- correct, incorrect, idle-hint, and completion feedback;
- tanuki staging and animation intent;
- visual, audio, accessibility, persistence, and testing requirements.

When code and documentation disagree, either bring the code back to the documented design or deliberately update the design document and explain why.
