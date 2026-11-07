import { test } from "node:test";
import assert from "node:assert/strict";
import { saveImportedTransactions, normalizeToISO, extractCurrencyFromMethod, type ImportSaveDeps } from "../src/importSave.ts";

function makeDeps(over: Partial<ImportSaveDeps> = {}) {
  const spendings: any[] = [];
  const revenues: any[] = [];
  const deps: ImportSaveDeps = {
    appendSpending: async (row) => { spendings.push(row); return { ok: true }; },
    appendRevenue: async (row) => { revenues.push(row); return { ok: true }; },
    getRateToBase: async (cur) => (cur === "USD" ? 0.9 : cur === "BTC" ? 50000 : null),
    baseCurrency: "EUR",
    formatRevenueValue: (a, c) => `${a} ${c}`,
    rateFailMessage: (c, b) => `no rate ${c}->${b}`,
    fallbackError: "db error",
    ...over,
  };
  return { deps, spendings, revenues };
}

test("normalizeToISO", () => {
  assert.equal(normalizeToISO("2026-03-15"), "2026-03-15");
  assert.equal(normalizeToISO("2026-03-15T10:00:00"), "2026-03-15");
  assert.equal(normalizeToISO("5/3/2026"), "2026-03-05");
  assert.equal(normalizeToISO("04 September 2025, 12:00pm"), "2025-09-04");
  assert.equal(normalizeToISO("n'importe quoi"), "");
  assert.equal(normalizeToISO(""), "");
});

test("extractCurrencyFromMethod", () => {
  assert.equal(extractCurrencyFromMethod("USDC_ETH"), "USDC");
  assert.equal(extractCurrencyFromMethod("Virement BTC"), "BTC");
  assert.equal(extractCurrencyFromMethod("Virement SEPA"), null);
  assert.equal(extractCurrencyFromMethod(""), null);
});

test("dépenses : payload envoyé à la base (date ISO, montant positif, bocal par défaut)", async () => {
  const { deps, spendings } = makeDeps();
  const report = await saveImportedTransactions(
    [
      { date: "2026-03-01", description: "Carrefour", amount: 23.4, suggestedJar: "NEC", suggestedAccount: "Visa", tags: "alimentaire" },
      { date: "02/03/2026", description: "Cinéma", amount: 12, suggestedJar: undefined },
    ],
    "spending",
    deps
  );
  assert.deepEqual(report, { successCount: 2, errorCount: 0, failures: [] });
  assert.deepEqual(spendings[0], { date: "2026-03-01", jar: "NEC", account: "Visa", amount: 23.4, description: "Carrefour", tags: "alimentaire", subscription: "" });
  assert.equal(spendings[1].date, "2026-03-02");
  assert.equal(spendings[1].jar, "NEC"); // la colonne jar est NOT NULL en base
  assert.equal(spendings[1].account, "");
});

test("dépenses : lignes inutilisables comptées en échec sans bloquer les autres", async () => {
  const { deps, spendings } = makeDeps({
    appendSpending: async (row) => (row.description === "KO" ? { ok: false, error: "rls" } : (spendings.push(row), { ok: true })),
  });
  const seen: string[] = [];
  deps.onFailure = (i, _t, reason) => seen.push(`${i}:${reason}`);
  const report = await saveImportedTransactions(
    [
      { date: "", description: "sans date", amount: 5 },
      { date: "2026-03-01", description: "sans montant", amount: NaN },
      { date: "2026-03-01", description: "KO", amount: 5 },
      { date: "2026-03-01", description: "OK", amount: 5 },
    ],
    "spending",
    deps
  );
  assert.equal(report.successCount, 1);
  assert.equal(report.errorCount, 3);
  assert.deepEqual(seen, ["0:invalid date", "1:invalid amount", "2:rls"]);
  assert.equal(spendings.length, 1);
});

test("dépenses : une exception réseau n'arrête pas l'import", async () => {
  let n = 0;
  const { deps } = makeDeps({ appendSpending: async () => { if (n++ === 0) throw new Error("network"); return { ok: true }; } });
  const report = await saveImportedTransactions(
    [{ date: "2026-03-01", description: "a", amount: 1 }, { date: "2026-03-02", description: "b", amount: 2 }],
    "spending",
    deps
  );
  assert.equal(report.successCount, 1);
  assert.deepEqual(report.failures, [{ index: 0, reason: "network" }]);
});

test("dépenses : la série quotidienne n'est mise à jour que pour les dépenses enregistrées", async () => {
  let streak = 0;
  const { deps } = makeDeps({ onSpendingSaved: () => { streak++; } });
  await saveImportedTransactions([{ date: "2026-03-01", description: "a", amount: 1 }], "spending", deps);
  await saveImportedTransactions([{ date: "2026-03-01", source: "x", amount: 10, suggestedSource: "Salaire" }], "revenue", deps);
  assert.equal(streak, 1);
});

test("revenus : conversion vers la devise de référence, montant d'origine conservé", async () => {
  const { deps, revenues } = makeDeps();
  const report = await saveImportedTransactions(
    [
      { date: "2026-03-01", amount: 1000, valeur: "EUR", suggestedSource: "Salaire" },
      { date: "2026-03-02", amount: 100, valeur: "USD", suggestedSource: "Client US" },
    ],
    "revenue",
    deps
  );
  assert.equal(report.successCount, 2);
  assert.equal(revenues[0].amount, 1000);
  assert.equal(revenues[1].amount, 90);
  assert.equal(revenues[1].value, "100 USD");
  assert.equal(revenues[1].source, "Client US");
});

test("revenus : devise sans taux → échec explicite, pas d'écriture", async () => {
  const { deps, revenues } = makeDeps();
  const report = await saveImportedTransactions([{ date: "2026-03-01", amount: 100, valeur: "XYZ", suggestedSource: "?" }], "revenue", deps);
  assert.equal(report.errorCount, 1);
  assert.equal(report.failures[0].reason, "no rate XYZ->EUR");
  assert.equal(revenues.length, 0);
});

test("revenus crypto : prix unitaire déduit de la quantité", async () => {
  const { deps, revenues } = makeDeps();
  await saveImportedTransactions(
    [{ date: "2026-03-01", amount: 100, valeur: "EUR", quantiteCrypto: 0.002, methodeCrypto: "BTC", suggestedSource: "Mining" }],
    "revenue",
    deps
  );
  assert.equal(revenues[0].rate, 50000);
  assert.equal(revenues[0].method, "BTC");
});

test("revenus en USDT (4 lettres) : converti, pas pris pour la devise de référence", async () => {
  const { deps, revenues } = makeDeps({ getRateToBase: async (cur) => (cur === "USDT" ? 0.92 : null) });
  const report = await saveImportedTransactions([{ date: "2026-03-01", amount: 100, valeur: "USDT", suggestedSource: "Client" }], "revenue", deps);
  assert.equal(report.successCount, 1);
  assert.equal(revenues[0].amount, 92);
  assert.equal(revenues[0].value, "100 USDT");
});
