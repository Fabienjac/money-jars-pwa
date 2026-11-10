import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { treasuryLevels, burnRates, monthsOfRunway, computeAutonomy, liquidShortfall } = await loadTs("src/autonomy.ts");

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

test("fenêtre de 30 jours : le premier jour compte même quand un changement d'heure tombe dans la fenêtre", () => {
  // Heure d'Europe centrale : le 25 octobre 2026, l'heure recule d'une heure. Du 12 octobre au 10 novembre = 30 jours.
  const previous = process.env.TZ;
  process.env.TZ = "Europe/Paris";
  try {
    const now = new Date(2026, 10, 10, 15, 0);
    const rows = [
      { date: "2026-10-12", amount: 7.39, tags: "" },   // premier jour de la fenêtre (minuit)
      { date: "2026-10-11", amount: 100, tags: "" },    // veille : hors fenêtre
      { date: "2026-11-10", amount: 10, tags: "" },     // aujourd'hui
      { date: "2026-11-11", amount: 50, tags: "" },     // demain : daté du futur, ignoré
    ];
    const b = burnRates(rows, [], now);
    assert.equal(b.regular, 17.39);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test("le jour du passage à l'heure d'été (23 h), une dépense de demain reste exclue", () => {
  const previous = process.env.TZ;
  process.env.TZ = "Europe/Paris";
  try {
    const now = new Date(2026, 2, 28, 15, 0); // 28 mars 2026, veille du passage à l'heure d'été (29 mars)
    const sunday = new Date(2026, 2, 29, 12, 0);
    const rows = [
      { date: "2026-03-28", amount: 20, tags: "" },
      { date: "2026-03-29", amount: 99, tags: "" },     // demain
    ];
    assert.equal(burnRates(rows, [], now).regular, 20);
    // et le dimanche lui-même (journée de 23 h) : la dépense du lundi est exclue
    const rows2 = [{ date: "2026-03-29", amount: 20, tags: "" }, { date: "2026-03-30", amount: 99, tags: "" }];
    assert.equal(burnRates(rows2, [], sunday).regular, 20);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test("liquidShortfall : un gros découvert d'une jarre efface les soldes positifs des autres (cas réel)", () => {
  const jarsReal = {
    NEC: { net: 1997.03, settled: 0 }, FFA: { net: 4937.81, settled: 0 }, LTSS: { net: 4937.81, settled: 0 },
    PLAY: { net: -10929.53, settled: 0 }, EDUC: { net: 4735.84, settled: 0 }, GIFT: { net: 731.11, settled: 0 },
  };
  const split = { NEC: 55, FFA: 10, LTSS: 10, PLAY: 10, EDUC: 10, GIFT: 5 };
  const s = liquidShortfall(jarsReal, split);
  assert.equal(s.amount, 3465.55);           // 1997,03 + 4735,84 + 731,11 − 10929,53
  assert.equal(s.worstJar, "PLAY");
  assert.equal(s.worstJarNet, -10929.53);
  // 80 % de chaque revenu va aux jarres courantes (55 + 10 + 10 + 5) : il faut 3465,55 / 0,8 = 4331,94 → 4332 €
  assert.equal(s.incomeNeeded, 4332);
});

test("liquidShortfall : rien à signaler quand les jarres courantes sont positives, même si l'une est négative", () => {
  const split = { NEC: 55, FFA: 10, LTSS: 10, PLAY: 10, EDUC: 10, GIFT: 5 };
  assert.equal(liquidShortfall({ NEC: { net: 5000 }, PLAY: { net: -2000 }, EDUC: { net: 100 } }, split), null);
  assert.equal(liquidShortfall({}, split), null);
  assert.equal(liquidShortfall({ NEC: { net: 0 } }, split), null);
});

test("liquidShortfall : les déficits effacés (« repartir de zéro ») ne comptent pas comme de l'argent, et répartition inconnue", () => {
  // le solde de NEC contient 500 € de déficit effacé : il vaut 100 − 500 = −400
  const s = liquidShortfall({ NEC: { net: 100, settled: 500 } }, { NEC: 0 });
  assert.equal(s.amount, 400);
  assert.equal(s.worstJar, "NEC");
  assert.equal(s.incomeNeeded, null);        // 0 % des revenus vont aux jarres courantes : impossible à combler par des revenus
});
