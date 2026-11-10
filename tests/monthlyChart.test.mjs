import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { monthKeyOf, fillMonthKeys, niceTicks, axisScale, ratioOf, labelStep } = await loadTs("src/monthlyChart.ts");

test("monthKeyOf", () => {
  assert.equal(monthKeyOf(new Date(2026, 0, 15)), "2026-01");
  assert.equal(monthKeyOf(new Date(2026, 11, 31)), "2026-12");
});

test("fillMonthKeys : les mois sans saisie apparaissent, y compris à cheval sur deux années", () => {
  assert.deepEqual(fillMonthKeys(["2026-01", "2026-03", "2026-05"]), ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
  assert.deepEqual(fillMonthKeys(["2026-11", "2027-02", "2026-11"]), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(fillMonthKeys(["2026-07"]), ["2026-07"]);
  assert.deepEqual(fillMonthKeys(["abc", "2026-13"]), []);
  assert.deepEqual(fillMonthKeys([]), []);
});

test("niceTicks : graduations rondes, maximum au moins égal à la valeur", () => {
  assert.deepEqual(niceTicks(450), [0, 200, 400, 600]);
  assert.deepEqual(niceTicks(4680), [0, 2000, 4000, 6000]);
  assert.deepEqual(niceTicks(95), [0, 25, 50, 75, 100]);
  assert.deepEqual(niceTicks(0), [0, 1]);
  assert.deepEqual(niceTicks(10), [0, 2.5, 5, 7.5, 10]);
  for (const m of [1, 7, 99, 1234, 56789]) assert.ok(niceTicks(m).at(-1) >= m);
});

test("axisScale : un mois très au-dessus des autres coupe l'axe", () => {
  const s = axisScale([4680, 0, 388.8, 0, 95.94, 348, 0, 294, 340, 447.85, 0, 67.45]);
  assert.equal(s.capped, true);
  assert.deepEqual(s.overflow, [0]);
  assert.ok(s.max >= 447.85 && s.max <= 700, `max ${s.max}`);
});

test("axisScale : pas de coupure sans écart net ou avec trop peu de mois", () => {
  assert.equal(axisScale([100, 120, 90, 300]).capped, false);
  assert.equal(axisScale([4680, 388]).capped, false);   // deux mois : impossible de parler d'exception
  assert.equal(axisScale([4680, 388]).max, 6000);
  assert.deepEqual(axisScale([0, 0]).overflow, []);
});

test("ratioOf : coupé au haut de l'axe", () => {
  assert.equal(ratioOf(50, 100), 0.5);
  assert.equal(ratioOf(4680, 600), 1);
  assert.equal(ratioOf(-5, 100), 0);
  assert.equal(ratioOf(5, 0), 0);
});

test("labelStep : un libellé de mois sur n quand il y en a beaucoup", () => {
  assert.equal(labelStep(8), 1);
  assert.equal(labelStep(12), 1);
  assert.equal(labelStep(13), 2);
  assert.equal(labelStep(36), 3);
});
