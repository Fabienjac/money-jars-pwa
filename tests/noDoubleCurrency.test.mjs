// formatMoney() renvoie déjà le symbole de la devise (« 1 054,98 € ») : y ajouter currencySymbol() affiche « € € ».
// Ce test parcourt les sources de l'interface et refuse un symbole collé après un montant déjà formaté.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : /\.(tsx?|jsx?)$/.test(e.name) ? [path.join(dir, e.name)] : []);
}

test("aucun symbole de devise collé après formatMoney()", () => {
  // formatMoney(x)} ${curSym()}  ou  amount(x)}${currencySymbol()}
  const bad = /(?:formatMoney|formatMoneyBase|amount)\([^`]*?\)\}(?:\\u00A0|\s|&nbsp;)?\$\{(?:curSym|currencySymbol)\(\)\}/;
  const hits = files(src).filter((f) => bad.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(src, f));
  assert.deepEqual(hits, [], "double symbole de devise dans : " + hits.join(", "));
});
