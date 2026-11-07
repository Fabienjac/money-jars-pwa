import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const T = await loadTs("src/tabularParse.ts");
const enc = (s, charset = "latin1") => new Uint8Array(Buffer.from(s, charset));

test("CSV européen : Latin-1, point-virgule, lignes d'introduction, pied de page", () => {
  const csv =
    "Relevé de compte;;;\nTitulaire;Jean;;\n\nDate;Libellé;Débit;Crédit\n" +
    "01/03/2026;CAFÉ DE LA GARE;3,50;\n02/03/2026;VIREMENT SALAIRE;;2 000,00\nTotal;;3,50;2 000,00\n";
  const text = T.decodeText(enc(csv));
  assert.ok(text.includes("CAFÉ"));
  const { headers, rows, delimiter } = T.parseCsvText(text);
  assert.equal(delimiter, ";");
  assert.deepEqual(headers, ["Date", "Libellé", "Débit", "Crédit"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1]["Crédit"], "2 000,00");
});

test("CSV : plus de plafond à 100 lignes", () => {
  let csv = "Date,Description,Amount\n";
  for (let i = 0; i < 350; i++) csv += `2026-01-01,Achat ${i},-${i}.50\n`;
  assert.equal(T.parseCsvText(csv).rows.length, 350);
});

test("CSV : UTF-8 avec BOM, UTF-16, colonnes vides et doublons", () => {
  const utf8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Date,Date,,Montant\n2026-01-01,2026-01-02,x,5\n")]);
  assert.deepEqual(T.parseCsvText(T.decodeText(new Uint8Array(utf8))).headers, ["Date", "Date (2)", "Column 3", "Montant"]);
  const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Date\tDescription\tAmount\n2026-01-01\tA\t5\n", "utf16le")]);
  assert.deepEqual(T.parseCsvText(T.decodeText(new Uint8Array(u16))).headers, ["Date", "Description", "Amount"]);
});

test("OFX SGML (v1) et XML", () => {
  const sgml = `OFXHEADER:100\nDATA:OFXSGML\nCHARSET:1252\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>USD
<BANKACCTFROM><BANKID>123<ACCTID>987654321<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260315120000[0:GMT]<TRNAMT>-45.10<FITID>A1<NAME>WHOLE FOODS<MEMO>Groceries</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260316<TRNAMT>1,500.00<FITID>A2<NAME>PAYROLL</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const res = T.parseOFX(sgml);
  assert.equal(res.rows.length, 2);
  assert.deepEqual(res.rows[0], {
    Date: "2026-03-15", Description: "WHOLE FOODS", Amount: "-45.10", Currency: "USD",
    Memo: "Groceries", Type: "DEBIT", Reference: "A1", Account: "••4321",
  });
  assert.equal(res.rows[1].Amount, "1500.00");
  const xml = `<OFX><CCSTMTRS><CURDEF>EUR</CURDEF><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260301</DTPOSTED><TRNAMT>-9,99</TRNAMT><FITID>X</FITID><NAME>Spotify</NAME></STMTTRN>
</BANKTRANLIST></CCSTMTRS></OFX>`;
  const r2 = T.parseOFX(xml);
  assert.equal(r2.rows[0].Amount, "-9.99");
  assert.equal(r2.rows[0].Currency, "EUR");
});

test("QIF", () => {
  const qif = `!Type:Bank\nD3/15'26\nT-45.10\nPWhole Foods\nMGroceries\nLFood\n^\nD03/16/2026\nT1,500.00\nPPayroll\n^\n!Type:Cat\nNSalary\n^`;
  const { rows } = T.parseQIF(qif);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Date, "3/15/2026");
  assert.equal(rows[0].Amount, "-45.10");
  assert.equal(rows[0].Memo, "Groceries");
  assert.equal(rows[1].Description, "Payroll");
});

test("Feuille Excel : dates converties en AAAA-MM-JJ", () => {
  const { headers, rows } = T.tableFromSheetMatrix([
    ["Compte courant", "", ""],
    ["Date", "Libellé", "Montant"],
    [new Date(2026, 2, 15), "Courses", -12.5],
    [new Date(2026, 2, 16), "Salaire", 2000],
  ]);
  assert.deepEqual(headers, ["Date", "Libellé", "Montant"]);
  assert.equal(rows[0].Date, "2026-03-15");
  assert.equal(rows[0].Montant, -12.5);
});
