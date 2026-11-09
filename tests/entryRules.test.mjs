import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { normalizeKeyword, foldText, keywordMatches, findBestRule, resolveAccountName, spendingPatch, describeRule, rowToRule, ruleToRow, legacyToRules } =
  await loadTs("src/entryRules.ts");

const rule = (keyword, extra = {}) => ({ keyword, mode: "spending", tags: [], origin: "manual", ...extra });

test("normalizeKeyword : minuscules et espaces simples (comme les règles apprises de l'import)", () => {
  assert.equal(normalizeKeyword("  Carrefour   CITY "), "carrefour city");
  assert.equal(normalizeKeyword(undefined), "");
});

test("keywordMatches : mots entiers, sans accents ni ponctuation", () => {
  assert.equal(keywordMatches("carrefour", "Carrefour City Paris"), true);
  assert.equal(keywordMatches("carrefour", "CARREFOUR"), true);
  assert.equal(keywordMatches("bar", "barbecue chez Paul"), false);
  assert.equal(keywordMatches("cafe", "Café de Flore"), true);
  assert.equal(keywordMatches("mc do", "Mc Do's"), true);
  assert.equal(keywordMatches("carrefour city", "carrefour"), false);
  assert.equal(keywordMatches("", "n'importe quoi"), false);
  assert.equal(foldText("Éléphant & Co."), "elephant co");
});

test("findBestRule : la plus précise gagne, à égalité la manuelle puis l'ordre alphabétique", () => {
  const rules = [rule("carrefour", { jar: "NEC" }), rule("carrefour city", { jar: "GIFT" }), rule("city", { jar: "PLAY" })];
  assert.equal(findBestRule("Carrefour City Paris", rules).jar, "GIFT");
  assert.equal(findBestRule("Carrefour Market", rules).jar, "NEC");
  assert.equal(findBestRule("Rien de connu", rules), null);
  const tie = [rule("netflix", { jar: "PLAY", origin: "learned" }), rule("netflix", { jar: "EDUC", origin: "manual" })];
  assert.equal(findBestRule("Netflix", tie).jar, "EDUC");
  const alpha = [rule("zzz", { jar: "A" }), rule("aaa", { jar: "B" })];
  assert.equal(findBestRule("aaa zzz", alpha).jar, "B"); // même longueur, même origine : ordre alphabétique
});

test("findBestRule : ne mélange pas dépenses et revenus", () => {
  const rules = [rule("salaire", { mode: "revenue", destination: "Banque" })];
  assert.equal(findBestRule("Salaire novembre", rules, "spending"), null);
  assert.equal(findBestRule("Salaire novembre", rules, "revenue").destination, "Banque");
});

test("resolveAccountName : retrouve le compte sans tenir compte de la casse (zéro variante d'orthographe)", () => {
  const names = ["Carte bancaire", "Espèces", "Keystone"];
  assert.equal(resolveAccountName("carte  BANCAIRE", names), "Carte bancaire");
  assert.equal(resolveAccountName("Revolut", names), null);
  assert.equal(resolveAccountName(undefined, names), null);
});

test("spendingPatch : ne remplace que ce que la personne n'a pas choisi", () => {
  const r = rule("carrefour", { jar: "NEC", account: "carte bancaire", tags: ["alimentaire"] });
  const names = ["Carte bancaire", "Espèces"];
  const jars = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
  assert.deepEqual(spendingPatch(r, { jar: false, account: false, tags: false }, names, jars), { jar: "NEC", account: "Carte bancaire", tags: ["alimentaire"] });
  assert.deepEqual(spendingPatch(r, { jar: true, account: false, tags: true }, names, jars), { account: "Carte bancaire" });
  assert.deepEqual(spendingPatch(r, { jar: false, account: true, tags: false }, names, jars), { jar: "NEC", tags: ["alimentaire"] });
  // compte supprimé depuis, jarre inconnue : on n'invente rien
  assert.deepEqual(spendingPatch(rule("x", { jar: "ZZZ", account: "Fantôme" }), { jar: false, account: false, tags: false }, names, jars), {});
});

test("describeRule", () => {
  assert.equal(describeRule(rule("a", { jar: "NEC", account: "CB", tags: ["alim", "bio"] }), (id) => id.toUpperCase()), "NEC · CB · ALIM, BIO");
  assert.equal(describeRule(rule("a")), "");
});

test("conversion base ↔ règle, aller-retour", () => {
  const r = rowToRule({ pattern: "  Carrefour ", jar: "NEC", tags: "a, b", account: "CB", origin: "manual", mode: "spending" });
  assert.deepEqual(r, { keyword: "carrefour", mode: "spending", jar: "NEC", account: "CB", tags: ["a", "b"], destination: undefined, incomeType: undefined, origin: "manual" });
  assert.deepEqual(ruleToRow(r), { pattern: "carrefour", jar: "NEC", tags: "a,b", account: "CB", mode: "spending", destination: null, income_type: null, origin: "manual" });
  // ligne ancienne (colonnes d'avant la migration) : règle apprise à l'import
  assert.equal(rowToRule({ pattern: "netflix", jar: "PLAY", tags: "abo" }).origin, "learned");
  assert.deepEqual(rowToRule({ pattern: "x", tags: "" }).tags, []);
});

test("legacyToRules : reprise des anciennes règles locales de dépense", () => {
  const existing = [
    { keyword: "netflix", mode: "spending", jar: "PLAY", tags: ["abonnements"], origin: "learned" },
    { keyword: "loyer", mode: "spending", jar: "NEC", tags: [], origin: "manual" },
  ];
  const out = legacyToRules([
    { mode: "spending", keyword: "Netflix", jar: "EDUC", account: " Carte bancaire " },
    { mode: "spending", keyword: "loyer", jar: "GIFT", account: "" },
    { mode: "spending", keyword: "boulangerie", jar: "NEC", account: "" },
    { mode: "spending", keyword: "BOULANGERIE", jar: "PLAY", account: "" },
    { mode: "revenue", keyword: "salaire" },
    { mode: "spending", keyword: "  ", jar: "NEC" },
  ], existing);
  assert.deepEqual(out.map((r) => r.keyword), ["netflix", "boulangerie"]);
  assert.equal(out[0].jar, "EDUC");            // l'ancienne règle voulue l'emporte sur l'apprise
  assert.equal(out[0].account, "Carte bancaire");
  assert.deepEqual(out[0].tags, ["abonnements"]); // elle garde les étiquettes apprises
  assert.equal(out[0].origin, "manual");
  assert.equal(out[1].account, undefined);
});
