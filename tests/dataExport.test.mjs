import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { EXPORT_TABLES, buildExport, exportFileName, revenuesCsv, spendingsCsv } = await loadTs("src/dataExport.ts");

const now = new Date(2026, 10, 8, 19, 5);

test("le fichier contient toutes les tables, même vides, avec le nombre de lignes", () => {
  const f = buildExport({ transactions_spending: [{ id: 1, user_id: "u", date: "2026-10-05", amount: 12.5 }] }, { email: "a@b.c", now });
  assert.equal(f.app, "Money Jars");
  assert.equal(f.format, 1);
  assert.equal(f.account.email, "a@b.c");
  assert.deepEqual(Object.keys(f.tables), [...EXPORT_TABLES]);
  assert.equal(f.counts.transactions_spending, 1);
  assert.equal(f.counts.jar_transfers, 0);
  assert.deepEqual(f.tables.jar_transfers, []);
  assert.equal(f.exportedAt, now.toISOString());
});

test("l'identifiant de compte est retiré des lignes ; rien d'autre n'est modifié", () => {
  const f = buildExport({ tags: [{ id: "a", user_id: "u", name: "Alimentation", emoji: "🍓" }] }, { now });
  assert.deepEqual(f.tables.tags[0], { id: "a", name: "Alimentation", emoji: "🍓" });
  assert.equal(f.account.email, null);
});

test("pas de données de paiement ni d'appareils dans les tables exportées", () => {
  const names = [...EXPORT_TABLES].join(" ");
  assert.ok(!/subscriptions|push|stripe|feedback/.test(names));
});

test("noms de fichiers datés", () => {
  assert.equal(exportFileName("all", now), "money-jars-donnees-2026-11-08.json");
  assert.equal(exportFileName("spendings", now), "money-jars-depenses-2026-11-08.csv");
  assert.equal(exportFileName("revenues", now), "money-jars-revenus-2026-11-08.csv");
});

test("CSV dépenses : date ISO, virgule décimale en français, cellules protégées", () => {
  const rows = [{ date: "2026-10-05", description: "Café; crème", amount: "12.5", jar: "NEC", account: "Cash", tags: "alimentaire", subscription: "" }];
  const csv = spendingsCsv(rows, true, ["Date", "Description", "Montant", "Jarre", "Compte", "Tags", "Abonnement"]);
  assert.equal(csv, 'Date;Description;Montant;Jarre;Compte;Tags;Abonnement\r\n2026-10-05;"Café; crème";12,50;NEC;Cash;alimentaire;');
  const en = spendingsCsv([{ ...rows[0], description: "Café, crème" }], false, ["d", "x", "m", "j", "a", "t", "s"]);
  assert.ok(en.includes('2026-10-05,"Café, crème",12.50,NEC')); // séparateur « , » : la cellule qui en contient est entre guillemets
});

test("CSV revenus : champs optionnels vides, montant manquant", () => {
  const rows = [{ date: "2026-10-01T00:00:00", source: "Freelance", amount: null, value: "EUR", destination: "Keystone", income_type: "Passive Income", tags: "" }];
  const csv = revenuesCsv(rows, true, ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
  assert.equal(csv.split("\r\n")[1], "2026-10-01;Freelance;;EUR;;;;Keystone;Passive Income;");
});
