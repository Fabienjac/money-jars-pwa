import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDbTotals, revenueAmount, totalsFromRows } from "../src/jarTotals.ts";

test("réponse de la base : dépenses par jarre et total des revenus, jarres absentes à zéro", () => {
  const t = parseDbTotals({ spending: { EDUC: 55688.87, GIFT: "2269.80", NEC: 49488.75, PLAY: 34680.84 }, revenue_total: "169767.19" });
  assert.deepEqual(t, {
    spending: { NEC: 49488.75, FFA: 0, LTSS: 0, PLAY: 34680.84, EDUC: 55688.87, GIFT: 2269.8 },
    revenueTotal: 169767.19,
  });
});

test("aucune dépense : objet vide accepté ; jarre inconnue ignorée", () => {
  assert.deepEqual(parseDbTotals({ spending: {}, revenue_total: 0 }), {
    spending: { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 },
    revenueTotal: 0,
  });
  assert.equal(parseDbTotals({ spending: { VIE_QUOTIDIENNE: 5 }, revenue_total: 1 })!.spending.NEC, 0);
});

test("forme inattendue : null, pour que l'application retombe sur l'ancienne lecture", () => {
  assert.equal(parseDbTotals(null), null);
  assert.equal(parseDbTotals("x"), null);
  assert.equal(parseDbTotals({}), null);
  assert.equal(parseDbTotals({ spending: {} }), null); // pas de total de revenus
  assert.equal(parseDbTotals({ spending: [], revenue_total: 1 }), null);
  assert.equal(parseDbTotals({ spending: { NEC: "abc" }, revenue_total: 1 }), null);
  assert.equal(parseDbTotals({ spending: {}, revenue_total: "n/a" }), null);
});

test("repli : même résultat que la base sur les mêmes lignes (montant, ou quantité × cours sans montant)", () => {
  const sp = [{ jar: "NEC", amount: "10.5" }, { jar: "NEC", amount: 4.5 }, { jar: "PLAY", amount: 20 }, { jar: "VIE_QUOTIDIENNE", amount: 99 }];
  const rv = [{ amount: 100, rate: 0.9 }, { amount: null, crypto_quantity: 2, rate: 10 }, { amount: "0.5" }];
  const t = totalsFromRows(sp, rv);
  assert.deepEqual(t.spending, { NEC: 15, FFA: 0, LTSS: 0, PLAY: 20, EDUC: 0, GIFT: 0 });
  assert.equal(t.revenueTotal, 120.5);
  assert.equal(revenueAmount({ amount: null }), 0); // ni montant ni crypto : 0, pas NaN
});
