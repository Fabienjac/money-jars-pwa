import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { JAR_KEYS, normalizeJar } = await loadTs("src/jarValidation.ts");

test("les six clés de jarre sont reconnues, casse et espaces tolérés", () => {
  assert.deepEqual([...JAR_KEYS], ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"]);
  for (const k of JAR_KEYS) assert.equal(normalizeJar(k), k);
  assert.equal(normalizeJar(" nec "), "NEC");
  assert.equal(normalizeJar("play"), "PLAY");
});

test("tout le reste est refusé : un tag, un mot, du vide, un autre type", () => {
  assert.equal(normalizeJar("VIE_QUOTIDIENNE"), null);   // le cas réel : un tag à la place de la jarre
  assert.equal(normalizeJar("vie_quotidienne"), null);
  assert.equal(normalizeJar("Nécessités"), null);
  assert.equal(normalizeJar(""), null);
  assert.equal(normalizeJar("   "), null);
  assert.equal(normalizeJar(undefined), null);
  assert.equal(normalizeJar(null), null);
  assert.equal(normalizeJar(3), null);
  assert.equal(normalizeJar(["NEC"]), null);
});
