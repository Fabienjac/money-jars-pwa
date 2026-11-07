import { test } from "node:test";
import assert from "node:assert/strict";
import { computeJarAlerts, hasUnseenAlerts, jarAlertLevel, markAllSeen, reconcileSeen } from "../src/jarAlerts.ts";

const jar = (revenues: number, spendings: number) => ({ revenues, spendings });

test("niveau : sous 80 % rien, dès 80 % prévenu, au-delà de 100 % dépassée", () => {
  assert.equal(jarAlertLevel(jar(1000, 790)).level, 0);
  assert.equal(jarAlertLevel(jar(1000, 800)).level, 1);
  assert.equal(jarAlertLevel(jar(1000, 1000)).level, 1); // épuisée mais pas négative
  assert.equal(jarAlertLevel(jar(1000, 1000.004)).level, 1); // tolérance au centime
  assert.equal(jarAlertLevel(jar(1000, 1200)).level, 2);
  assert.equal(jarAlertLevel(jar(1000, 1200)).net, -200);
});

test("jarre sans revenu : dépassée dès la première dépense, sinon silencieuse", () => {
  assert.equal(jarAlertLevel(jar(0, 0)).level, 0);
  assert.equal(jarAlertLevel(jar(0, 25)).level, 2);
  assert.equal(jarAlertLevel(undefined).level, 0);
});

test("computeJarAlerts : tri dépassées d'abord, puis % décroissant ; null = aucune alerte", () => {
  const alerts = computeJarAlerts({
    NEC: jar(1000, 850),
    FFA: jar(1000, 100),
    PLAY: jar(500, 600),
    GIFT: jar(100, 95),
  });
  assert.deepEqual(alerts.map((a) => [a.jar, a.level]), [["PLAY", 2], ["GIFT", 1], ["NEC", 1]]);
  assert.deepEqual(computeJarAlerts(null), []);
});

test("point rouge : nouvelle alerte ou aggravation = non vu ; état consulté = vu", () => {
  const warn = computeJarAlerts({ NEC: jar(1000, 850) });
  assert.equal(hasUnseenAlerts(warn, {}), true);
  const seen = markAllSeen(warn);
  assert.equal(hasUnseenAlerts(warn, seen), false);
  const worse = computeJarAlerts({ NEC: jar(1000, 1100) });
  assert.equal(hasUnseenAlerts(worse, seen), true); // 80 % vu → dépassée : re-signalé
  assert.equal(hasUnseenAlerts(computeJarAlerts({}), {}), false);
});

test("reconcileSeen : une jarre qui redescend est oubliée, un nouveau franchissement re-signale", () => {
  const over = computeJarAlerts({ NEC: jar(1000, 1100), PLAY: jar(100, 90) });
  let seen = markAllSeen(over);
  // un revenu arrive : NEC repasse sous 80 %, PLAY reste à 90 %
  const after = computeJarAlerts({ NEC: jar(5000, 1100), PLAY: jar(100, 90) });
  seen = reconcileSeen(after, seen);
  assert.deepEqual(seen, { PLAY: 1 });
  // NEC franchit de nouveau le seuil plus tard
  const later = computeJarAlerts({ NEC: jar(5000, 4200), PLAY: jar(100, 90) });
  assert.equal(hasUnseenAlerts(later, seen), true);
});
