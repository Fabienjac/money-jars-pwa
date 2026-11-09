import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { handler } = require("../netlify/functions/manageSubscription.js")._test;

const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service", STRIPE_SECRET_KEY: "rk_test", URL: "https://app.example.com/" };

function makeDeps({ sub = { stripe_customer_id: "cus_1" }, stripe = () => ({ status: 200, body: { url: "https://billing.stripe.com/s/abc" } }), env = ENV, subError = null } = {}) {
  const calls = { stripe: [], eq: [] };
  const db = {
    auth: { getUser: async (t) => (t === "good" ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: { message: "bad" } }) },
    from: () => ({ select: () => ({ eq: (c, v) => { calls.eq.push([c, v]); return { maybeSingle: async () => ({ data: sub, error: subError }) }; } }) }),
  };
  const fetch = async (url, init) => {
    calls.stripe.push({ url, init });
    const out = stripe();
    return { ok: out.status < 300, status: out.status, json: async () => out.body ?? {} };
  };
  return { deps: { env, createDb: () => db, fetch }, calls };
}
const req = (over = {}) => ({ httpMethod: "POST", headers: { authorization: "Bearer good" }, body: "{}", ...over });

test("portail : session créée pour le client Stripe DU COMPTE, retour sur le site", async () => {
  const { deps, calls } = makeDeps();
  const res = await handler(req(), deps);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).url, "https://billing.stripe.com/s/abc");
  assert.deepEqual(calls.eq, [["user_id", "u1"]]);
  assert.equal(calls.stripe[0].url, "https://api.stripe.com/v1/billing_portal/sessions");
  const sent = new URLSearchParams(calls.stripe[0].init.body);
  assert.equal(sent.get("customer"), "cus_1");
  assert.equal(sent.get("return_url"), "https://app.example.com/");
  assert.equal(calls.stripe[0].init.headers.Authorization, "Bearer rk_test");
});

test("un client Stripe fourni dans la requête est ignoré", async () => {
  const { deps, calls } = makeDeps();
  await handler(req({ body: JSON.stringify({ customer: "cus_autre", stripe_customer_id: "cus_autre" }) }), deps);
  assert.equal(new URLSearchParams(calls.stripe[0].init.body).get("customer"), "cus_1");
});

test("refus : pas de jeton, jeton invalide, mauvaise méthode", async () => {
  const { deps, calls } = makeDeps();
  assert.equal((await handler(req({ headers: {} }), deps)).statusCode, 401);
  assert.equal((await handler(req({ headers: { authorization: "Bearer mauvais" } }), deps)).statusCode, 401);
  assert.equal((await handler(req({ httpMethod: "GET" }), deps)).statusCode, 405);
  assert.deepEqual(calls.stripe, []);
});

test("pas de client Stripe (essai, admin) : 404 no_customer", async () => {
  const { deps, calls } = makeDeps({ sub: { stripe_customer_id: null } });
  const res = await handler(req(), deps);
  assert.equal(res.statusCode, 404);
  assert.equal(JSON.parse(res.body).error, "no_customer");
  assert.deepEqual(calls.stripe, []);
});

test("clé Stripe absente : 501 not_configured", async () => {
  const { deps } = makeDeps({ env: { ...ENV, STRIPE_SECRET_KEY: undefined } });
  const res = await handler(req(), deps);
  assert.equal(res.statusCode, 501);
  assert.equal(JSON.parse(res.body).error, "not_configured");
});

test("erreur Stripe ou base : 502 / 500, jamais d'adresse", async () => {
  const a = makeDeps({ stripe: () => ({ status: 400, body: { error: { message: "No configuration" } } }) });
  const r = await handler(req(), a.deps);
  assert.equal(r.statusCode, 502);
  assert.equal(JSON.parse(r.body).url, undefined);
  assert.equal((await handler(req(), makeDeps({ subError: { message: "boom" } }).deps)).statusCode, 500);
});
