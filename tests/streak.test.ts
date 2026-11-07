import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStreak } from "../src/streakUtils.ts";

// Heure locale à midi pour éviter toute dépendance au fuseau du poste qui lance les tests
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const now = new Date(2026, 10, 7, 9); // 7 novembre 2026, 9 h

test("aucune saisie : pas de série", () => {
  assert.deepEqual(computeStreak([], now), { count: 0, isAlive: false });
  assert.deepEqual(computeStreak(["pas une date"], now), { count: 0, isAlive: false });
});

test("jours consécutifs jusqu'à aujourd'hui : série vivante, plusieurs saisies le même jour comptent une fois", () => {
  const s = computeStreak([at(2026, 11, 5), at(2026, 11, 6), at(2026, 11, 7, 8), at(2026, 11, 7, 20)], now);
  assert.deepEqual(s, { count: 3, isAlive: true });
});

test("dernière saisie hier : encore vivante ; avant-hier : cassée mais on garde la dernière série", () => {
  assert.deepEqual(computeStreak([at(2026, 11, 5), at(2026, 11, 6)], now), { count: 2, isAlive: true });
  assert.deepEqual(computeStreak([at(2026, 11, 4), at(2026, 11, 5)], now), { count: 2, isAlive: false });
});

test("un trou coupe la série : seule la dernière suite compte", () => {
  const s = computeStreak([at(2026, 10, 1), at(2026, 10, 2), at(2026, 10, 3), at(2026, 11, 6), at(2026, 11, 7)], now);
  assert.deepEqual(s, { count: 2, isAlive: true });
});

test("import en masse un seul jour = 1 jour, et la série passe les changements de mois et d'heure", () => {
  const bulk = Array.from({ length: 300 }, (_, i) => at(2026, 11, 7, 10 + (i % 3)));
  assert.deepEqual(computeStreak(bulk, now), { count: 1, isAlive: true });
  // fin octobre (changement d'heure en Europe le 25 oct. 2026) → début novembre
  const run = [at(2026, 10, 24), at(2026, 10, 25), at(2026, 10, 26), at(2026, 10, 31), at(2026, 11, 1)];
  assert.deepEqual(computeStreak(run, new Date(2026, 10, 1, 9)), { count: 2, isAlive: true });
  assert.deepEqual(computeStreak(run.slice(0, 3), new Date(2026, 9, 26, 9)), { count: 3, isAlive: true });
});

test("une date future ne fabrique pas de série", () => {
  assert.deepEqual(computeStreak([at(2026, 12, 1)], now), { count: 0, isAlive: false });
});
