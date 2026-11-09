import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { clearAccountLocalData } = await loadTs("src/sessionCleanup.ts");

function fakeStorage(entries) {
  const m = new Map(Object.entries(entries));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()].sort(),
  };
}

test("déconnexion : les copies locales des données du compte disparaissent, pas les réglages d'affichage", () => {
  const s = fakeStorage({
    "mjars:cache:totals": "{}", "mjars:cache:analytics": "{}", "mjars:cache:spendings": "{}",
    "mjars:tags": "[]", "mjars:jarSettings": "[]", "mjars:monthlyBudget": "900", "mjars:streakCount": "4",
    "mjars:lang": "fr", "mjars:ref": "seminaire", "mjars:preferredCurrencies": "[]", "mjars:currencyFavorites": "[]",
    "mj-dark-mode": "1", "sb-abc-auth-token": "x", offline_data: "{}",
  });
  const removed = clearAccountLocalData(s);
  assert.equal(removed, 7);
  assert.deepEqual(s.keys(), [
    "mj-dark-mode", "mjars:currencyFavorites", "mjars:lang", "mjars:preferredCurrencies", "mjars:ref", "offline_data", "sb-abc-auth-token",
  ]);
});

test("stockage vide : rien à faire", () => {
  assert.equal(clearAccountLocalData(fakeStorage({})), 0);
});
