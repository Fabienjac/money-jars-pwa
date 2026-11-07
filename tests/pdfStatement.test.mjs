import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./_load.mjs";

const P = await loadTs("src/pdfStatement.ts");
const N = await loadTs("src/importNormalize.ts");

// Fixtures synthétiques : mêmes dispositions que de vrais relevés, avec des données inventées.
const item = (x, y, str, w) => ({ str, x, y, w: w ?? str.length * 5 });
const line = (y, ...cells) => cells.map(([x, str, w]) => item(x, y, str, w));

test("Relevé FR : colonnes entrée/sortie fusionnées dans l'en-tête, date et type dans la même cellule", () => {
  const page = [
    ...line(733, [74, "BANQUE EXEMPLE SA"], [387, "DATE"], [425, "01 sept. 2026 - 06 nov. 2026"]),
    ...line(520, [74, "TRANSACTIONS"]),
    ...line(495, [74, "DATE"], [122, "TYPE"], [153, "DESCRIPTION"], [397, "ENTRÉE D'ARGENT SORTIE D'ARGENT", 98], [502, "SOLDE"]),
    ...line(479, [74, "01 sept. 2026 Intérêts", 90], [153, "Interest payment"], [397, "0,11 €", 30], [494, "85,14 €", 35]),
    ...line(430, [74, "09 oct. 2026"], [122, "Virement Outgoing transfer for Mr Dupont", 190], [446, "62,50 €", 35], [494, "22,76 €", 35]),
    ...line(355, [74, "APERÇU DU SOLDE"]),
    ...line(297, [74, "Compte épargne"], [496, "22,81 €"]),
  ];
  const t = P.extractStatementTable([page]);
  assert.equal(t.guessed, false);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].Date, "01 sept. 2026");
  assert.equal(t.rows[0].Description, "Intérêts Interest payment");
  assert.equal(t.rows[0]["ENTRÉE D'ARGENT"], "0,11 €");
  assert.equal(t.rows[1]["SORTIE D'ARGENT"], "62,50 €");
  assert.equal(t.rows[1].Currency, "EUR");
  const net = N.addNetAmountColumn(t.headers, t.rows);
  assert.deepEqual(net.rows.map((r) => r[N.NET_AMOUNT_COLUMN]), ["0.11", "-62.5"]);
  const sug = N.suggestColumns(net.headers, net.rows);
  assert.equal(sug.Montant, N.NET_AMOUNT_COLUMN);
  assert.equal(sug.Description, "Description");
  // Régression : les intérêts (rentrées) sont plus nombreux que le virement (sortie), mais seule la sortie est une dépense
  const reading = N.resolveReading(net.rows, sug.Date, sug.Montant, N.DEFAULT_READ_OPTIONS);
  assert.equal(reading.expenseSign, "negative");
  const amounts = net.rows.map((r) => N.parseAmount(r[sug.Montant], reading.decimal));
  assert.deepEqual(amounts.filter((a) => a < 0), [-62.5]);
});

test("Relevé ES : retiro/depósito, descriptions sur plusieurs lignes, page suivante sans en-tête", () => {
  const page1 = [
    ...line(449, [43, "Fecha"], [122, "Detalle"], [350, "Retiro"], [443, "Depósito"], [531, "Saldo"]),
    ...line(417, [41, "13 abr. 2026"], [122, "DB ACH XPRESS APP uber"], [348, "-$17.61", 35], [527, "$165.23", 35]),
    ...line(355, [41, "08 abr. 2026"], [122, "DB Cobro de comisión por retiro"], [348, "-$1.99", 30], [527, "$182.98", 35]),
    ...line(341, [122, "sin tarjeta 000419"]),
    ...line(265, [41, "08 abr. 2026"], [122, "CR REVERSA DE ITBMS 000418"], [456, "$0.14", 28], [527, "$284.97", 35]),
    ...line(57, [522, "Página 1 de 2"]),
  ];
  const page2 = [
    ...line(600, [41, "07 abr. 2026"], [122, "CR RETIRO SIN TARJETA"], [449, "$100.00", 35], [527, "$282.84", 35]),
    ...line(586, [122, "BANISTMO NO EJECUTADO"]),
  ];
  const t = P.extractStatementTable([page1, page2]);
  assert.equal(t.rows.length, 4);
  assert.equal(t.rows[1].Description, "DB Cobro de comisión por retiro sin tarjeta 000419");
  assert.equal(t.rows[3].Description, "CR RETIRO SIN TARJETA BANISTMO NO EJECUTADO");
  assert.equal(t.rows[0].Currency, "USD");
  const net = N.addNetAmountColumn(t.headers, t.rows);
  assert.deepEqual(net.rows.map((r) => r[N.NET_AMOUNT_COLUMN]), ["-17.61", "-1.99", "0.14", "100"]);
  assert.equal(N.parseDate(t.rows[0].Date), "2026-04-13");
});

test("Relevé EN : devise dans la cellule montant, description centrée", () => {
  const page = [
    ...line(575, [94, "Date"], [239, "Description"], [411, "Transaction Amount"]),
    ...line(540, [75, "Oct 16, 2026", 60], [193, "MAMMOUTH STARTER PLAN", 105], [463, "-12.00 EUR", 50]),
    ...line(498, [75, "Oct 02, 2026", 60], [201, "PAYPAL *EXEMPLE", 85], [462, "-14.16 SGD", 50]),
  ];
  const t = P.extractStatementTable([page]);
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.rows.map((r) => r.Currency), ["EUR", "SGD"]);
  const sug = N.suggestColumns(t.headers, t.rows);
  assert.deepEqual(sug, { Date: "Date", Montant: "Amount", Description: "Description", Devise: "Currency" });
});

test("Relevé EN-tête sur plusieurs lignes (type Revolut) : colonnes frais/taxes ignorées, un seul montant", () => {
  const page = [
    ...line(596, [343, "Argent"]),
    ...line(590, [428, "Impôt"], [470, "Autres"]),
    ...line(584, [40, "Date"], [125, "Description"], [258, "Catégorie"], [343, "entrant"], [385, "Solde"], [536, "Frais"]),
    ...line(578, [428, "retenu"], [470, "taxes"]),
    ...line(572, [343, "/sortant"]),
    ...line(552, [40, "2 sept. 2026", 60], [125, "Café Exemple", 60], [258, "Remboursement", 60], [343, "47,00€", 30], [385, "277,62€", 35], [428, "0,00€", 30], [470, "0,00€", 30], [534, "0,00€", 30]),
    ...line(530, [40, "5 sept. 2026", 60], [125, "Apple", 30], [258, "Commerçant", 55], [343, "-0,99€", 30], [385, "276,63€", 35], [428, "0,00€", 30], [470, "0,00€", 30], [534, "0,00€", 30]),
    ...line(500, [40, "Total"], [343, "0,00€", 30], [428, "0,00€", 30]),
  ];
  const t = P.extractStatementTable([page]);
  assert.equal(t.guessed, false);
  assert.deepEqual(t.headers, ["Date", "Description", "Amount", "Solde", "Currency"]);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[1].Amount, "-0,99€");
  assert.equal(t.rows[1].Solde, "276,63€"); // pas écrasé par la colonne « impôt retenu »
  assert.equal(t.rows[1].Description, "Apple Commerçant");
});

test("Texte brouillé (PDF imprimé / polices sans table de caractères) : signalé illisible", () => {
  const page = [...line(700, [44, "6QFSFQRAR6LJMQB"]), ...line(680, [44, "&4QBABS4IBRO"], [392, "/ (+'0,%37'6"])];
  const t = P.extractStatementTable([page]);
  assert.equal(t.rows.length, 0);
  assert.equal(t.readable, false);
});

test("Relevé sans mouvement : aucune transaction (les soldes ne sont pas des transactions)", () => {
  const page = [
    ...line(649, [31, "DATE"], [78, "INFORMATION"], [282, "DÉBIT"], [351, "CRÉDIT"], [426, "DATE VALEUR"], [519, "SOLDE"]),
    ...line(633, [31, "01.10.2026"], [78, "Solde d'ouverture"], [532, "502.28", 30]),
    ...line(559, [31, "31.10.2026"], [78, "Solde de clôture"], [532, "502.28", 30]),
  ];
  assert.equal(P.extractStatementTable([page]).rows.length, 0);
});

test("Sans en-tête reconnu : colonnes devinées et signalées", () => {
  const page = [
    ...line(700, [40, "05/03/2026"], [120, "CARREFOUR MARKET"], [400, "-23,40 €"], [480, "1 200,00 €"]),
    ...line(680, [40, "06/03/2026"], [120, "SALAIRE"], [400, "2 000,00 €"], [480, "3 200,00 €"]),
  ];
  const t = P.extractStatementTable([page]);
  assert.equal(t.guessed, true);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].Amount, "-23,40 €");
});

test("Reconnaissance des montants : références et numéros ne sont pas des montants", () => {
  for (const ok of ["-$17.61", "62,50 €", "-14.16 SGD", "1 234,56", "(45.00)", "$165.23"]) assert.ok(P.isAmountText(ok), ok);
  for (const no of ["000419", "BANISTMO 000419", "2026", "FR76 3123", "Interest payment"]) assert.ok(!P.isAmountText(no), no);
});

// Vrais relevés (sensibles, jamais commités) : testés seulement s'ils sont présents sur cette machine.
const realDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../EXEMPLE DE RELEVES");
test("Vrais relevés locaux (si présents)", { skip: !fs.existsSync(realDir) }, async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const expected = { "trade republic": 4, redotpay: 10, Movimientos: 16, yuh: 0, revolut: 14, n26: 0 };
  for (const file of fs.readdirSync(realDir).filter((f) => /\.pdf$/i.test(f))) {
    const key = Object.keys(expected).find((k) => file.toLowerCase().includes(k.toLowerCase()));
    if (!key) continue;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(realDir, file))), useSystemFonts: true }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      pages.push(tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
    }
    assert.equal(P.extractStatementTable(pages).rows.length, expected[key], file);
  }
});
