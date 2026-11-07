import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAllPages } from "../src/paginate.ts";

const table = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
// Simule PostgREST : renvoie la tranche demandée, plafonnée à 1000 lignes
const server = (rows: { id: number }[], calls: number[][] = []) => (from: number, to: number) => {
  calls.push([from, to]);
  return Promise.resolve({ data: rows.slice(from, Math.min(to, from + 999) + 1), error: null });
};

test("table de 2 500 lignes : tout est lu, sans doublon, en 3 requêtes", async () => {
  const calls: number[][] = [];
  const rows = await fetchAllPages(server(table(2500), calls));
  assert.equal(rows.length, 2500);
  assert.equal(new Set(rows.map((r) => r.id)).size, 2500);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("moins d'une page : une seule requête ; table vide : tableau vide", async () => {
  const calls: number[][] = [];
  assert.equal((await fetchAllPages(server(table(40), calls))).length, 40);
  assert.equal(calls.length, 1);
  assert.deepEqual(await fetchAllPages(server([])), []);
});

test("exactement 1000 lignes : une requête de plus pour confirmer la fin", async () => {
  const calls: number[][] = [];
  assert.equal((await fetchAllPages(server(table(1000), calls))).length, 1000);
  assert.equal(calls.length, 2);
});

test("une erreur réseau est propagée au lieu de renvoyer un total partiel", async () => {
  let n = 0;
  const flaky = () => Promise.resolve(++n === 1
    ? { data: table(1000), error: null }
    : { data: null, error: { message: "boom" } });
  await assert.rejects(fetchAllPages(flaky), /boom/);
});
