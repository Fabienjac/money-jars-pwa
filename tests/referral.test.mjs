import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { parseRef, shouldTagUser } = await loadTs("src/referral.ts");

test("parseRef : lit ?ref=, en minuscules, et refuse les valeurs douteuses", () => {
  assert.equal(parseRef("?ref=seminaire"), "seminaire");
  assert.equal(parseRef("?utm=x&ref=Seminaire-2026"), "seminaire-2026");
  assert.equal(parseRef(""), null);
  assert.equal(parseRef("?ref="), null);
  assert.equal(parseRef("?ref=<script>"), null);
  assert.equal(parseRef("?ref=" + "a".repeat(33)), null);
  assert.equal(parseRef("?ref=un%20deux"), null);
});

const NOW = Date.parse("2026-11-20T12:00:00Z");
const recent = { created_at: "2026-11-20T11:00:00Z", user_metadata: {} };

test("shouldTagUser : seulement un compte récent, sans origine déjà enregistrée", () => {
  assert.equal(shouldTagUser(recent, "seminaire", NOW), true);
  assert.equal(shouldTagUser(recent, null, NOW), false);
  assert.equal(shouldTagUser({ ...recent, user_metadata: { ref: "newsletter" } }, "seminaire", NOW), false);
  assert.equal(shouldTagUser({ created_at: "2026-11-01T11:00:00Z", user_metadata: {} }, "seminaire", NOW), false);
  assert.equal(shouldTagUser({ user_metadata: {} }, "seminaire", NOW), false);
  assert.equal(shouldTagUser({ created_at: "n'importe quoi" }, "seminaire", NOW), false);
});
