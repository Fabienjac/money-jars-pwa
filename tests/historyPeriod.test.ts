import { test } from "node:test";
import assert from "node:assert/strict";
import { historySince, inBounds, periodBounds } from "../src/historyPeriod.ts";

const now = new Date(2026, 10, 8, 14, 30); // 8 novembre 2026, 14 h 30
const day = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi);

test("tout : pas de bornes ; mois en cours : du 1er à maintenant ; mois précédent : tout le mois", () => {
  assert.equal(periodBounds("all", now), null);
  const m = periodBounds("month", now)!;
  assert.deepEqual([m.start.getTime(), m.end.getTime()], [day(2026, 11, 1).getTime(), now.getTime()]);
  const p = periodBounds("prevmonth", now)!;
  assert.equal(p.start.getTime(), day(2026, 10, 1).getTime());
  assert.equal(p.end.getTime(), new Date(2026, 9, 31, 23, 59, 59).getTime());
});

test("90 jours et 1 an glissants", () => {
  const d90 = periodBounds("90d", now)!;
  assert.equal(d90.start.getTime(), new Date(2026, 7, 10, 14, 30).getTime());
  const y = periodBounds("year", now)!;
  assert.equal(y.start.getTime(), new Date(2025, 10, 8, 14, 30).getTime());
});

test("période personnalisée : bornes incluses (jour de fin jusqu'à 23 h 59), une seule borne = ouverte, aucune = pas de filtre", () => {
  const b = periodBounds("custom", now, "2026-10-01", "2026-10-31")!;
  assert.ok(inBounds(day(2026, 10, 1, 0, 0), b)); // premier jour, minuit
  assert.ok(inBounds(day(2026, 10, 31, 23, 59), b)); // dernier jour, fin de journée
  assert.ok(!inBounds(day(2026, 9, 30, 23, 59), b));
  assert.ok(!inBounds(day(2026, 11, 1, 0, 0), b));

  const fromOnly = periodBounds("custom", now, "2026-10-15")!;
  assert.ok(inBounds(day(2030, 1, 1), fromOnly));
  assert.ok(!inBounds(day(2026, 10, 14), fromOnly));

  const toOnly = periodBounds("custom", now, "", "2026-03-31")!;
  assert.ok(inBounds(day(2001, 1, 1), toOnly));
  assert.ok(!inBounds(day(2026, 4, 1), toOnly));

  assert.equal(periodBounds("custom", now), null);
});

test("inBounds : sans bornes toujours vrai, date invalide jamais (avec bornes)", () => {
  assert.ok(inBounds(null, null));
  assert.ok(!inBounds(null, periodBounds("month", now)));
});

test("historique chargé par défaut : 12 mois glissants, comme le filtre « 1 an »", () => {
  assert.equal(historySince(new Date(2026, 10, 11, 9, 0)), "2025-11-11");
  assert.equal(historySince(new Date(2026, 0, 1)), "2025-01-01"); // début d'année
  assert.equal(historySince(new Date(2026, 11, 31, 23, 59)), "2025-12-31"); // pas de décalage de fuseau
  const d = periodBounds("year", now)!.start;
  assert.equal(historySince(now), `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
});
