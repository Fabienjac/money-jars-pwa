import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadTs } from "./_load.mjs";

const require = createRequire(import.meta.url);
const { handler, jarLevel, computeAlerts, buildPayload } = require("../netlify/functions/pushJarAlerts.js")._test;

// ── Faux Supabase en mémoire : juste ce que la fonction utilise ──────────────
class Q {
  constructor(tables, name) { this.t = tables; this.name = name; this.f = []; this.mode = "select"; this.ret = false; this.r = null; }
  select() { if (this.mode === "update") this.ret = true; return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  lt(c, v) { this.f.push((r) => r[c] < v); return this; }
  gt(c, v) { this.f.push((r) => r[c] > v); return this; }
  order() { return this; }
  range(a, b) { this.r = [a, b]; return this; }
  update(vals) { this.mode = "update"; this.vals = vals; return this; }
  delete() { this.mode = "delete"; return this; }
  upsert(row, opts) { this.mode = "upsert"; this.row = row; this.opts = opts || {}; return this; }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
  run() {
    if (!this.t[this.name]) this.t[this.name] = [];
    const rows = this.t[this.name];
    const match = rows.filter((r) => this.f.every((fn) => fn(r)));
    if (this.mode === "select") {
      const out = this.r ? match.slice(this.r[0], Math.min(this.r[1] + 1, this.r[0] + 1000)) : match;
      return { data: out.map((r) => ({ ...r })), error: null };
    }
    if (this.mode === "update") {
      match.forEach((r) => Object.assign(r, this.vals));
      return { data: this.ret ? match.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.mode === "delete") {
      this.t[this.name] = rows.filter((r) => !match.includes(r));
      return { data: null, error: null };
    }
    const found = rows.find((r) => r.user_id === this.row.user_id && r.jar_key === this.row.jar_key);
    if (!found) rows.push({ ...this.row });
    else if (!this.opts.ignoreDuplicates) Object.assign(found, this.row);
    return { data: null, error: null };
  }
}

const ENV = { SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k", VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s", VAPID_SUBJECT: "mailto:a@b.c" };
const LABELS = { PLAY: "Fun / Play", NEC: "Nécessités", GIFT: "Cadeaux" };

function setup({ devices = 1, spendings = [], revenue = 1000 } = {}) {
  const tables = {
    jar_settings: [],
    transactions_spending: spendings.map(([jar, amount]) => ({ user_id: "u1", jar, amount })),
    transactions_revenue: [{ user_id: "u1", amount: revenue, rate: null, crypto_quantity: null }],
    push_subscriptions: Array.from({ length: devices }, (_, i) => ({ user_id: "u1", endpoint: "ep" + i, p256dh: "k", auth: "a" })),
    jar_alert_notified: [],
  };
  const sent = [];
  const deps = {
    env: ENV,
    createDb: () => ({
      auth: {
        getUser: async (tok) =>
          tok === "good" ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: { message: "bad" } },
      },
      from: (n) => new Q(tables, n),
    }),
    webpush: {
      setVapidDetails() {},
      sendNotification: async (sub, body) => {
        if (sub.endpoint === "gone") {
          const e = new Error("gone");
          e.statusCode = 410;
          throw e;
        }
        sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) });
      },
    },
  };
  const call = async (action, extra = {}, token = "good") => {
    const r = await handler(
      {
        httpMethod: "POST",
        headers: { authorization: "Bearer " + token },
        body: JSON.stringify({ action, lang: "fr", currency: "€", labels: LABELS, ...extra }),
      },
      deps
    );
    return { ...r, json: JSON.parse(r.body) };
  };
  return { tables, sent, call, deps };
}

test("accès : méthode, configuration, jeton et action sont vérifiés avant tout", async () => {
  const { call, deps } = setup();
  assert.equal((await handler({ httpMethod: "GET" }, deps)).statusCode, 405);
  const noKey = { ...deps, env: { ...ENV, VAPID_PRIVATE_KEY: "" } };
  assert.equal((await handler({ httpMethod: "POST", headers: {}, body: "{}" }, noKey)).statusCode, 500);
  assert.equal((await handler({ httpMethod: "POST", headers: {}, body: "{}" }, deps)).statusCode, 401);
  assert.equal((await call("test", {}, "mauvais")).statusCode, 401);
  assert.equal((await call("nimporte")).statusCode, 400);
});

test("test : envoyé à chaque appareil ; un appareil désabonné (410) est oublié", async () => {
  const s = setup({ devices: 2 });
  s.tables.push_subscriptions.push({ user_id: "u1", endpoint: "gone", p256dh: "k", auth: "a" });
  const r = await s.call("test");
  assert.equal(r.statusCode, 200);
  assert.deepEqual([r.json.sent, r.json.devices], [2, 3]);
  assert.equal(s.tables.push_subscriptions.some((x) => x.endpoint === "gone"), false);
  assert.equal((await setup({ devices: 0 }).call("test")).json.sent, 0);
});

test("alertes : un seul message groupé par franchissement, puis silence tant que rien ne change", async () => {
  // revenu 1000 → NEC 550, PLAY 100 : NEC dépensé 600 (dépassée), PLAY 85 (85 %)
  const s = setup({ spendings: [["NEC", 600], ["PLAY", 85]] });
  const first = await s.call("jarAlerts");
  assert.deepEqual(first.json.alerts.sort(), ["NEC", "PLAY"]);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].title, "Alertes jarres");
  assert.match(s.sent[0].body, /🏺 Nécessités : dépassée de 50,00 €/);
  assert.match(s.sent[0].body, /🎮 Fun \/ Play : 85 % dépensé · reste 15,00 €/);
  assert.equal(s.sent[0].url, "/#alerts");

  const again = await s.call("jarAlerts");
  assert.equal(again.json.sent, 0);
  assert.equal(s.sent.length, 1);

  // GIFT (5 % = 50) franchit 80 % : seule cette jarre est notifiée
  s.tables.transactions_spending.push({ user_id: "u1", jar: "GIFT", amount: 45 });
  const third = await s.call("jarAlerts");
  assert.deepEqual(third.json.alerts, ["GIFT"]);
  assert.equal(s.sent.length, 2);
  assert.equal(s.sent[1].title, "Alerte jarre");

  // PLAY passe de 85 % à dépassée : niveau supérieur = nouvelle notification
  s.tables.transactions_spending.push({ user_id: "u1", jar: "PLAY", amount: 30 });
  assert.deepEqual((await s.call("jarAlerts")).json.alerts, ["PLAY"]);
});

test("une jarre qui redescend (nouveau revenu) oublie son niveau et re-notifie à son prochain franchissement", async () => {
  const s = setup({ spendings: [["NEC", 600]] });
  await s.call("jarAlerts");
  assert.equal(s.sent.length, 1);
  s.tables.transactions_revenue[0].amount = 5000; // NEC passe à 2 750 : plus d'alerte
  assert.equal((await s.call("jarAlerts")).json.sent, 0);
  assert.equal(s.tables.jar_alert_notified.find((r) => r.jar_key === "NEC").level, 0);
  s.tables.transactions_revenue[0].amount = 1000; // retour à la situation dépassée
  assert.equal((await s.call("jarAlerts")).json.sent, 1);
  assert.equal(s.sent.length, 2);
});

test("aucun appareil abonné : les niveaux sont mémorisés, donc pas de rafale d'anciennes alertes à l'abonnement", async () => {
  const s = setup({ devices: 0, spendings: [["NEC", 600]] });
  const r = await s.call("jarAlerts");
  assert.deepEqual([r.json.sent, r.json.devices], [0, 0]);
  s.tables.push_subscriptions.push({ user_id: "u1", endpoint: "ep0", p256dh: "k", auth: "a" });
  assert.equal((await s.call("jarAlerts")).json.sent, 0);
});

test("plus de 1000 dépenses : toutes sont lues (pas de total tronqué)", async () => {
  const many = Array.from({ length: 1500 }, () => ["PLAY", 1]);
  const s = setup({ spendings: many, revenue: 10000 }); // PLAY = 1000 € ; 1 500 € dépensés → dépassée
  assert.deepEqual((await s.call("jarAlerts")).json.alerts, ["PLAY"]);
});

test("le niveau calculé côté serveur est identique à celui de l'app (src/jarAlerts.ts)", async () => {
  const ts = await loadTs("src/jarAlerts.ts");
  for (const revenues of [0, 1, 100, 1000]) {
    for (const spendings of [0, 0.5, 79.9, 80, 99.99, 100, 100.004, 100.006, 150, 5000]) {
      const j = { revenues, spendings };
      assert.deepEqual(jarLevel(j).level, ts.jarAlertLevel(j).level, JSON.stringify(j));
    }
  }
  const jars = { NEC: { revenues: 100, spendings: 90 }, PLAY: { revenues: 10, spendings: 30 } };
  assert.deepEqual(
    computeAlerts(jars).map((a) => [a.jar, a.level]),
    ts.computeJarAlerts(jars).map((a) => [a.jar, a.level])
  );
});

test("texte en anglais et assainissement des libellés envoyés par le client", () => {
  const en = buildPayload([{ jar: "PLAY", level: 2, percent: 120, net: -20 }], { lang: "en", currency: "$", labels: { PLAY: "Fun\nINJECT" } });
  assert.equal(en.title, "Jar alert");
  assert.equal(en.body, "🎮 Fun INJECT : over by 20.00 $");
});
