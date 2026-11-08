import { test } from "node:test";
import assert from "node:assert/strict";
import { extremes, groupTagWeights, topShare } from "../src/tagWeight.ts";

const tag = (id: string, amount: number, total: number) => ({
  tagId: id, tagName: id, emoji: "", color: "#000", totalAmount: amount, count: 1, percentage: 0, pieShare: (amount / total) * 100,
});
const amounts = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
const total = amounts.reduce((a, b) => a + b, 0);
const stats = amounts.map((a, i) => tag("t" + i, a, total));

test("regroupe au-delà des 6 plus lourdes, sans perdre de poids", () => {
  const g = groupTagWeights([...stats].reverse()); // désordre en entrée
  assert.deepEqual(g.head.map((t) => t.tagId), ["t0", "t1", "t2", "t3", "t4", "t5"]);
  assert.equal(g.others.length, 4);
  assert.equal(g.othersAmount, 100);
  const sum = g.head.reduce((s, t) => s + t.pieShare, 0) + g.othersShare;
  assert.ok(Math.abs(sum - 100) < 1e-9);
});

test("une seule étiquette en trop n'est pas regroupée", () => {
  const g = groupTagWeights(stats.slice(0, 7));
  assert.equal(g.head.length, 7);
  assert.equal(g.others.length, 0);
  assert.equal(g.othersShare, 0);
  assert.equal(groupTagWeights(stats.slice(0, 8)).others.length, 2);
  assert.equal(groupTagWeights([]).head.length, 0);
});

test("top 3 et extrêmes", () => {
  assert.ok(Math.abs(topShare(stats, 3) - (270 / 550) * 100) < 1e-9);
  assert.ok(Math.abs(topShare(stats.slice(0, 2), 3) - (190 / 550) * 100) < 1e-9); // moins de 3 étiquettes : on additionne ce qu'il y a
  const e = extremes(stats);
  assert.equal(e.largest!.tagId, "t0");
  assert.equal(e.smallest!.tagId, "t9");
  assert.deepEqual(extremes([]), {});
  assert.equal(extremes([stats[3]]).largest!.tagId, extremes([stats[3]]).smallest!.tagId);
});
