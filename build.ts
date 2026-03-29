/**
 * Build script for Glassboard standalone distribution.
 *
 * Produces a `dist/` folder containing:
 *   glassboard.exe  — standalone executable (no Bun needed)
 *   config.json     — default configuration
 *   public/         — CSS, pre-built JS, sound files
 *
 * Usage: bun run build.ts
 */

import { join } from "path";
import { cp, mkdir, rm } from "fs/promises";

const ROOT = import.meta.dir;
const DIST = join(ROOT, "dist");

// Clean dist
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

// 1. Build client TypeScript → JavaScript
console.log("[1/3] Building client.ts...");
await Bun.build({
  entrypoints: [join(ROOT, "public", "client.ts")],
  outdir: join(ROOT, "public"),
  target: "browser",
  splitting: true,
  format: "esm",
  minify: true,
});

// 2. Compile server → standalone exe
console.log("[2/3] Compiling standalone executable...");
const exeName = process.platform === "win32" ? "glassboard.exe" : "glassboard";
const proc = Bun.spawn(["bun", "build", "--compile", "server.ts", "--outfile", join(DIST, exeName)], {
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
});
const exitCode = await proc.exited;
if (exitCode !== 0) {
  console.error("[2/3] Compile failed with exit code", exitCode);
  process.exit(exitCode);
}

// 3. Copy runtime files
console.log("[3/3] Copying runtime files...");
await cp(join(ROOT, "config.json"), join(DIST, "config.json"));
await mkdir(join(DIST, "public"), { recursive: true });
await cp(join(ROOT, "public", "style.css"), join(DIST, "public", "style.css"));
await cp(join(ROOT, "public", "favicon.ico"), join(DIST, "public", "favicon.ico"));

// Copy pre-built JS files
const publicFiles = new Bun.Glob("*.js").scanSync(join(ROOT, "public"));
for (const file of publicFiles) {
  await cp(join(ROOT, "public", file), join(DIST, "public", file));
}

// Copy sound files
await cp(join(ROOT, "public", "sounds"), join(DIST, "public", "sounds"), { recursive: true });

console.log("\nBuild complete! Distribution in dist/");
console.log("Run: dist/glassboard.exe");
