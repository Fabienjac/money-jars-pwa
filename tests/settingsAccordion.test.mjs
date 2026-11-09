import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { initialOpenIds, toggleOpenId, parseOpenIds, percentsSummary } = await loadTs("src/settingsAccordion.ts");

test("premier passage : seul le bloc des jarres est ouvert", () => {
  assert.deepEqual(initialOpenIds({ seen: false, stored: null }), ["jars"]);
  // même si une liste traîne en session, le premier passage reste celui des jarres
  assert.deepEqual(initialOpenIds({ seen: false, stored: ["tags"] }), ["jars"]);
});

test("passages suivants : tout replié, sauf ce qui a été ouvert pendant la session", () => {
  assert.deepEqual(initialOpenIds({ seen: true, stored: null }), []);
  assert.deepEqual(initialOpenIds({ seen: true, stored: ["tags", "rules"] }), ["tags", "rules"]);
});

test("un lien venu d'un autre écran ouvre son bloc, sans doublon", () => {
  assert.deepEqual(initialOpenIds({ seen: true, stored: null, forced: ["xfer"] }), ["xfer"]);
  assert.deepEqual(initialOpenIds({ seen: true, stored: ["xfer"], forced: ["xfer"] }), ["xfer"]);
  assert.deepEqual(initialOpenIds({ seen: false, stored: null, forced: ["xfer"] }), ["jars", "xfer"]);
});

test("toggleOpenId ouvre puis referme", () => {
  assert.deepEqual(toggleOpenId([], "tags"), ["tags"]);
  assert.deepEqual(toggleOpenId(["tags", "rules"], "tags"), ["rules"]);
});

test("parseOpenIds : liste valide ou null", () => {
  assert.deepEqual(parseOpenIds('["a","b"]'), ["a", "b"]);
  assert.deepEqual(parseOpenIds('["a",3,null]'), ["a"]);
  assert.equal(parseOpenIds(null), null);
  assert.equal(parseOpenIds("{"), null);
  assert.equal(parseOpenIds('{"a":1}'), null);
});

test("percentsSummary : répartition lisible", () => {
  assert.equal(percentsSummary([55, 10, 10, 10, 10, 5].map((percent) => ({ percent }))), "55 / 10 / 10 / 10 / 10 / 5 %");
  assert.equal(percentsSummary([{ percent: 33.333 }, { percent: "x" }, { percent: 66.667 }]), "33.33 / 66.67 %");
  assert.equal(percentsSummary([]), "");
});
