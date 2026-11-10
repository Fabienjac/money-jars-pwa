import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { createTag, slugifyTagId, splitTags, TAG_COLORS } = await loadTs("src/tagCreate.ts");

const tag = (id, name, favori = true) => ({ id, name, emoji: "🏷️", color: "#000", favori });
const existing = [tag("alimentaire", "Alimentation"), tag("administratif", "Administratif", false), tag("sante_corps", "Santé & corps")];

test("slugifyTagId : sans accents, mots reliés par des tirets bas", () => {
  assert.equal(slugifyTagId("Santé & corps"), "sante_corps");
  assert.equal(slugifyTagId("  Café  du  matin "), "cafe_du_matin");
});

test("createTag : nouveau tag favori avec identifiant propre et couleur", () => {
  const r = createTag("  Animaux de compagnie ", "🐶", existing);
  assert.equal(r.kind, "created");
  assert.equal(r.tag.id, "animaux_de_compagnie");
  assert.equal(r.tag.name, "Animaux de compagnie");
  assert.equal(r.tag.emoji, "🐶");
  assert.equal(r.tag.favori, true);
  assert.equal(r.tag.color, TAG_COLORS[existing.length % TAG_COLORS.length]);
});

test("createTag : emoji par défaut", () => {
  assert.equal(createTag("Vélo", "  ", existing).tag.emoji, "🏷️");
});

test("createTag : un nom déjà pris (casse, accents, ponctuation) renvoie le tag existant, y compris non favori", () => {
  assert.equal(createTag("alimentation", "", existing).tag.id, "alimentaire");
  assert.equal(createTag("SANTE corps", "", existing).kind, "existing");
  assert.equal(createTag("administratif", "", existing).tag.id, "administratif");
  assert.equal(createTag("alimentaire", "", existing).kind, "existing"); // par identifiant aussi
});

test("createTag : erreurs", () => {
  assert.deepEqual(createTag("   ", "", existing), { kind: "error", reason: "empty" });
  assert.deepEqual(createTag("!!!", "", existing), { kind: "error", reason: "empty" });
  assert.deepEqual(createTag("x".repeat(41), "", existing), { kind: "error", reason: "tooLong" });
});

test("createTag : même identifiant qu'un tag existant → on retrouve ce tag, jamais de doublon", () => {
  const r = createTag("Vélo", "", [tag("velo", "Bicyclette")]);
  assert.equal(r.kind, "existing");
  assert.equal(r.tag.name, "Bicyclette");
});

test("splitTags : favoris et tags déjà choisis d'abord, les autres derrière « N autres »", () => {
  assert.deepEqual(splitTags(existing, []).shown.map((t) => t.id), ["alimentaire", "sante_corps"]);
  assert.deepEqual(splitTags(existing, []).others.map((t) => t.id), ["administratif"]);
  assert.deepEqual(splitTags(existing, ["administratif"]).shown.map((t) => t.id), ["alimentaire", "administratif", "sante_corps"]);
  assert.deepEqual(splitTags(existing, ["administratif"]).others, []);
});
