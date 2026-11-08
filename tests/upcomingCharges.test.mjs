import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { nextOccurrence, totalUpcoming, upcomingCharges } = await loadTs("src/upcomingCharges.ts");

const today = new Date(2026, 10, 8, 15, 0); // 8 novembre 2026
const d = (y, m, day) => new Date(y, m - 1, day);
const item = (over) => ({
  key: "x", description: "Netflix", avgAmount: 13.49, monthlyAmount: 13.49, lastAmount: 13.49, occurrences: 6, uniqueMonths: 6,
  isFixed: true, account: "Revolut", lastDate: "05/10/2026", ...over,
});

test("mensuel : dernier prélèvement le 5 octobre → prochain le 5 décembre (le 5 novembre est passé)", () => {
  assert.equal(nextOccurrence(d(2026, 10, 5), 1, today).getTime(), d(2026, 12, 5).getTime());
  // prélèvement attendu aujourd'hui : compté (0 jour)
  assert.equal(nextOccurrence(d(2026, 10, 8), 1, today).getTime(), d(2026, 11, 8).getTime());
});

test("trimestriel, semestriel, annuel", () => {
  assert.equal(nextOccurrence(d(2026, 8, 20), 3, today).getTime(), d(2026, 11, 20).getTime());
  assert.equal(nextOccurrence(d(2026, 5, 15), 6, today).getTime(), d(2026, 11, 15).getTime());
  assert.equal(nextOccurrence(d(2025, 12, 1), 12, today).getTime(), d(2026, 12, 1).getTime());
});

test("fin de mois : le 31 se ramène au dernier jour sans dériver ensuite", () => {
  const feb = new Date(2026, 1, 10);
  assert.equal(nextOccurrence(d(2026, 1, 31), 1, feb).getTime(), d(2026, 2, 28).getTime());
  assert.equal(nextOccurrence(d(2026, 1, 31), 1, new Date(2026, 2, 1)).getTime(), d(2026, 3, 31).getTime()); // pas le 28 mars
});

test("horizon de 30 jours, tri par date, total, montant variable approximatif", () => {
  const items = [
    item({ key: "a", description: "Loyer box", lastDate: "20/10/2026", lastAmount: 60, avgAmount: 60 }), // 20 novembre : 12 j
    item({ key: "b", description: "Netflix", lastDate: "05/10/2026" }), // 5 décembre : 27 j
    item({ key: "c", description: "Assurance", lastDate: "01/12/2025", freq: "annuel", lastAmount: 300, avgAmount: 300 }), // 1er déc. : 23 j
    item({ key: "d", description: "Antivirus", lastDate: "02/04/2026", freq: "annuel" }), // avril : hors horizon
    item({ key: "e", description: "Électricité", lastDate: "10/10/2026", isFixed: false, lastAmount: 80, avgAmount: 95 }), // 10 novembre : 2 j
  ];
  const out = upcomingCharges(items, today);
  assert.deepEqual(out.map((c) => c.description), ["Électricité", "Loyer box", "Assurance", "Netflix"]);
  assert.deepEqual(out.map((c) => c.inDays), [2, 12, 23, 27]);
  assert.equal(out[0].amount, 95); // variable : la moyenne, pas le dernier montant
  assert.equal(out[0].approximate, true);
  assert.equal(out[1].approximate, false);
  assert.ok(Math.abs(totalUpcoming(out) - (95 + 60 + 300 + 13.49)) < 1e-9);
});

test("date illisible ignorée ; mois à venir en changement d'année", () => {
  assert.equal(upcomingCharges([item({ lastDate: "n'importe quoi" })], today).length, 0);
  const dec = new Date(2026, 11, 20);
  const out = upcomingCharges([item({ lastDate: "05/12/2026" })], dec);
  assert.equal(out[0].date.getTime(), d(2027, 1, 5).getTime());
  assert.equal(out[0].inDays, 16);
});
