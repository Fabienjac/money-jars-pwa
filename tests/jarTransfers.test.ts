import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustmentTotals,
  availableToTransfer,
  checkTransfer,
  deficitToForgive,
  leftoverSuggestions,
  round2,
  transferDeltas,
  yearStartPrompt,
} from "../src/jarTransfers.ts";
import { jarAlertLevel } from "../src/jarAlerts.ts";

const row = (from_jar: string, to_jar: string, amount: number | string) => ({ from_jar, to_jar, amount });

test("deltas : chaque transfert retire à la source et ajoute à la cible, somme nulle", () => {
  const d = transferDeltas([row("PLAY", "FFA", 100), row("NEC", "FFA", 50.5), row("FFA", "LTSS", 20)]);
  assert.deepEqual(d, { NEC: -50.5, FFA: 130.5, LTSS: 20, PLAY: -100, EDUC: 0, GIFT: 0 });
  assert.equal(Object.values(d).reduce((a, b) => a + b, 0), 0);
});

test("deltas : montants en texte (numeric de Supabase), lignes invalides ignorées, pas de dérive de virgule", () => {
  const d = transferDeltas([
    row("PLAY", "FFA", "0.1"),
    row("PLAY", "FFA", "0.2"),
    row("PLAY", "PLAY", 500), // même jarre
    row("PLAY", "XXX", 500), // jarre inconnue
    row("PLAY", "FFA", -30), // négatif
    row("PLAY", "FFA", "abc"),
  ]);
  assert.equal(d.FFA, 0.3);
  assert.equal(d.PLAY, -0.3);
  assert.deepEqual(transferDeltas(null), { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 });
});

test("montant disponible : solde positif arrondi au centime inférieur, jamais négatif", () => {
  assert.equal(availableToTransfer(340.129), 340.12);
  assert.equal(availableToTransfer(0), 0);
  assert.equal(availableToTransfer(-5), 0);
  assert.equal(availableToTransfer(NaN), 0);
  assert.equal(availableToTransfer(0.3), 0.3);
});

test("contrôle : même jarre, montant invalide, dépassement du solde", () => {
  const base = { from: "PLAY", to: "FFA", amount: 50, fromNet: 80 } as const;
  assert.equal(checkTransfer(base), null);
  assert.equal(checkTransfer({ ...base, to: "PLAY" }), "sameJar");
  assert.equal(checkTransfer({ ...base, amount: 0 }), "amount");
  assert.equal(checkTransfer({ ...base, amount: -3 }), "amount");
  assert.equal(checkTransfer({ ...base, amount: NaN }), "amount");
  assert.equal(checkTransfer({ ...base, amount: 80.01 }), "insufficient");
  assert.equal(checkTransfer({ ...base, amount: 80 }), null); // tout le solde
  assert.equal(checkTransfer({ ...base, fromNet: -10 }), "insufficient"); // jarre en déficit : rien à déplacer
});

test("reste non dépensé : seules les jarres de dépense avec un solde positif", () => {
  const s = leftoverSuggestions({
    NEC: { revenues: 1000, spendings: 650.5 },
    EDUC: { revenues: 100, spendings: 100 },
    PLAY: { revenues: 100, spendings: 250 },
    GIFT: { revenues: 80, spendings: 10 },
    FFA: { revenues: 500, spendings: 0 }, // épargne : pas proposée
  });
  assert.deepEqual(s, [{ jar: "NEC", amount: 349.5 }, { jar: "GIFT", amount: 70 }]);
  assert.deepEqual(leftoverSuggestions(null), []);
});

test("effet sur les alertes : vider une jarre vers l'épargne n'alerte pas, une dépense en trop ensuite oui", () => {
  // NEC : 550 alloués, 400 dépensés, 150 versés à l'épargne → solde 0 mais choix volontaire : pas d'alerte
  assert.equal(jarAlertLevel({ revenues: 400, spendings: 400, transferOut: 150 }).level, 0);
  // le solde réel reste celui de la jarre : 10 de plus dépensés = dépassée
  const over = jarAlertLevel({ revenues: 400, spendings: 410, transferOut: 150 });
  assert.equal(over.level, 2);
  assert.equal(over.net, -10);
  // versement partiel : 450 alloués après transfert de 100, 400 dépensés → 73 % du plan d'origine, pas d'alerte
  assert.equal(jarAlertLevel({ revenues: 450, spendings: 400, transferOut: 100 }).level, 0);
  // sans transfert, le comportement ne change pas
  assert.equal(jarAlertLevel({ revenues: 400, spendings: 400 }).level, 1);
});

test("effet sur les alertes : combler un déficit depuis l'épargne le ramène à zéro (épuisée), plus dépassée", () => {
  assert.equal(jarAlertLevel({ revenues: 100, spendings: 300 }).level, 2);
  assert.equal(jarAlertLevel({ revenues: 100 + 200, spendings: 300 }).level, 1);
});

test("round2", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(12.345678), 12.35);
  assert.equal(round2(-0.004), -0);
});

test("déficit à effacer : ce qui manque pour revenir à zéro, arrondi au centime supérieur", () => {
  assert.equal(deficitToForgive(-10929.534), 10929.54);
  assert.equal(deficitToForgive(-200), 200);
  assert.equal(deficitToForgive(0), 0);
  assert.equal(deficitToForgive(-0.004), 0); // tolérance au centime
  assert.equal(deficitToForgive(35), 0); // pas de déficit
  assert.equal(deficitToForgive(NaN), 0);
});

test("ajustements : totaux par jarre au centime, lignes invalides ignorées", () => {
  const t = adjustmentTotals([
    { jar: "PLAY", amount: "0.1" },
    { jar: "PLAY", amount: "0.2" },
    { jar: "NEC", amount: 50 },
    { jar: "XXX", amount: 50 },
    { jar: "GIFT", amount: -5 },
  ]);
  assert.deepEqual(t, { NEC: 50, FFA: 0, LTSS: 0, PLAY: 0.3, EDUC: 0, GIFT: 0 });
  assert.deepEqual(adjustmentTotals(null), { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 });
});

test("repartir de zéro : la jarre n'est pas « épuisée », elle repart ; une nouvelle dépense la dépasse vraiment", () => {
  // PLAY : 100 alloués, 300 dépensés → déficit 200, dépassée
  assert.equal(jarAlertLevel({ revenues: 100, spendings: 300 }).level, 2);
  // déficit effacé : 300 de solde, 300 dépensés dont 200 pardonnés → 33 %, aucune alerte
  const reset = jarAlertLevel({ revenues: 300, spendings: 300, settled: 200 });
  assert.equal(reset.level, 0);
  assert.equal(reset.net, 0);
  // 20 de plus dépensés ensuite : solde réel négatif → dépassée
  assert.equal(jarAlertLevel({ revenues: 300, spendings: 320, settled: 200 }).level, 2);
  // après de nouveaux revenus, la jarre se remplit : 400 de solde, 190 réellement dépensés depuis → 47 %, rien
  assert.equal(jarAlertLevel({ revenues: 400, spendings: 390, settled: 200 }).level, 0);
  // et le seuil de 80 % se mesure bien hors dépenses pardonnées : 350 comptés sur 400 → presque épuisée
  assert.equal(jarAlertLevel({ revenues: 400, spendings: 400, settled: 50 }).level, 1);
});

test("rappel de janvier : seulement en janvier, une fois par an, et s'il y a quelque chose à faire", () => {
  const jars = {
    NEC: { revenues: 1000, spendings: 650 }, // 350 à verser
    PLAY: { revenues: 100, spendings: 300 }, // déficit 200
    FFA: { revenues: 500, spendings: 0 }, // épargne : pas proposée
  };
  const jan = new Date(2027, 0, 5);
  const p = yearStartPrompt({ now: jan, jars });
  assert.deepEqual(p, { leftover: 350, deficits: [{ jar: "PLAY", amount: 200 }] });
  assert.equal(yearStartPrompt({ now: new Date(2027, 1, 1), jars }), null); // février
  assert.equal(yearStartPrompt({ now: new Date(2026, 11, 31), jars }), null); // décembre
  assert.equal(yearStartPrompt({ now: jan, jars, dismissedYear: 2027 }), null); // déjà écarté cette année
  assert.notEqual(yearStartPrompt({ now: jan, jars, dismissedYear: 2026 }), null); // écarté l'an dernier seulement
  assert.equal(yearStartPrompt({ now: jan, jars: { NEC: { revenues: 100, spendings: 100 } } }), null); // rien à faire
  assert.equal(yearStartPrompt({ now: jan, jars: null }), null);
});
