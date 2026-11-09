import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { splitFromSettings } = await loadTs("src/jarSplit.ts");

test("splitFromSettings : pourcentages convertis en fractions", () => {
  const s = splitFromSettings([
    { key: "NEC", percent: 55, initialBalance: 0 }, { key: "FFA", percent: 10 }, { key: "GIFT", percent: "5" },
  ]);
  assert.deepEqual(s, { NEC: 0.55, FFA: 0.1, GIFT: 0.05 });
});

test("splitFromSettings : entrées vides ou mal formées → null, lignes douteuses ignorées", () => {
  assert.equal(splitFromSettings(null), null);
  assert.equal(splitFromSettings([]), null);
  assert.equal(splitFromSettings("nope"), null);
  assert.equal(splitFromSettings([{ key: 3, percent: 10 }, { percent: 10 }, { key: "NEC", percent: "abc" }]), null);
  assert.deepEqual(splitFromSettings([{ key: "NEC", percent: 60 }, null, { key: "PLAY", percent: NaN }]), { NEC: 0.6 });
});
