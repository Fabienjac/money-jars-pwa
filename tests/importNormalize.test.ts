import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAmount, detectDecimal, parseDate, detectDateOrder, inferExpenseSign,
  addNetAmountColumn, suggestColumns, NET_AMOUNT_COLUMN,
} from "../src/importNormalize.ts";

test("parseAmount: formats courants", () => {
  const cases: Array<[unknown, number | null]> = [
    ["45.00", 45], ["45,00", 45], ["1 234,56", 1234.56], ["1 234,56", 1234.56], ["1.234,56", 1234.56],
    ["1,234.56", 1234.56], ["1'234.56", 1234.56], ["-45,00 €", -45], ["€ -45.10", -45.1], ["$1,234", 1234],
    ["(45.00)", -45], ["45.00-", -45], ["−45.00", -45], ["45.00 DR", -45], ["USD 12.5", 12.5],
    ["1.234.567,89", 1234567.89], ["0,123", 0.123], ["12", 12], [12.5, 12.5], ["", null], ["abc", null], [null, null],
  ];
  for (const [input, expected] of cases) assert.equal(parseAmount(input), expected, JSON.stringify(input));
});

test("parseAmount: l'indice de colonne tranche les cas ambigus", () => {
  assert.equal(parseAmount("1,234", ","), 1.234);
  assert.equal(parseAmount("1,234", "."), 1234);
  assert.equal(parseAmount("1,234.56", ","), 1234.56);
});

test("detectDecimal", () => {
  assert.equal(detectDecimal(["1 234,56", "12,5"]), ",");
  assert.equal(detectDecimal(["1,234.56", "12.5"]), ".");
  assert.equal(detectDecimal(["1,234", "2,500"]), null);
  assert.equal(detectDecimal(["10", "20"]), null);
});

test("parseDate: formats", () => {
  assert.equal(parseDate("2026-03-15"), "2026-03-15");
  assert.equal(parseDate("2026-03-15 10:22:01"), "2026-03-15");
  assert.equal(parseDate("20260315120000[0:GMT]"), "2026-03-15");
  assert.equal(parseDate("15/03/2026"), "2026-03-15");
  assert.equal(parseDate("03/15/2026", "MDY"), "2026-03-15");
  assert.equal(parseDate("03/04/2026", "DMY"), "2026-04-03");
  assert.equal(parseDate("03/04/2026", "MDY"), "2026-03-04");
  assert.equal(parseDate("15.03.26"), "2026-03-15");
  assert.equal(parseDate("15 mars 2026"), "2026-03-15");
  assert.equal(parseDate("15-Mar-26"), "2026-03-15");
  assert.equal(parseDate("26 May 2025, 11:40am"), "2025-05-26");
  assert.equal(parseDate("March 15, 2026"), "2026-03-15");
  assert.equal(parseDate("15 März 2026"), "2026-03-15");
  assert.equal(parseDate(46096), "2026-03-15");
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseDate("pas une date"), null);
  assert.equal(parseDate(""), null);
});

test("detectDateOrder", () => {
  assert.deepEqual(detectDateOrder(["25/03/2026", "01/04/2026"]), { order: "DMY", ambiguous: false });
  assert.deepEqual(detectDateOrder(["03/25/2026", "04/01/2026"]), { order: "MDY", ambiguous: false });
  assert.deepEqual(detectDateOrder(["2026-03-25", "2026-04-01"]), { order: "YMD", ambiguous: false });
  assert.deepEqual(detectDateOrder(["03/04/2026", "05/06/2026"]), { order: "DMY", ambiguous: true });
  assert.deepEqual(detectDateOrder(["03/04/2026"], "MDY"), { order: "MDY", ambiguous: true });
});

test("inferExpenseSign", () => {
  assert.equal(inferExpenseSign([-10, -20, 500]), "negative");
  assert.equal(inferExpenseSign([10, 20]), "positive"); // un seul signe : dépenses
  assert.equal(inferExpenseSign([-10, -20]), "negative");
  assert.equal(inferExpenseSign([-10, 10]), "negative");
  // carte de crédit : achats positifs très majoritaires, un paiement négatif
  assert.equal(inferExpenseSign([10, 20, 5, 8, 12, 30, -500]), "positive");
  // petit relevé avec surtout des intérêts : la convention bancaire l'emporte
  assert.equal(inferExpenseSign([0.11, 0.12, 0.05, -62.5]), "negative");
  assert.equal(inferExpenseSign([10, 20, -500]), "negative");
});

import { resolveReading, DEFAULT_READ_OPTIONS } from "../src/importNormalize.ts";

test("resolveReading : la colonne crédit − débit a un sens connu (sortie = dépense)", () => {
  const rows = [
    { Date: "2026-09-01", [NET_AMOUNT_COLUMN]: "0.11" },
    { Date: "2026-10-01", [NET_AMOUNT_COLUMN]: "0.12" },
    { Date: "2026-10-09", [NET_AMOUNT_COLUMN]: "-62.5" },
    { Date: "2026-11-01", [NET_AMOUNT_COLUMN]: "0.05" },
  ];
  assert.equal(resolveReading(rows, "Date", NET_AMOUNT_COLUMN, DEFAULT_READ_OPTIONS).expenseSign, "negative");
  // le choix manuel de l'utilisateur reste prioritaire
  assert.equal(resolveReading(rows, "Date", NET_AMOUNT_COLUMN, { ...DEFAULT_READ_OPTIONS, expenseSign: "positive" }).expenseSign, "positive");
});

test("addNetAmountColumn: débit / crédit séparés", () => {
  const headers = ["Date", "Libellé", "Débit", "Crédit"];
  const rows = [
    { Date: "01/03/2026", Libellé: "Café", Débit: "3,50", Crédit: "" },
    { Date: "02/03/2026", Libellé: "Salaire", Débit: "", Crédit: "2 000,00" },
    { Date: "03/03/2026", Libellé: "Loyer", Débit: "-800,00", Crédit: "" },
  ];
  const res = addNetAmountColumn(headers, rows);
  assert.ok(res.added);
  assert.deepEqual(res.rows.map((r) => r[NET_AMOUNT_COLUMN]), ["-3.5", "2000", "-800"]);
  assert.equal(addNetAmountColumn(["Date", "Amount"], [{ Date: "x", Amount: "1" }]).added, false);
  assert.equal(addNetAmountColumn(["Credit Card", "Debit"], [{ "Credit Card": "1234", Debit: "5" }]).added, false);
});

test("suggestColumns: FR, EN, DE", () => {
  const fr = suggestColumns(["Date opération", "Date valeur", "Libellé", "Montant", "Solde"], [
    { "Date opération": "01/03/2026", "Date valeur": "02/03/2026", Libellé: "CB Carrefour", Montant: "-23,40", Solde: "1 000,00" },
  ]);
  assert.deepEqual(fr, { Date: "Date opération", Montant: "Montant", Description: "Libellé" });

  const en = suggestColumns(["Type", "Started Date", "Completed Date", "Description", "Amount", "Fee", "Currency", "State", "Balance"], [
    { Type: "CARD_PAYMENT", "Started Date": "2026-03-01 10:00:00", "Completed Date": "2026-03-02 09:00:00", Description: "Uber", Amount: "-12.50", Fee: "0.00", Currency: "GBP", State: "COMPLETED", Balance: "100.00" },
  ]);
  assert.equal(en.Date, "Completed Date");
  assert.equal(en.Montant, "Amount");
  assert.equal(en.Description, "Description");
  assert.equal(en.Devise, "Currency");

  const de = suggestColumns(["Buchungstag", "Wertstellung", "Verwendungszweck", "Betrag"], [
    { Buchungstag: "15.03.2026", Wertstellung: "16.03.2026", Verwendungszweck: "REWE Markt", Betrag: "-45,10" },
  ]);
  assert.deepEqual(de, { Date: "Buchungstag", Montant: "Betrag", Description: "Verwendungszweck" });
});

import { findCancelledExpenses } from "../src/importNormalize.ts";

test("findCancelledExpenses: reversas avec même référence, remboursement marchand", () => {
  const lines = [
    { date: "2026-04-08", amount: -0.14, description: "DB ITBMS 000418" },
    { date: "2026-04-08", amount: -100, description: "DB RETIRO SIN TARJETA BANISTMO 000418" },
    { date: "2026-04-08", amount: 0.14, description: "CR REVERSA DE ITBMS 000418" },
    { date: "2026-04-08", amount: 100, description: "CR RETIRO SIN TARJETA BANISTMO NO EJECUTADO 000418" },
    { date: "2026-04-08", amount: -100, description: "DB RETIRO SIN TARJETA BANISTMO 000419" }, // pas annulé
    { date: "2026-04-10", amount: -49.9, description: "AMAZON MARKETPLACE" },
    { date: "2026-04-20", amount: 49.9, description: "Remboursement AMAZON" },
    { date: "2026-04-21", amount: -20, description: "Courses" },
    { date: "2026-04-22", amount: 20, description: "Virement de Paul" }, // même montant mais rien en commun : pas un remboursement
  ];
  const { cancelled, usedCredits } = findCancelledExpenses(lines, "negative");
  assert.deepEqual([...cancelled].sort(), [0, 1, 5]);
  assert.deepEqual([...usedCredits].sort(), [2, 3, 6]);
});

test("findCancelledExpenses: un mot « remboursement » + même montant ne suffisent pas", () => {
  const lines = [
    { date: "2026-04-10", amount: -50, description: "Grocery Market" },
    { date: "2026-04-11", amount: 50, description: "Refund Airline" }, // rien en commun : achat hors relevé
  ];
  const { cancelled, usedCredits } = findCancelledExpenses(lines, "negative");
  assert.equal(cancelled.size, 0);
  assert.equal(usedCredits.size, 0);
});
