import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { loadFilters, saveFilters, loadTab, saveTab, sanitizeFilters } = await loadTs("src/analyticsState.ts");
const { DEFAULT_ANALYTICS_FILTERS: D } = await loadTs("src/analyticsFilters.ts");

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

test("les filtres et l'onglet survivent à un aller-retour", () => {
  const s = memory();
  const f = { ...D, period: "custom", from: "2026-10-01", to: "2026-10-31", minAmount: "50", jars: ["NEC"], tags: ["alimentaire", "loisirs"] };
  saveFilters(f, s); saveTab("tags", s);
  assert.deepEqual(loadFilters(s), f);
  assert.equal(loadTab(s), "tags");
});

test("rien de mémorisé : valeurs par défaut (Rapport, aucun filtre)", () => {
  const s = memory();
  assert.deepEqual(loadFilters(s), D);
  assert.equal(loadTab(s), "report");
});

test("valeurs invalides ou altérées : champ par champ, repli sur la valeur par défaut", () => {
  const f = sanitizeFilters({ period: "hier", from: "01/10/2026", to: "2026-10-31", minAmount: "abc", maxAmount: "12,5", jars: ["NEC", "XX", 3], tags: ["a", "a", "", 4] });
  assert.equal(f.period, "all");
  assert.equal(f.from, "");
  assert.equal(f.to, "2026-10-31");
  assert.equal(f.minAmount, "");
  assert.equal(f.maxAmount, "12,5");
  assert.deepEqual(f.jars, ["NEC"]);
  assert.deepEqual(f.tags, ["a"]);
  const s = memory(); s.setItem("mjars:analyticsTab", "autre"); s.setItem("mjars:analyticsFilters", "{pas du json");
  assert.equal(loadTab(s), "report");
  assert.deepEqual(loadFilters(s), D);
});

test("stockage cassé : aucune exception", () => {
  const broken = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
  assert.doesNotThrow(() => { saveFilters(D, broken); saveTab("subs", broken); });
  assert.equal(loadTab(broken), "report");
  assert.deepEqual(loadFilters(broken), D);
});

test("les filtres par défaut ne sont pas partagés entre appels (pas de mutation croisée)", () => {
  const a = sanitizeFilters(null); a.tags.push("x");
  assert.deepEqual(sanitizeFilters(null).tags, []);
});
