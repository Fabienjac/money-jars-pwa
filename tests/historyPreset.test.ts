import { test } from "node:test";
import assert from "node:assert/strict";
import { clearPreset, peekPreset, sanitizePreset, savePreset, takePreset } from "../src/historyPreset.ts";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

test("le préréglage est lu une seule fois, puis effacé", () => {
  const s = memory();
  savePreset({ from: "2026-10-01", to: "2026-10-31", tag: "alimentaire", jar: "NEC", minAmount: "100" }, s);
  assert.deepEqual(takePreset(s), { from: "2026-10-01", to: "2026-10-31", tag: "alimentaire", jar: "NEC", minAmount: "100" });
  assert.equal(takePreset(s), null);
});

test("les valeurs mal formées sont écartées (le stockage n'est pas fiable)", () => {
  assert.deepEqual(sanitizePreset({ from: "01/10/2026", to: "2026-10-31", tag: "x", jar: "nec", minAmount: "abc" }), { to: "2026-10-31", tag: "x" });
  assert.equal(sanitizePreset({ jar: "<script>" }), null);
  assert.equal(sanitizePreset(null), null);
  assert.equal(sanitizePreset("texte"), null);
  assert.equal(sanitizePreset({}), null);
});

test("stockage cassé : aucune exception", () => {
  const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => {} };
  assert.doesNotThrow(() => savePreset({ tag: "a" }, broken));
  assert.equal(takePreset(broken), null);
  const bad = memory(); bad.setItem("mjars:historyPreset", "{pas du json");
  assert.equal(takePreset(bad), null);
});

test("lecture sans effacement (initialisation jouée deux fois par React), puis effacement explicite", () => {
  const s = memory();
  savePreset({ tag: "alimentaire" }, s);
  assert.deepEqual(peekPreset(s), { tag: "alimentaire" });
  assert.deepEqual(peekPreset(s), { tag: "alimentaire" }); // une seconde lecture donne la même chose
  clearPreset(s);
  assert.equal(peekPreset(s), null);
});

test("étiquettes à inclure / exclure : listes de textes valides seulement", () => {
  assert.deepEqual(sanitizePreset({ from: "2026-10-12", tags: ["alimentaire", "restaurant"], excludeTags: ["exceptionnel"] }),
    { from: "2026-10-12", tags: ["alimentaire", "restaurant"], excludeTags: ["exceptionnel"] });
  assert.deepEqual(sanitizePreset({ from: "2026-10-12", tags: "alimentaire", excludeTags: [3, null, ""] }), { from: "2026-10-12" });
  assert.equal(sanitizePreset({ tags: [] }), null);
});
