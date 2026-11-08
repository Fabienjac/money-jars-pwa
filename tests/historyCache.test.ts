import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FRESH_MS, cacheVersion, invalidateHistoryCache, readHistoryCache, rememberHistoryRows, writeHistoryCache,
} from "../src/historyCache.ts";

test("vide au départ, puis lecture : à jour pendant FRESH_MS, périmée ensuite mais toujours affichable", () => {
  invalidateHistoryCache();
  assert.equal(readHistoryCache("u1", "spending"), null);
  assert.ok(writeHistoryCache("u1", "spending", [1, 2, 3], cacheVersion(), 1000));
  const fresh = readHistoryCache<number>("u1", "spending", 1000 + FRESH_MS - 1)!;
  assert.deepEqual(fresh.rows, [1, 2, 3]);
  assert.equal(fresh.fresh, true);
  const stale = readHistoryCache<number>("u1", "spending", 1000 + FRESH_MS)!;
  assert.deepEqual(stale.rows, [1, 2, 3]); // on l'affiche quand même, en la rafraîchissant
  assert.equal(stale.fresh, false);
});

test("dépenses et revenus, et utilisateurs, ne se mélangent pas", () => {
  invalidateHistoryCache();
  writeHistoryCache("u1", "spending", ["s"], cacheVersion());
  writeHistoryCache("u1", "revenue", ["r"], cacheVersion());
  assert.deepEqual(readHistoryCache("u1", "revenue")!.rows, ["r"]);
  assert.equal(readHistoryCache("u2", "spending"), null);
});

test("une écriture de données vide le cache", () => {
  invalidateHistoryCache();
  writeHistoryCache("u1", "spending", ["a"], cacheVersion());
  invalidateHistoryCache();
  assert.equal(readHistoryCache("u1", "spending"), null);
});

test("une lecture lancée avant une écriture ne remplit pas le cache avec des données périmées", () => {
  invalidateHistoryCache();
  const started = cacheVersion(); // lecture lancée ici…
  invalidateHistoryCache(); // …pendant qu'une dépense est ajoutée ailleurs
  assert.equal(writeHistoryCache("u1", "spending", ["périmé"], started), false);
  assert.equal(readHistoryCache("u1", "spending"), null);
});

test("modification locale : la copie est mise à jour sans devenir « à jour » artificiellement", () => {
  invalidateHistoryCache();
  writeHistoryCache("u1", "spending", ["a", "b"], cacheVersion(), 1000);
  rememberHistoryRows("u1", "spending", ["a"], 1000 + FRESH_MS * 10); // la date de lecture d'origine est conservée
  const e = readHistoryCache<string>("u1", "spending", 1000 + FRESH_MS * 10)!;
  assert.deepEqual(e.rows, ["a"]);
  assert.equal(e.fresh, false);
  // sans copie préalable : elle est créée (l'écran vient de la modifier)
  invalidateHistoryCache();
  rememberHistoryRows("u1", "revenue", ["x"], 5000);
  assert.deepEqual(readHistoryCache("u1", "revenue", 5000)!.rows, ["x"]);
});
