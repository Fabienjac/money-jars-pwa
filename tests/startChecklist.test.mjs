import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { STEP_ORDER, computeSteps, progressOf, nextStep, shouldShowEntry, RECENT_DAYS } = await loadTs("src/startChecklist.ts");

const none = { accounts: 0, revenues: 0, spendings: 0, manualRules: 0, voiceUsed: false, installed: false };
const byId = (steps, id) => steps.find((s) => s.id === id);

test("7 étapes dans l'ordre ; la répartition des jarres est déjà faite", () => {
  const steps = computeSteps(none);
  assert.deepEqual(steps.map((s) => s.id), ["jars", "accounts", "revenue", "spending", "voice", "rule", "install"]);
  assert.deepEqual(STEP_ORDER, steps.map((s) => s.id));
  assert.equal(byId(steps, "jars").done, true);
  assert.deepEqual(progressOf(steps), { done: 1, total: 7, complete: false });
});

test("chaque étape se coche d'après ses données", () => {
  const steps = computeSteps({ accounts: 2, revenues: 1, spendings: 5, manualRules: 1, voiceUsed: true, installed: true });
  assert.ok(steps.every((s) => s.done));
  assert.deepEqual(progressOf(steps), { done: 7, total: 7, complete: true });
  const partial = computeSteps({ ...none, revenues: 1, voiceUsed: true });
  assert.deepEqual(partial.filter((s) => s.done).map((s) => s.id), ["jars", "revenue", "voice"]);
});

test("lecture impossible (null) : l'étape reste à faire, rien ne plante", () => {
  const steps = computeSteps({ accounts: null, revenues: null, spendings: null, manualRules: null, voiceUsed: false, installed: false });
  assert.deepEqual(progressOf(steps), { done: 1, total: 7, complete: false });
  assert.equal(byId(steps, "rule").later, true);
});

test("la règle automatique est « plus tard » tant qu'il y a moins de 3 dépenses", () => {
  assert.equal(byId(computeSteps({ ...none, spendings: 2 }), "rule").later, true);
  assert.equal(byId(computeSteps({ ...none, spendings: 3 }), "rule").later, false);
  assert.equal(byId(computeSteps({ ...none, spendings: 0, manualRules: 1 }), "rule").later, false); // faite : plus rien à repousser
});

test("nextStep : la première étape à faire, en laissant les étapes « plus tard » pour la fin", () => {
  assert.equal(nextStep(computeSteps(none)), "accounts");
  assert.equal(nextStep(computeSteps({ ...none, accounts: 1 })), "revenue");
  // tout est fait sauf la règle (plus tard) et l'installation : l'installation passe d'abord
  assert.equal(nextStep(computeSteps({ accounts: 1, revenues: 1, spendings: 1, manualRules: 0, voiceUsed: true, installed: false })), "install");
  // il ne reste que la règle (plus tard) : on la propose quand même
  assert.equal(nextStep(computeSteps({ accounts: 1, revenues: 1, spendings: 1, manualRules: 0, voiceUsed: true, installed: true })), "rule");
  assert.equal(nextStep(computeSteps({ accounts: 1, revenues: 1, spendings: 5, manualRules: 1, voiceUsed: true, installed: true })), null);
});

test("shouldShowEntry : compte récent, liste ni terminée ni masquée", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const day = 24 * 3600 * 1000;
  const base = { createdAt: new Date(now - 5 * day).toISOString(), now, dismissed: false, complete: false };
  assert.equal(shouldShowEntry(base), true);
  assert.equal(shouldShowEntry({ ...base, dismissed: true }), false);
  assert.equal(shouldShowEntry({ ...base, complete: true }), false);
  assert.equal(shouldShowEntry({ ...base, createdAt: new Date(now - (RECENT_DAYS + 1) * day).toISOString() }), false);
  assert.equal(shouldShowEntry({ ...base, createdAt: new Date(now - (RECENT_DAYS - 1) * day).toISOString() }), true);
  assert.equal(shouldShowEntry({ ...base, createdAt: null }), false);
  assert.equal(shouldShowEntry({ ...base, createdAt: "pas une date" }), false);
});

test("chaque étape a ses textes en français et en anglais", async () => {
  const fr = (await loadTs("src/i18n/fr.ts")).default;
  const en = (await loadTs("src/i18n/en.ts")).default;
  const keys = ["start.pageTitle", "start.intro", "start.progress", "start.done", "start.later", "start.complete", "start.import", "start.help", "start.hide", "more.start", "more.startSub", "start.install.undo"];
  for (const id of STEP_ORDER) keys.push(`start.${id}.title`, `start.${id}.desc`, `start.${id}.action`);
  for (const k of keys) {
    assert.ok(typeof fr[k] === "string" && fr[k].trim(), `fr manque : ${k}`);
    assert.ok(typeof en[k] === "string" && en[k].trim(), `en manque : ${k}`);
  }
});

test("shouldShowHomeTour : compte récent resté vide, liste non masquée", async () => {
  const { shouldShowHomeTour, isRecentAccount } = await loadTs("src/startChecklist.ts");
  const now = Date.parse("2026-11-10T12:00:00Z");
  const day = 24 * 3600 * 1000;
  const base = { createdAt: new Date(now - 2 * day).toISOString(), now, dismissed: false, spendings: 0, revenues: 0 };
  assert.equal(shouldShowHomeTour(base), true);
  assert.equal(shouldShowHomeTour({ ...base, spendings: 1 }), false);   // dès la première saisie, il disparaît
  assert.equal(shouldShowHomeTour({ ...base, revenues: 1 }), false);
  assert.equal(shouldShowHomeTour({ ...base, dismissed: true }), false);
  assert.equal(shouldShowHomeTour({ ...base, spendings: null }), false); // lecture impossible : rien d'affiché
  assert.equal(shouldShowHomeTour({ ...base, createdAt: new Date(now - 90 * day).toISOString() }), false); // compte ancien
  assert.equal(isRecentAccount("n'importe quoi", now), false);
});
