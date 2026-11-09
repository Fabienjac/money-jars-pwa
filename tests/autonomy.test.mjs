import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { treasuryLevels, burnRates, monthsOfRunway, computeAutonomy } = await loadTs("src/autonomy.ts");

const today = new Date(2026, 10, 9, 12, 0); // 9 novembre 2026
const jars = {
  NEC: { net: 5000, settled: 0 },
  FFA: { net: 20000, settled: 0 },
  LTSS: { net: 10000, settled: 0 },
  PLAY: { net: -2000, settled: 0 },
  EDUC: { net: 1000, settled: 0 },
  GIFT: { net: 500, settled: 0 },
};

test("trésorerie : niveau 1 = NEC+EDUC+GIFT+PLAY, niveau 2 = les six jarres", () => {
  const t = treasuryLevels(jars);
  assert.equal(t.liquid, 4500);
  assert.equal(t.total, 34500);
  assert.equal(t.liquidDeficit, 2000);
});

test("trésorerie : les déficits effacés (settled) sont retirés du solde", () => {
  const t = treasuryLevels({ ...jars, PLAY: { net: 0, settled: 10900 } });
  assert.equal(t.liquid, 5000 + 1000 + 500 - 10900);
  assert.equal(t.total, 5000 + 20000 + 10000 - 10900 + 1000 + 500);
});

test("trésorerie : jarres absentes comptées pour zéro", () => {
  const t = treasuryLevels({ NEC: { net: 100 } });
  assert.deepEqual(t, { liquid: 100, total: 100, liquidDeficit: 0 });
});

test("mois de trésorerie : division, zéro et absence de dépense", () => {
  assert.equal(monthsOfRunway(9000, 1000), 9);
  assert.equal(monthsOfRunway(-50, 1000), 0);
  assert.equal(monthsOfRunway(0, 1000), 0);
  assert.equal(monthsOfRunway(5000, 0), null);
});

// Dépenses : 1 000 € courants par mois pendant 12 mois (le 5 de chaque mois), un billet d'avion de 2 400 € il y a 2 mois.
const rows = [];
for (let m = 0; m < 12; m++) {
  const d = new Date(2026, 10 - m, 5);
  rows.push({ date: `05/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`, amount: 1000, tags: "" });
}
rows.push({ date: "20/09/2026", amount: 2400, tags: "exceptionnel" });

test("rythme courant : 30 derniers jours, hors exceptionnelles", () => {
  const b = burnRates(rows, ["exceptionnel"], today);
  assert.equal(b.regular, 1000); // seule la dépense du 05/11 tombe dans les 30 derniers jours
  assert.equal(b.shortHistory, false);
});

test("rythme avec exceptionnelles : moyenne mensuelle sur 12 mois", () => {
  const b = burnRates(rows, ["exceptionnel"], today);
  // 12 000 + 2 400 sur 12 mois (la 1re dépense du 05/12/2025 donne ~11,1 mois : on borne à la couverture réelle)
  assert.ok(b.withOneOff > 1000 && b.withOneOff < 1400, String(b.withOneOff));
  assert.ok(b.monthsCovered <= 12 && b.monthsCovered > 10);
});

test("un exceptionnel dans les 30 derniers jours n'entre pas dans le rythme courant", () => {
  const b = burnRates([...rows, { date: "01/11/2026", amount: 3000, tags: "exceptionnel" }], ["exceptionnel"], today);
  assert.equal(b.regular, 1000);
  assert.ok(b.withOneOff > burnRates(rows, ["exceptionnel"], today).withOneOff);
});

test("historique court : une seule semaine de dépenses est signalée, sans diviser par zéro", () => {
  const b = burnRates([{ date: "05/11/2026", amount: 70, tags: "" }, { date: "08/11/2026", amount: 30, tags: "" }], [], today);
  assert.equal(b.shortHistory, true);
  assert.equal(b.regular, 100);
  assert.equal(b.monthsCovered, 1);
});

test("dépenses datées du futur, hors fenêtre ou illisibles : ignorées", () => {
  const b = burnRates(
    [
      { date: "05/11/2026", amount: 100, tags: "" },
      { date: "15/12/2026", amount: 9999, tags: "" },
      { date: "01/01/2024", amount: 9999, tags: "" },
      { date: "n'importe quoi", amount: 9999, tags: "" },
    ],
    [],
    today
  );
  assert.equal(b.regular, 100);
  assert.equal(b.withOneOff, 100);
});

test("un remboursement (montant négatif) diminue le rythme", () => {
  const b = burnRates([{ date: "05/11/2026", amount: 500, tags: "" }, { date: "06/11/2026", amount: -100, tags: "" }], [], today);
  assert.equal(b.regular, 400);
});

test("aucune dépense : pas d'autonomie calculable", () => {
  const a = computeAutonomy(jars, [], [], today);
  assert.equal(a.liquidRegular, null);
  assert.equal(a.totalWithOneOff, null);
});

test("quatre combinaisons niveau × rythme", () => {
  const a = computeAutonomy(jars, rows, ["exceptionnel"], today);
  assert.equal(a.liquidRegular, 4.5);
  assert.equal(a.totalRegular, 34.5);
  assert.ok(a.liquidWithOneOff < a.liquidRegular);
  assert.ok(a.totalWithOneOff < a.totalRegular);
});

test("trésorerie négative : 0 mois", () => {
  const a = computeAutonomy({ NEC: { net: -300 } }, rows, [], today);
  assert.equal(a.liquidRegular, 0);
});
