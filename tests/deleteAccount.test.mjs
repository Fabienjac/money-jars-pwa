import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { _test } = require("../netlify/functions/deleteAccount.js");
const { handler } = _test;

const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" };

function makeDeps({ user = { id: "u1", email: "Fabien@Example.com" }, plan = null, deleteError = null, subError = null } = {}) {
  const calls = { deleted: [], tokens: [] };
  const db = {
    auth: {
      getUser: async (token) => { calls.tokens.push(token); return token === "good" ? { data: { user }, error: null } : { data: { user: null }, error: { message: "bad" } }; },
      admin: { deleteUser: async (id) => { calls.deleted.push(id); return { error: deleteError }; } },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: plan ? { plan } : null, error: subError }) }) }) }),
  };
  return { deps: { env: ENV, createDb: () => db }, calls };
}

const req = (over = {}) => ({ httpMethod: "POST", headers: { authorization: "Bearer good" }, body: JSON.stringify({ confirmEmail: "fabien@example.com" }), ...over });

test("suppression : adresse confirmée (casse ignorée), essai gratuit → compte supprimé", async () => {
  const { deps, calls } = makeDeps({ plan: "trial" });
  const res = await handler(req(), deps);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.deleted, ["u1"]);
});

test("l'utilisateur est celui du jeton : jamais un identifiant fourni par le client", async () => {
  const { deps, calls } = makeDeps();
  const res = await handler(req({ body: JSON.stringify({ confirmEmail: "fabien@example.com", userId: "autre", user_id: "autre" }) }), deps);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.deleted, ["u1"]);
});

test("refus sans jeton, avec un jeton invalide, ou avec une autre méthode", async () => {
  const { deps, calls } = makeDeps();
  assert.equal((await handler(req({ headers: {} }), deps)).statusCode, 401);
  assert.equal((await handler(req({ headers: { authorization: "Bearer mauvais" } }), deps)).statusCode, 401);
  assert.equal((await handler(req({ httpMethod: "GET" }), deps)).statusCode, 405);
  assert.deepEqual(calls.deleted, []);
});

test("adresse de confirmation absente ou différente : rien n'est supprimé", async () => {
  const { deps, calls } = makeDeps();
  assert.equal((await handler(req({ body: JSON.stringify({ confirmEmail: "autre@example.com" }) }), deps)).statusCode, 400);
  assert.equal((await handler(req({ body: JSON.stringify({}) }), deps)).statusCode, 400);
  assert.equal((await handler(req({ body: "pas du json" }), deps)).statusCode, 400);
  assert.deepEqual(calls.deleted, []);
});

test("abonnement payant actif : refus 409, rien n'est supprimé ; abonnement résilié : suppression possible", async () => {
  const active = makeDeps({ plan: "active" });
  const res = await handler(req(), active.deps);
  assert.equal(res.statusCode, 409);
  assert.equal(JSON.parse(res.body).error, "active_subscription");
  assert.deepEqual(active.calls.deleted, []);
  const cancelled = makeDeps({ plan: "cancelled" });
  assert.equal((await handler(req(), cancelled.deps)).statusCode, 200);
});

test("erreurs côté base : 500, sans prétendre avoir supprimé", async () => {
  const a = makeDeps({ deleteError: { message: "boom" } });
  assert.equal((await handler(req(), a.deps)).statusCode, 500);
  const b = makeDeps({ subError: { message: "boom" } });
  const r = await handler(req(), b.deps);
  assert.equal(r.statusCode, 500);
  assert.deepEqual(b.calls.deleted, []);
});

test("configuration incomplète : 500 explicite", async () => {
  const res = await handler(req(), { env: {}, createDb: () => { throw new Error("ne doit pas être appelé"); } });
  assert.equal(res.statusCode, 500);
});

// ── Résiliation Stripe à la suppression ───────────────────────────────────────

function makeStripeDeps({ sub, stripe, key = "rk_test" } = {}) {
  const calls = { deleted: [], stripe: [] };
  const db = {
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", email: "fabien@example.com" } }, error: null }),
      admin: { deleteUser: async (id) => { calls.deleted.push(id); return { error: null }; } },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan: "active", ...sub }, error: null }) }) }) }),
  };
  const fetch = async (url, init) => {
    calls.stripe.push({ url, method: init.method, auth: init.headers.Authorization });
    const out = stripe(url, init);
    return { ok: out.status >= 200 && out.status < 300, status: out.status, json: async () => out.body ?? {} };
  };
  return { deps: { env: { ...ENV, ...(key ? { STRIPE_SECRET_KEY: key } : {}) }, createDb: () => db, fetch }, calls };
}
const cancelReq = (over = {}) => req({ body: JSON.stringify({ confirmEmail: "fabien@example.com", cancelSubscription: true, ...over }) });

test("abonnement actif + cancelSubscription : résilié chez Stripe (immédiatement), puis compte supprimé", async () => {
  const { deps, calls } = makeStripeDeps({ sub: { lemonsqueezy_id: "sub_1", stripe_customer_id: "cus_1" }, stripe: () => ({ status: 200 }) });
  const res = await handler(cancelReq(), deps);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.stripe.map((c) => [c.method, c.url]), [["DELETE", "https://api.stripe.com/v1/subscriptions/sub_1"]]);
  assert.equal(calls.stripe[0].auth, "Bearer rk_test");
  assert.deepEqual(calls.deleted, ["u1"]);
});

test("sans cancelSubscription : toujours 409 et Stripe n'est pas appelé", async () => {
  const { deps, calls } = makeStripeDeps({ sub: { lemonsqueezy_id: "sub_1" }, stripe: () => ({ status: 200 }) });
  const res = await handler(req(), deps);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(calls.stripe, []);
  assert.deepEqual(calls.deleted, []);
});

test("abonnement déjà introuvable chez Stripe (404) : compte comme résilié", async () => {
  const { deps, calls } = makeStripeDeps({ sub: { lemonsqueezy_id: "sub_1" }, stripe: () => ({ status: 404 }) });
  assert.equal((await handler(cancelReq(), deps)).statusCode, 200);
  assert.deepEqual(calls.deleted, ["u1"]);
});

test("échec Stripe : 502 et le compte n'est PAS supprimé", async () => {
  const { deps, calls } = makeStripeDeps({ sub: { lemonsqueezy_id: "sub_1" }, stripe: () => ({ status: 500 }) });
  const res = await handler(cancelReq(), deps);
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).error, "stripe_cancel_failed");
  assert.deepEqual(calls.deleted, []);
});

test("clé Stripe absente : 501, rien n'est supprimé", async () => {
  const { deps, calls } = makeStripeDeps({ sub: { lemonsqueezy_id: "sub_1" }, stripe: () => ({ status: 200 }), key: "" });
  assert.equal((await handler(cancelReq(), deps)).statusCode, 501);
  assert.deepEqual(calls.deleted, []);
});

test("identifiant d'abonnement manquant : recherche par client, résilie chacun ; aucun trouvé → pas de suppression à l'aveugle", async () => {
  const two = makeStripeDeps({
    sub: { lemonsqueezy_id: null, stripe_customer_id: "cus_1" },
    stripe: (url, init) => (init.method === "GET" ? { status: 200, body: { data: [{ id: "sub_a" }, { id: "sub_b" }] } } : { status: 200 }),
  });
  assert.equal((await handler(cancelReq(), two.deps)).statusCode, 200);
  assert.deepEqual(two.calls.stripe.map((c) => c.method), ["GET", "DELETE", "DELETE"]);
  assert.match(two.calls.stripe[0].url, /customer=cus_1/);

  const none = makeStripeDeps({ sub: { lemonsqueezy_id: null, stripe_customer_id: "cus_1" }, stripe: () => ({ status: 200, body: { data: [] } }) });
  assert.equal((await handler(cancelReq(), none.deps)).statusCode, 502);
  assert.deepEqual(none.calls.deleted, []);
});

test("essai gratuit : cancelSubscription ignoré, Stripe jamais appelé", async () => {
  const { deps, calls } = makeStripeDeps({ sub: { plan: "trial" }, stripe: () => ({ status: 200 }) });
  assert.equal((await handler(cancelReq(), deps)).statusCode, 200);
  assert.deepEqual(calls.stripe, []);
});
