import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { computeTagStats } = await loadTs("src/tagStatsCore.ts");
const TAGS = [
  { id: "loisirs", name: "Loisirs", emoji: "🎉", color: "#0a0" },
  { id: "exceptionnel", name: "Exceptionnel", emoji: "🌟", color: "#fa0" },
  { id: "alimentaire", name: "Alimentation", emoji: "🍓", color: "#8c6" },
];
const calculateTagStats = (txs) => computeTagStats(txs, TAGS, (id) => TAGS.find((t) => t.id === id));

const tx = (amount, tags) => ({ date: "2026-10-01", jar: "NEC", account: "Cash", amount, description: "x", tags });

test("une dépense à deux étiquettes compte en entier dans chacune ; les parts se calculent sur le total réellement dépensé", () => {
  const stats = calculateTagStats([
    tx(100, "loisirs,exceptionnel"), // 100 € comptés dans les deux étiquettes
    tx(100, "alimentaire"),
    tx(100, ""), // sans étiquette : dans le total dépensé, pas dans les étiquettes
  ]);
  const by = Object.fromEntries(stats.map((s) => [s.tagId, s]));
  assert.equal(by.loisirs.totalAmount, 100);
  assert.equal(by.exceptionnel.totalAmount, 100);
  // total réellement dépensé = 300 € (100 + 100 + 100), alors que la somme des étiquettes est de 300 € aussi
  assert.ok(Math.abs(by.loisirs.percentage - 100 / 3) < 1e-9);
  assert.ok(Math.abs(by.alimentaire.percentage - 100 / 3) < 1e-9);
  // somme des parts > part du dépensé étiqueté : 3 étiquettes × 33,3 % = 100 % alors que 200 € seulement sont étiquetés
  const sumShares = stats.reduce((a, s) => a + s.percentage, 0);
  assert.ok(Math.abs(sumShares - 100) < 1e-9);
});

test("le poids du graphique en anneau se calcule sur la somme des étiquettes et totalise 100 %", () => {
  const stats = calculateTagStats([tx(300, "loisirs,exceptionnel"), tx(100, "alimentaire")]);
  const pie = stats.reduce((a, s) => a + s.pieShare, 0);
  assert.ok(Math.abs(pie - 100) < 1e-9);
  const by = Object.fromEntries(stats.map((s) => [s.tagId, s]));
  assert.ok(Math.abs(by.loisirs.pieShare - 300 / 700 * 100) < 1e-9);
  // mais la part « de ce que j'ai dépensé » reste sur 400 € réellement dépensés
  assert.ok(Math.abs(by.loisirs.percentage - 75) < 1e-9);
});

test("aucune dépense : pas de division par zéro", () => {
  assert.deepEqual(calculateTagStats([]), []);
  const stats = calculateTagStats([tx(0, "loisirs")]);
  assert.equal(stats[0].percentage, 0);
  assert.equal(stats[0].pieShare, 0);
});
