import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { DEFAULT_ANALYTICS_FILTERS: D, countActiveFilters, filterByPeriod, filterSpendingRows, periodDays, toHistoryPreset } = await loadTs("src/analyticsFilters.ts");
const { parseAppDate } = await loadTs("src/historyPeriod.ts");

const now = new Date(2026, 10, 8, 14, 0); // 8 novembre 2026
// dates telles que l'application les lit en base : JJ/MM/AAAA
const sp = (date, amount, jar = "NEC", tags = "") => ({ date, amount, jar, tags });
const rows = [
  sp("07/11/2026", 24.2, "NEC", "alimentaire"),
  sp("18/09/2026", 599.37, "NEC", "loisirs,exceptionnel"),
  sp("05/03/2026", 12, "PLAY", ""),
  sp("01/11/2026", 100, "PLAY", "exceptionnel"),
];

test("dates JJ/MM/AAAA lues correctement (jour > 12 inclus, et jour ≤ 12 pas confondu avec le mois)", () => {
  assert.equal(parseAppDate("18/09/2026").getTime(), new Date(2026, 8, 18).getTime());
  assert.equal(parseAppDate("07/11/2026").getTime(), new Date(2026, 10, 7).getTime()); // 7 novembre, pas 11 juillet
  assert.equal(parseAppDate("2026-10-05").getTime(), new Date(2026, 9, 5).getTime());
  assert.equal(parseAppDate("n'importe quoi"), null);
});

test("période : 90 jours garde le 18/09 (50 jours) et écarte le 05/03 ; le filtre ne perd plus les jours > 12", () => {
  const out = filterSpendingRows(rows, { ...D, period: "90d" }, now);
  assert.deepEqual(out.map((r) => r.date), ["07/11/2026", "18/09/2026", "01/11/2026"]);
  assert.equal(filterSpendingRows(rows, { ...D, period: "month" }, now).length, 2); // 7 et 1er novembre
});

test("période personnalisée : bornes incluses ; montant min/max ; jarre ; étiquette (au moins une)", () => {
  assert.equal(filterSpendingRows(rows, { ...D, period: "custom", from: "2026-09-18", to: "2026-09-18" }, now).length, 1);
  assert.equal(filterSpendingRows(rows, { ...D, minAmount: "100" }, now).length, 2);
  assert.equal(filterSpendingRows(rows, { ...D, minAmount: "100", maxAmount: "200" }, now).length, 1);
  assert.equal(filterSpendingRows(rows, { ...D, jars: ["PLAY"] }, now).length, 2);
  assert.equal(filterSpendingRows(rows, { ...D, tags: ["loisirs", "alimentaire"] }, now).length, 2);
});

test("« hors exceptionnelles » écarte toute dépense qui porte l'étiquette, même avec une autre sélectionnée", () => {
  const out = filterSpendingRows(rows, { ...D, tags: ["loisirs"] }, now, ["exceptionnel"]);
  assert.equal(out.length, 0);
  assert.equal(filterSpendingRows(rows, D, now, ["exceptionnel"]).length, 2);
});

test("revenus : période seule", () => {
  const revs = [{ date: "01/11/2026" }, { date: "05/03/2026" }];
  assert.equal(filterByPeriod(revs, { ...D, period: "90d" }, now).length, 1);
});

test("filtres actifs comptés", () => {
  assert.equal(countActiveFilters(D), 0);
  assert.equal(countActiveFilters({ ...D, period: "custom" }), 0); // personnalisé sans dates : pas de filtre
  assert.equal(countActiveFilters({ ...D, period: "90d", minAmount: "5", jars: ["NEC"], tags: ["a"] }, true), 5);
});

test("nombre de jours : période bornée jusqu'à aujourd'hui, sinon plage des dépenses", () => {
  assert.equal(periodDays({ ...D, period: "month" }, rows, now), 8); // 1er → 8 novembre
  assert.equal(periodDays({ ...D, period: "custom", from: "2026-10-01", to: "2026-10-31" }, rows, now), 31);
  const all = periodDays(D, rows, now); // 05/03 → 07/11
  assert.equal(all, Math.round((new Date(2026, 10, 7) - new Date(2026, 2, 5)) / 86400000) + 1);
  assert.equal(periodDays(D, [], now), 30);
});

test("passage à l'Historique : dates, une seule étiquette / jarre, minimum", () => {
  const p = toHistoryPreset({ ...D, period: "month", tags: ["alimentaire"], jars: ["NEC"], minAmount: "50" }, now);
  assert.deepEqual(p, { from: "2026-11-01", to: "2026-11-08", tag: "alimentaire", jar: "NEC", minAmount: "50" });
  assert.deepEqual(toHistoryPreset(D, now), {});
  assert.deepEqual(toHistoryPreset({ ...D, tags: ["a", "b"], jars: ["NEC", "PLAY"] }, now), {}); // plusieurs : pas transmis
  assert.deepEqual(toHistoryPreset({ ...D, period: "custom", from: "2026-10-01" }, now), { from: "2026-10-01" });
  assert.equal(toHistoryPreset(D, now, "loisirs").tag, "loisirs"); // étiquette cliquée dans la liste
});
