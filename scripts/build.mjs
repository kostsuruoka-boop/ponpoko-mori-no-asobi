/*
 * Static build.
 *
 * The browser bundle is deliberately NOT an ES module. Some iPads fail to load
 * `type="module"` scripts through a service worker, which shows up as a screen
 * that renders but never responds to a tap. Concatenating the modules into one
 * classic script removes that entire failure mode, and it keeps the sources
 * importable by the Node tests.
 */

import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const projectRoot = process.cwd();
const outputDirectory = path.join(projectRoot, "dist");

/* Dependency order. Each module may only use names declared above it. */
export const BUNDLE_MODULES = [
  "content.js",
  "game-core.js",
  "audio.js",
  "scenery.js",
  "app.js",
];

const IMPORT_STATEMENT = /^import\s[\s\S]*?from\s+["'][^"']+["'];?[ \t]*$/gm;
const EXPORT_KEYWORD = /^export\s+(?=(?:const|let|var|function|class|async))/gm;
const EXPORT_LIST = /^export\s*\{[\s\S]*?\};?[ \t]*$/gm;

export function toClassicSource(source) {
  return source
    .replace(IMPORT_STATEMENT, "")
    .replace(EXPORT_LIST, "")
    .replace(EXPORT_KEYWORD, "");
}

export function bundle(sources) {
  const body = sources
    .map(function (entry) {
      return "/* ---- " + entry.name + " ---- */\n" + toClassicSource(entry.source).trim();
    })
    .join("\n\n");
  return '(function () {\n"use strict";\n\n' + body + "\n\n})();\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (path.basename(outputDirectory) !== "dist" || path.dirname(outputDirectory) !== projectRoot) {
    throw new Error("Unexpected output directory");
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  /* Only the sliced sprites ship. The source sheets stay in the repository as
   * the master artwork and would otherwise double the offline download. */
  await cp(
    path.join(projectRoot, "assets", "sprites"),
    path.join(outputDirectory, "assets", "sprites"),
    { recursive: true },
  );
  await cp(path.join(projectRoot, "public"), outputDirectory, { recursive: true });

  for (const file of ["index.html", "styles.css"]) {
    await cp(path.join(projectRoot, "src", file), path.join(outputDirectory, file));
  }

  const sources = [];
  for (const name of BUNDLE_MODULES) {
    sources.push({ name, source: await readFile(path.join(projectRoot, "src", name), "utf8") });
  }

  /*
   * One revision identifies this build everywhere: stamped into the bundle,
   * shown in the parent menu, and used as the cache name. Deriving it from the
   * inputs rather than the output keeps it available before anything is
   * written, and lets the browser smoke test refuse to test a stale page.
   */
  const digest = createHash("sha256");
  for (const entry of sources) {
    digest.update(entry.name);
    digest.update(entry.source);
  }
  for (const name of ["index.html", "styles.css"]) {
    digest.update(await readFile(path.join(projectRoot, "src", name)));
  }
  for (const name of (await readdir(path.join(projectRoot, "assets", "sprites"))).sort()) {
    digest.update(name);
    digest.update(await readFile(path.join(projectRoot, "assets", "sprites", name)));
  }
  const revision = digest.digest("hex").slice(0, 12);

  const bundlePath = path.join(outputDirectory, "app.js");
  const bundled = bundle(sources);
  if (!bundled.includes('const BUILD_REVISION = "dev";')) {
    throw new Error("app.js is missing the build revision placeholder");
  }
  await writeFile(
    bundlePath,
    bundled.replace('const BUILD_REVISION = "dev";', `const BUILD_REVISION = "${revision}";`),
  );

  /* A bundle that cannot be parsed must fail the build, not the child's iPad. */
  await run(process.execPath, ["--check", bundlePath]);
  if ((await readFile(bundlePath, "utf8")).includes("\nimport ")) {
    throw new Error("Bundle still contains an import statement");
  }

  /*
   * The offline precache list is derived from what actually shipped, so adding
   * artwork can never leave the installed app with a missing picture.
   */
  const spriteNames = (await readdir(path.join(outputDirectory, "assets", "sprites")))
    .filter((name) => name.endsWith(".png"))
    .sort();
  const workerPath = path.join(outputDirectory, "service-worker.js");
  let workerSource = await readFile(workerPath, "utf8");
  if (!workerSource.includes("const ASSET_FILES = [];")) {
    throw new Error("service-worker.js is missing the asset list placeholder");
  }
  if (!workerSource.includes('const CACHE_NAME = "ponpoko-dev";')) {
    throw new Error("service-worker.js is missing the cache name placeholder");
  }
  workerSource = workerSource.replace(
    "const ASSET_FILES = [];",
    "const ASSET_FILES = "
      + JSON.stringify(spriteNames.map((name) => `./assets/sprites/${name}`), null, 2)
      + ";",
  );

  /*
   * Optional artwork is declared here rather than probed in the browser, so a
   * sheet that has not been drawn yet costs nothing and logs nothing.
   */
  const hasAbcSheet = await access(path.join(projectRoot, "assets", "sprites", "abc-fish.png"))
    .then(() => true)
    .catch(() => false);

  const indexPath = path.join(outputDirectory, "index.html");
  let indexHtml = await readFile(indexPath, "utf8");
  if (!indexHtml.includes("window.__ponpokoAssets = { abc: false };")) {
    throw new Error("index.html is missing the asset flag placeholder");
  }
  indexHtml = indexHtml.replace(
    "window.__ponpokoAssets = { abc: false };",
    `window.__ponpokoAssets = { abc: ${hasAbcSheet} };`,
  );
  if (indexHtml.includes('type="module"')) {
    throw new Error("index.html must load the classic bundle, not a module");
  }
  await writeFile(indexPath, indexHtml);
  await writeFile(path.join(outputDirectory, "404.html"), indexHtml);

  /* The cache is named after the same revision, so changed artwork can never
   * be served from an old cache and nobody has to remember a version number. */
  workerSource = workerSource.replace('"ponpoko-dev"', `"ponpoko-${revision}"`);
  await writeFile(workerPath, workerSource);

  console.log(`Built ${outputDirectory} rev ${revision} (abc sheet: ${hasAbcSheet ? "yes" : "no"})`);
}
