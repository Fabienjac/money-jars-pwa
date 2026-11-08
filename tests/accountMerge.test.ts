import { test } from "node:test";
import assert from "node:assert/strict";
import { accountKey, mergeAccountLines, sumByName } from "../src/accountMerge.ts";

test("clé de compte : casse, espaces de début/fin et espaces multiples ignorés", () => {
  assert.equal(accountKey("  Redotpay   VIRT "), "redotpay virt");
  assert.equal(accountKey("KEYSTONE"), accountKey("Keystone"));
  assert.equal(accountKey(null), "");
  assert.notEqual(accountKey("Crédit Mutuel"), accountKey("Credit Mutuel")); // les accents comptent
});

test("somme par nom exact, noms vides ignorés", () => {
  const rows = [{ a: "Keystone", m: 10 }, { a: "Keystone", m: 5 }, { a: " ", m: 99 }, { a: "Cash", m: 1 }];
  assert.deepEqual(sumByName(rows, (r) => r.a, (r) => r.m), { Keystone: 15, Cash: 1 });
});

test("« Keystone » (revenus) et « KEYSTONE » (dépenses) ne forment plus qu'un compte", () => {
  const merged = mergeAccountLines([
    { name: "Keystone", received: 30472.26, spent: 0 },
    { name: "KEYSTONE", received: 0, spent: 6580 },
    { name: "Cash", received: 0, spent: 1438 },
  ]);
  assert.equal(merged.length, 2);
  const k = merged.find((m) => m.key === "keystone")!;
  assert.equal(k.name, "Keystone"); // l'écriture portant le plus de montants
  assert.equal(k.received, 30472.26);
  assert.equal(k.spent, 6580);
});

test("nom affiché : celui des Réglages s'il existe, sinon la plus chargée, à égalité pas toute en majuscules", () => {
  const lines = [{ name: "revolut", received: 0, spent: 10 }, { name: "REVOLUT", received: 0, spent: 10 }];
  assert.equal(mergeAccountLines(lines)[0].name, "revolut"); // égalité : pas toute en majuscules
  assert.equal(mergeAccountLines(lines, ["Revolut"])[0].name, "Revolut"); // les Réglages priment
  assert.equal(mergeAccountLines([{ name: "A", received: 1, spent: 0 }, { name: "a", received: 0, spent: 50 }])[0].name, "a");
});

test("comptes sans activité conservés, noms vides ignorés, tri par nom", () => {
  const merged = mergeAccountLines([
    { name: "Zeta", received: 0, spent: 0 },
    { name: "  ", received: 5, spent: 5 },
    { name: "Alpha", received: 1, spent: 2 },
  ]);
  assert.deepEqual(merged.map((m) => m.name), ["Alpha", "Zeta"]);
});
