import { test } from "node:test";
import assert from "node:assert/strict";
import { PROJECTION_MIN_DAY, projectMonthEnd, projectionReady, splitOneOff } from "../src/monthProjection.ts";

test("projection : rythme courant étendu au mois + exceptionnelles reprises telles quelles", () => {
  // 10 jours écoulés sur 30 : 300 € courants → 900 € ; + 600 € exceptionnels déjà dépensés
  const p = projectMonthEnd({ regularSoFar: 300, oneOffSoFar: 600, day: 10, daysInMonth: 30 })!;
  assert.equal(p.regularProjected, 900);
  assert.equal(p.oneOff, 600);
  assert.equal(p.projected, 1500);
});

test("un gros billet en début de mois ne s'extrapole plus (l'ancienne règle de trois donnait 2 700 € ici)", () => {
  const total = 300 + 600;
  const naive = (total / 10) * 30;
  const p = projectMonthEnd({ regularSoFar: 300, oneOffSoFar: 600, day: 10, daysInMonth: 30 })!;
  assert.equal(naive, 2700);
  assert.ok(p.projected < naive);
});

test("sans exceptionnelle, c'est la règle de trois d'avant ; dernier jour du mois : le total réel", () => {
  assert.equal(projectMonthEnd({ regularSoFar: 450, oneOffSoFar: 0, day: 15, daysInMonth: 30 })!.projected, 900);
  assert.equal(projectMonthEnd({ regularSoFar: 800, oneOffSoFar: 50, day: 30, daysInMonth: 30 })!.projected, 850);
});

test("entrées invalides : pas de projection", () => {
  assert.equal(projectMonthEnd({ regularSoFar: 1, oneOffSoFar: 0, day: 0, daysInMonth: 30 }), null);
  assert.equal(projectMonthEnd({ regularSoFar: 1, oneOffSoFar: 0, day: 31, daysInMonth: 30 }), null);
});

test("affichée à partir du 10 du mois", () => {
  assert.equal(PROJECTION_MIN_DAY, 10);
  assert.equal(projectionReady(9), false);
  assert.equal(projectionReady(10), true);
});

test("séparation courantes / exceptionnelles (une étiquette exceptionnelle suffit, même avec d'autres)", () => {
  const rows = [
    { amount: 599.37, tags: "loisirs,exceptionnel" },
    { amount: 100, tags: "alimentaire" },
    { amount: 20, tags: "" },
    { amount: 50, tags: undefined },
    { amount: 80, tags: "voyage" }, // étiquette marquée exceptionnelle dans les préférences
  ];
  const s = splitOneOff(rows, ["exceptionnel", "voyage"]);
  assert.ok(Math.abs(s.oneOff - 679.37) < 1e-9);
  assert.equal(s.regular, 170);
});
