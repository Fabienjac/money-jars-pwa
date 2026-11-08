import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availableToTransfer,
  checkTransfer,
  leftoverSuggestions,
  round2,
  transferDeltas,
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
