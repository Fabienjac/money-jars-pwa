import { test } from "node:test";
import assert from "node:assert/strict";
import { planExceptionalSeed, shouldSeedDefaultTags } from "../src/lifestyleSeed.ts";

const tag = (id: string) => ({ id, name: id, emoji: "🏷️", color: "#000" });

test("déjà mis en place ou étiquettes pas encore chargées : on ne fait rien", () => {
  assert.deepEqual(planExceptionalSeed([tag("loisirs")], [], true), { addTag: false, selectTag: false, markDone: false });
  assert.deepEqual(planExceptionalSeed([], [], false), { addTag: false, selectTag: false, markDone: false });
});

test("utilisateur existant sans l'étiquette ni choix : on l'ajoute et on la présélectionne", () => {
  assert.deepEqual(planExceptionalSeed([tag("loisirs")], [], false), { addTag: true, selectTag: true, markDone: true });
});

test("l'étiquette existe déjà : pas de doublon, mais présélection si rien n'est choisi", () => {
  assert.deepEqual(planExceptionalSeed([tag("exceptionnel")], [], false), { addTag: false, selectTag: true, markDone: true });
});

test("l'utilisateur a déjà choisi ses étiquettes : son choix est respecté", () => {
  assert.deepEqual(planExceptionalSeed([tag("loisirs")], ["voyage"], false), { addTag: true, selectTag: false, markDone: true });
});

test("étiquettes par défaut : compte neuf (aucune étiquette dans le cloud, jamais mises en place) seulement", () => {
  assert.equal(shouldSeedDefaultTags([], false), true);
  assert.equal(shouldSeedDefaultTags([tag("loisirs")], false), false);   // l'utilisateur a déjà ses étiquettes
  assert.equal(shouldSeedDefaultTags([], true), false);                  // il les a toutes supprimées exprès : on ne les remet pas
});
