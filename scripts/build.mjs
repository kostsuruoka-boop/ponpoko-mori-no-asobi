import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const outputDirectory = path.join(projectRoot, "dist");

if (path.basename(outputDirectory) !== "dist" || path.dirname(outputDirectory) !== projectRoot) {
  throw new Error("Unexpected output directory");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(path.join(projectRoot, "assets"), path.join(outputDirectory, "assets"), { recursive: true });
await cp(path.join(projectRoot, "public"), outputDirectory, { recursive: true });

for (const file of ["index.html", "styles.css", "app.js", "audio.js", "game-core.js"]) {
  await cp(path.join(projectRoot, "src", file), path.join(outputDirectory, file));
}

const indexHtml = await readFile(path.join(outputDirectory, "index.html"), "utf8");
await writeFile(path.join(outputDirectory, "404.html"), indexHtml);

console.log(`Built ${outputDirectory}`);
