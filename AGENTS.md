# Repository Guidelines

## Project Structure & Module Organization

This repository is currently an empty project scaffold. As implementation begins, keep production code under `src/`, tests under `tests/`, and static resources under `assets/`. Group code by feature or domain rather than placing unrelated modules in a single directory. Keep generated output (for example, `build/`, `dist/`, or coverage reports) out of source directories and add it to `.gitignore`.

Document any intentional deviation from this layout in this file or the project README. Prefer small modules with clear public interfaces, and keep configuration files at the repository root when required by the selected toolchain.

## Build, Test, and Development Commands

The project uses dependency-free npm scripts (Node.js 20+; Python 3 is used only by the local static server):

- `npm run build`: produce the GitHub Pages-ready `dist/` directory.
- `npm test`: run the complete game-logic test suite with Node's built-in test runner.
- `npm run lint`: syntax-check application, build, and service-worker JavaScript.
- `npm run dev`: build and serve the app at `http://localhost:4173`.

## Coding Style & Naming Conventions

Adopt the standard formatter and linter for the chosen language, commit their configuration, and run them before review. Use spaces unless the formatter requires otherwise. Choose descriptive names: `PascalCase` for types, `camelCase` for functions and variables, and lowercase kebab-case for documentation and asset filenames. Avoid broad formatting changes in feature commits.

## Testing Guidelines

Add tests with every behavior change and regression fix. Mirror source organization under `tests/`, and name tests after observable behavior (for example, `creates_account_with_valid_input`). Tests should be deterministic and must not depend on developer-specific paths, credentials, or network access unless explicitly marked as integration tests.

## Commit & Pull Request Guidelines

No Git history is available to infer an existing convention. Use short, imperative commit subjects such as `Add account validation`, with focused commits that build and test independently. Pull requests should explain the motivation, summarize changes, list verification performed, and link relevant issues. Include screenshots or recordings for visible UI changes, and call out configuration or migration steps.

## Security & Configuration

Never commit secrets, signing keys, or local environment files. Provide sanitized examples such as `.env.example`, validate required configuration at startup, and review new dependencies before adoption.
