import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_TAG, csvCell, csvNumber, dayKey, dayTotals, matchesSearch, matchesTag, normalizeText,
  parseMinAmount, passesMinAmount, sortRows, toCsv,
} from "../src/historyFilters.ts";

test("recherche : accents et casse ignorés, tous les mots requis, sur plusieurs champs", () => {
  assert.equal(normalizeText("  Café  Crème "), "cafe creme");
  const fields = ["Carrefour City", "Alimentation, Vie quotidienne", "Carte Revolut", "NEC"];
  assert.ok(matchesSearch(fields, "")); // saisie vide : tout passe
  assert.ok(matchesSearch(fields, "CARREFOUR"));
  assert.ok(matchesSearch(fields, "carrefour alimentation")); // libellé + étiquette
  assert.ok(matchesSearch(fields, "revolut nec")); // compte + jarre
  assert.ok(!matchesSearch(fields, "carrefour loisirs")); // un mot manquant : refusé
  assert.ok(matchesSearch(["Crème brûlée"], "creme brulee"));
  assert.ok(matchesSearch([undefined, null, "x"], "x")); // champs absents tolérés
  assert.ok(matchesSearch([12.5], "12.5")); // nombres acceptés
});

test("montant minimum : virgule ou point, inclus, valeur invalide = pas de filtre", () => {
  assert.equal(parseMinAmount("100"), 100);
  assert.equal(parseMinAmount("12,5"), 12.5);
  assert.equal(parseMinAmount("1 000"), 1000);
  assert.equal(parseMinAmount(""), null);
  assert.equal(parseMinAmount("abc"), null);
  assert.equal(parseMinAmount("-5"), null);
  assert.equal(parseMinAmount("0"), null);
  assert.ok(passesMinAmount(100, 100)); // borne incluse
  assert.ok(!passesMinAmount(99.99, 100));
  assert.ok(passesMinAmount(1, null));
});

test("filtre d'étiquette : une étiquette, aucune, ou toutes", () => {
  assert.ok(matchesTag(["alimentaire", "loisirs"], "loisirs"));
  assert.ok(!matchesTag(["alimentaire"], "loisirs"));
  assert.ok(matchesTag([], NO_TAG));
  assert.ok(!matchesTag(["alimentaire"], NO_TAG));
  assert.ok(matchesTag([], "all"));
});

type R = { id: string; t: number; a: number };
const rows: R[] = [
  { id: "a", t: 300, a: 10 },
  { id: "b", t: 300, a: 50 },
  { id: "c", t: 200, a: 50 },
  { id: "d", t: 100, a: 5 },
];
const ids = (xs: R[]) => xs.map((x) => x.id).join("");

test("tri : date (ordre d'origine conservé à égalité), montant (date récente en départage)", () => {
  assert.equal(ids(sortRows(rows, "dateDesc", (r) => r.t, (r) => r.a)), "abcd");
  assert.equal(ids(sortRows(rows, "dateAsc", (r) => r.t, (r) => r.a)), "dcba"); // miroir exact
  assert.equal(ids(sortRows(rows, "amountDesc", (r) => r.t, (r) => r.a)), "bcad"); // 50 (b avant c : plus récent) puis 10, 5
  assert.equal(ids(sortRows(rows, "amountAsc", (r) => r.t, (r) => r.a)), "dabc");
  assert.equal(ids(rows), "abcd"); // le tableau d'origine n'est pas modifié
});

test("totaux par jour : calculés sur toutes les lignes", () => {
  const key = (r: R) => (r.t >= 300 ? "j2" : "j1");
  const m = dayTotals(rows, key, (r) => r.a);
  assert.deepEqual(m.get("j2"), { total: 60, count: 2 });
  assert.deepEqual(m.get("j1"), { total: 55, count: 2 });
});

test("clé de jour locale, vide si date invalide", () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(dayKey(null), "");
  assert.equal(dayKey(new Date("x")), "");
});

test("CSV : guillemets, séparateur, retours ligne, formules neutralisées, nombres intacts", () => {
  assert.equal(csvCell("simple"), "simple");
  assert.equal(csvCell("a;b"), '"a;b"');
  assert.equal(csvCell('dit "oui"'), '"dit ""oui"""');
  assert.equal(csvCell("l1\nl2"), '"l1\nl2"');
  assert.equal(csvCell("=SOMME(A1)"), "'=SOMME(A1)"); // pas de formule injectée
  assert.equal(csvCell("-12,5"), "-12,5"); // un nombre reste un nombre
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell("a,b", ","), '"a,b"');
  assert.equal(toCsv([["d", "m"], ["x;y", 3]]), 'd;m\r\n"x;y";3');
  assert.equal(csvNumber(1234.5, true), "1234,50");
  assert.equal(csvNumber(1234.567, false), "1234.57");
});
