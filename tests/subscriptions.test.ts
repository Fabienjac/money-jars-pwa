import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRecurring, explainRecurring, normalizeLabel } from "../src/subscriptions.ts";
import type { SearchSpendingResult } from "../src/types.ts";

const now = new Date(2026, 10, 7); // 7 novembre 2026
const row = (date: string, description: string, amount: number, extra: Partial<SearchSpendingResult> = {}): SearchSpendingResult =>
  ({ date, jar: "NEC", account: "CB", amount, description, ...extra });

test("normalizeLabel : prefixes bancaires, chiffres, domaines et accents ignorés", () => {
  assert.equal(normalizeLabel("PRLV SEPA NETFLIX.COM 12345"), "netflix");
  assert.equal(normalizeLabel("Netflix"), "netflix");
  assert.equal(normalizeLabel("  Électricité  EDF  2026-10 "), "electricite edf");
  assert.equal(normalizeLabel("12/10"), "");
});

test("abonnement mensuel fixe : détecté, et les variantes de libellé ne font pas de doublon", () => {
  const txns = [
    row("05/09/2026", "NETFLIX.COM", 13.49),
    row("05/10/2026", "PRLV SEPA Netflix 8841", 13.49),
    row("06/11/2026", "Netflix", 13.49),
  ];
  const items = detectRecurring(txns, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].isFixed, true);
  assert.equal(items[0].occurrences, 3);
  assert.equal(items[0].monthlyAmount.toFixed(2), "13.49");
});

test("courses et commerces fréquentés : écartés (plusieurs passages par mois)", () => {
  const txns = [
    row("03/10/2026", "Carrefour Market", 42.1), row("11/10/2026", "Carrefour Market", 18.3), row("24/10/2026", "Carrefour Market", 55),
    row("02/11/2026", "Carrefour Market", 31), row("06/11/2026", "Carrefour Market", 12.5),
  ];
  assert.deepEqual(detectRecurring(txns, now), []);
});

test("étiquette du quotidien : écartée même à raison d'une fois par mois", () => {
  const txns = [
    row("04/09/2026", "Panier bio", 25, { tags: "alimentaire" }),
    row("04/10/2026", "Panier bio", 25, { tags: "alimentaire" }),
    row("04/11/2026", "Panier bio", 25, { tags: "alimentaire" }),
  ];
  assert.deepEqual(detectRecurring(txns, now), []);
});

test("abonnement arrêté (plus de prélèvement depuis des mois) : n'apparaît plus", () => {
  const txns = [row("10/04/2026", "Salle de sport", 29.9), row("10/05/2026", "Salle de sport", 29.9), row("10/06/2026", "Salle de sport", 29.9)];
  assert.deepEqual(detectRecurring(txns, now), []);
});

test("montant variable : retenu seulement si 3 mois de suite à date régulière (facture téléphone)", () => {
  const ok = [row("12/09/2026", "Free Mobile", 11.2), row("13/10/2026", "Free Mobile", 14.9), row("12/11/2026", "Free Mobile", 12.7)];
  const items = detectRecurring(ok, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].isFixed, false);
  // seulement 2 mois : trop peu pour un montant variable
  assert.deepEqual(detectRecurring(ok.slice(1), now), []);
  // dates dispersées : un restaurant qu'on retrouve chaque mois n'est pas un abonnement
  const scattered = [row("02/09/2026", "Pizzeria", 22), row("19/10/2026", "Pizzeria", 31), row("28/11/2026", "Pizzeria", 18)];
  assert.deepEqual(detectRecurring(scattered, new Date(2026, 10, 30)), []);
});

test("mois non consécutifs : pas un abonnement mensuel", () => {
  const txns = [row("05/08/2026", "Coiffeur", 30), row("05/11/2026", "Coiffeur", 30)];
  assert.deepEqual(detectRecurring(txns, now), []);
});

test("abonnement marqué à la main : monthlyAmount selon la fréquence, arrêt selon la fréquence", () => {
  const annual = [row("15/03/2026", "Assurance habitation", 240, { subscription: "annuel" })];
  const items = detectRecurring(annual, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].freq, "annuel");
  assert.equal(items[0].monthlyAmount, 20);
  // un annuel de l'an dernier est encore dans le délai (14 mois) ; de 2 ans, il est arrêté
  assert.equal(detectRecurring([row("15/10/2025", "Assurance", 240, { subscription: "annuel" })], now).length, 1);
  assert.equal(detectRecurring([row("15/10/2024", "Assurance", 240, { subscription: "annuel" })], now).length, 0);
});

test("un abonnement marqué (même arrêté) n'est pas redétecté automatiquement", () => {
  const txns = [
    row("05/03/2026", "Spotify", 10.99, { subscription: "mensuel" }),
    row("05/10/2026", "Spotify", 10.99), row("05/11/2026", "Spotify", 10.99),
  ];
  const items = detectRecurring(txns, now);
  assert.equal(items.length, 1); // marqué une fois, prélevé depuis : actif, une seule ligne
  assert.equal(items[0].freq, "mensuel");
  assert.equal(items[0].occurrences, 1);
  // marqué puis plus aucun prélèvement : arrêté, et pas redétecté pour autant
  assert.deepEqual(detectRecurring([row("05/03/2026", "Spotify", 10.99, { subscription: "mensuel" })], now), []);
});

test("« pas un abonnement » : un libellé écarté n'est plus proposé, mais un abonnement marqué à la main reste", () => {
  const auto = [row("05/09/2026", "Netflix", 13.49), row("05/10/2026", "Netflix", 13.49), row("05/11/2026", "Netflix", 13.49)];
  const [item] = detectRecurring(auto, now);
  assert.equal(item.key, "netflix");
  assert.deepEqual(detectRecurring(auto, now, new Set([item.key])), []);
  const manual = [row("05/11/2026", "Spotify", 10.99, { subscription: "mensuel" })];
  assert.equal(detectRecurring(manual, now, new Set(["spotify"])).length, 1);
});

// ── Diagnostic « pourquoi il manque ? » ─────────────────────────────────────

const why = (txns: SearchSpendingResult[], q: string, dismissed: string[] = []) =>
  explainRecurring(txns, q, now, new Set(dismissed)).map((r) => r.reason);

test("explication : détecté, ou la règle précise qui l'écarte", () => {
  // détecté
  assert.deepEqual(why([row("05/09/2026", "Netflix", 13.49), row("05/10/2026", "Netflix", 13.49), row("05/11/2026", "Netflix", 13.49)], "netflix"), [{ code: "detected" }]);

  // dates trop dispersées (montant fixe : 10 jours maximum)
  const spread = [row("02/09/2026", "Free Mobile", 19.99), row("20/10/2026", "Free Mobile", 19.99), row("05/11/2026", "Free Mobile", 19.99)];
  assert.deepEqual(why(spread, "free"), [{ code: "dateSpread", spread: 18, max: 10 }]);

  // montant variable : 3 mois de suite exigés
  const variable = [row("05/10/2026", "Mammouth", 9.5), row("05/11/2026", "Mammouth", 12.3)];
  assert.deepEqual(why(variable, "mammouth"), [{ code: "variable", run: 2 }]);

  // un seul mois dans les 6 derniers
  assert.deepEqual(why([row("05/11/2026", "MWR", 30)], "mwr"), [{ code: "oneMonth" }]);

  // plus de prélèvement récent
  assert.deepEqual(why([row("05/07/2026", "Spotify", 10), row("05/08/2026", "Spotify", 10)], "spotify"), [{ code: "stopped" }]);

  // rien depuis plus de 6 mois
  assert.deepEqual(why([row("05/01/2026", "Deezer", 10)], "deezer"), [{ code: "tooOld", monthsAgo: 10 }]);

  // plusieurs fois par mois
  const often = [row("02/10/2026", "Boulangerie", 4), row("09/10/2026", "Boulangerie", 4), row("03/11/2026", "Boulangerie", 4), row("07/11/2026", "Boulangerie", 4)];
  assert.deepEqual(why(often, "boulangerie"), [{ code: "several" }]);
});

test("explication : écarté, du quotidien, marqué à la main (actif ou arrêté)", () => {
  const nf = [row("05/10/2026", "Netflix", 13.49), row("05/11/2026", "Netflix", 13.49)];
  assert.deepEqual(why(nf, "netflix", ["netflix"]), [{ code: "dismissed" }]);

  const food = [row("05/10/2026", "Panier bio", 30, { tags: "alimentaire" }), row("05/11/2026", "Panier bio", 30, { tags: "alimentaire" })];
  assert.deepEqual(why(food, "panier"), [{ code: "everyday" }]);

  assert.deepEqual(why([row("05/03/2026", "Assurance auto", 600, { subscription: "annuel" })], "assurance"), [{ code: "manual", stopped: false }]);
  assert.deepEqual(why([row("05/03/2024", "Vieux contrat", 100, { subscription: "mensuel" })], "contrat"), [{ code: "manual", stopped: true }]);
});

test("explication : requête partielle, une entrée par libellé, requête trop courte vide, derniers paiements listés", () => {
  const txns = [
    row("05/10/2026", "Free Mobile", 19.99), row("05/11/2026", "Free Mobile", 19.99),
    row("12/11/2026", "Freebox", 29.99),
  ];
  const res = explainRecurring(txns, "free", now);
  assert.deepEqual(res.map((r) => r.key).sort(), ["free mobile", "freebox"]);
  assert.deepEqual(explainRecurring(txns, "f", now), []);
  const fm = res.find((r) => r.key === "free mobile")!;
  assert.equal(fm.count, 2);
  assert.deepEqual(fm.recentDates, ["05/11/2026", "05/10/2026"]);
  assert.equal(fm.latest.date, "05/11/2026");
});
