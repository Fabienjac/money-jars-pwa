import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Exécute public/sw.js avec un faux « self » et renvoie les gestionnaires enregistrés.
function loadSw(clients = []) {
  const handlers = {};
  const shown = [];
  const opened = [];
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve(), matchAll: async () => clients, openWindow: async (u) => { opened.push(u); } },
    registration: { showNotification: async (title, opts) => { shown.push({ title, opts }); } },
  };
  vm.runInNewContext(fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self });
  return { handlers, shown, opened };
}

const pushEvent = (payload) => {
  const waits = [];
  return { data: { json: () => payload, text: () => String(payload) }, waitUntil: (p) => waits.push(p), waits };
};

test("push : affiche toujours une notification avec titre, texte, tag et adresse", async () => {
  const sw = loadSw();
  const ev = pushEvent({ title: "Alerte jarre", body: "🎮 Fun : dépassée de 50,00 €", tag: "jar-alerts", url: "/#alerts" });
  sw.handlers.push(ev);
  await Promise.all(ev.waits);
  assert.equal(sw.shown.length, 1);
  assert.equal(sw.shown[0].title, "Alerte jarre");
  assert.equal(sw.shown[0].opts.body, "🎮 Fun : dépassée de 50,00 €");
  assert.equal(sw.shown[0].opts.tag, "jar-alerts");
  assert.equal(sw.shown[0].opts.data.url, "/#alerts");
});

test("push : données absentes ou invalides = notification quand même (Safari l'exige), adresse externe refusée", async () => {
  const sw = loadSw();
  const bad = { data: { json: () => { throw new Error("pas du JSON"); }, text: () => "texte brut" }, waitUntil: (p) => bad.w.push(p), w: [] };
  sw.handlers.push(bad);
  const evil = pushEvent({ title: "x", url: "//evil.example/phish" });
  sw.handlers.push(evil);
  await Promise.all([...bad.w, ...evil.waits]);
  assert.equal(sw.shown.length, 2);
  assert.equal(sw.shown[0].title, "Money Jars");
  assert.equal(sw.shown[0].opts.body, "texte brut");
  assert.equal(sw.shown[1].opts.data.url, "/");
});

test("clic : réutilise la fenêtre ouverte, sinon en ouvre une", async () => {
  const calls = [];
  const win = { focus: () => { calls.push("focus"); return Promise.resolve(); }, navigate: (u) => calls.push("navigate " + u) };
  const click = (sw) => {
    const waits = [];
    sw.handlers.notificationclick({ notification: { close: () => calls.push("close"), data: { url: "/#alerts" } }, waitUntil: (p) => waits.push(p) });
    return Promise.all(waits);
  };
  const withWindow = loadSw([win]);
  await click(withWindow);
  assert.deepEqual(calls, ["close", "navigate /#alerts", "focus"]);
  const noWindow = loadSw([]);
  await click(noWindow);
  assert.deepEqual(noWindow.opened, ["/#alerts"]);
});
