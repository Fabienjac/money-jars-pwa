// Charge un module TypeScript de src/ pour les tests Node (bundle esbuild dans un dossier temporaire).
import { buildSync } from "esbuild";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadTs(relPath) {
  const out = path.join(os.tmpdir(), `mjars-test-${path.basename(relPath, ".ts")}-${process.pid}.mjs`);
  buildSync({ entryPoints: [path.join(root, relPath)], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "silent" });
  return import(pathToFileURL(out).href + `?t=${Date.now()}`);
}
