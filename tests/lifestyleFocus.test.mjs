import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { computeLifestyle, matchesFocus, focusActive, rollingAverageSeries } = await loadTs("src/lifestyle.ts");
const { DEFAULT_FOCUS, MAX_FOCUS, normalizeFocus, toggleFocus, focusLabel } = await loadTs("src/lifestyleFocus.ts");

const none = new Set();
const row = (date, amount, tags) => ({ date, amount, tags });

test("matchesFocus : une étiquette, plusieurs étiquettes, ou aucun focus", () => {
  assert.equal(matchesFocus("alimentaire,loisirs", "alimentaire"), true);
  assert.equal(matchesFocus("loisirs", "alimentaire"), false);
  assert.equal(matchesFocus("loisirs", ["alimentaire", "loisirs"]), true);   // l'une ou l'autre
  assert.equal(matchesFocus("transport", ["alimentaire", "loisirs"]), false);
  assert.equal(matchesFocus("transport", undefined), true);                  // sans focus : tout compte
  assert.equal(matchesFocus("transport", []), true);
  assert.equal(focusActive([]), false);
  assert.equal(focusActive(["a"]), true);
  assert.equal(focusActive("a"), true);
});

test("courbe regroupée : une dépense qui porte plusieurs étiquettes suivies n'est comptée qu'une fois", () => {
  const rows = [
    row("2026-03-10", 30, "alimentaire,restaurant"),   // les deux étiquettes suivies : 30, pas 60
    row("2026-03-12", 20, "restaurant"),
    row("2026-03-14", 10, "alimentaire"),
    row("2026-03-15", 99, "transport"),                // hors focus
  ];
  const grouped = computeLifestyle(rows, none, "2026-03-31", { tagId: ["alimentaire", "restaurant"] });
  assert.equal(grouped.total, 60);
  // et ce n'est pas la somme des deux calculs séparés (30+10 = 40 et 30+20 = 50 → 90)
  const a = computeLifestyle(rows, none, "2026-03-31", { tagId: "alimentaire" }).total;
  const r = computeLifestyle(rows, none, "2026-03-31", { tagId: "restaurant" }).total;
  assert.equal(a + r, 90);
  assert.ok(grouped.total < a + r);
});

test("une étiquette seule donne le même résultat que la liste à un élément", () => {
  const rows = [row("2026-03-10", 30, "alimentaire"), row("2026-03-11", 12, "loisirs")];
  const one = computeLifestyle(rows, none, "2026-03-31", { tagId: "alimentaire" });
  const list = computeLifestyle(rows, none, "2026-03-31", { tagId: ["alimentaire"] });
  assert.deepEqual(list, one);
});

test("les dépenses exceptionnelles restent exclues de la courbe regroupée", () => {
  const rows = [row("2026-03-10", 30, "alimentaire"), row("2026-03-11", 500, "restaurant,voyage")];
  const s = computeLifestyle(rows, new Set(["voyage"]), "2026-03-31", { tagId: ["alimentaire", "restaurant"] });
  assert.equal(s.regular, 30);
  assert.equal(s.extraordinary, 500);
});

test("rollingAverageSeries accepte une liste d'étiquettes", () => {
  const rows = [];
  for (let d = 1; d <= 28; d++) rows.push(row(`2026-03-${String(d).padStart(2, "0")}`, 10, d % 2 ? "alimentaire" : "restaurant"));
  const both = rollingAverageSeries(rows, none, "2026-03-28", ["alimentaire", "restaurant"]);
  const food = rollingAverageSeries(rows, none, "2026-03-28", "alimentaire");
  assert.ok(both.length > 0 && food.length > 0);
  assert.ok(both.at(-1).avg > food.at(-1).avg);
});

test("normalizeFocus : valeurs valides, étiquettes supprimées retirées, 3 au plus, alimentation par défaut", () => {
  const known = ["alimentaire", "restaurant", "transport", "loisirs"];
  assert.deepEqual(normalizeFocus(undefined, known), DEFAULT_FOCUS);
  assert.deepEqual(normalizeFocus("pas une liste", known), DEFAULT_FOCUS);
  assert.deepEqual(normalizeFocus(["restaurant", "transport"], known), ["restaurant", "transport"]);
  assert.deepEqual(normalizeFocus(["supprimee", "restaurant"], known), ["restaurant"]);
  assert.deepEqual(normalizeFocus(["supprimee"], known), DEFAULT_FOCUS);
  assert.deepEqual(normalizeFocus(["restaurant", "restaurant", 3, null], known), ["restaurant"]);
  assert.equal(normalizeFocus(["alimentaire", "restaurant", "transport", "loisirs"], known).length, MAX_FOCUS);
});

test("toggleFocus : on ajoute jusqu'à 3, on retire, mais jamais la dernière", () => {
  assert.deepEqual(toggleFocus(["alimentaire"], "restaurant"), ["alimentaire", "restaurant"]);
  assert.deepEqual(toggleFocus(["alimentaire", "restaurant"], "restaurant"), ["alimentaire"]);
  assert.deepEqual(toggleFocus(["alimentaire"], "alimentaire"), ["alimentaire"]);           // la dernière reste
  assert.deepEqual(toggleFocus(["a", "b", "c"], "d"), ["a", "b", "c"]);                      // plafond
  assert.deepEqual(toggleFocus(["a", "b", "c"], "b"), ["a", "c"]);
});

test("focusLabel", () => {
  const names = { alimentaire: "Alimentation", restaurant: "Restaurant" };
  assert.equal(focusLabel(["alimentaire", "restaurant"], (id) => names[id]), "Alimentation + Restaurant");
  assert.equal(focusLabel(["alimentaire"], (id) => names[id]), "Alimentation");
});
