// netlify/functions/manageSubscription.js
// Ouvre le portail client Stripe de l'utilisateur connecté (résilier, changer de formule, moyen de paiement, factures).
//
// POST + jeton Supabase de l'utilisateur (en-tête Authorization: Bearer …) → { url } : adresse d'une session de portail
// Stripe à ouvrir. Le client Stripe est celui enregistré pour CE compte (table subscriptions, rempli par le webhook) :
// l'utilisateur ne peut jamais ouvrir le portail d'un autre. Une résiliation faite dans le portail revient par le webhook
// (customer.subscription.updated / deleted → table subscriptions).
//
// Variables d'environnement : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (clé restreinte conseillée :
// « Portail client : écriture » + « Clients : lecture »), URL (adresse du site, fournie par Netlify) pour le retour.
// Prérequis côté Stripe : avoir enregistré une configuration du portail (Paramètres > Facturation > Portail client).

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function defaultDeps() {
  const { createClient } = require("@supabase/supabase-js");
  return {
    env: process.env,
    createDb: (env) => createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }),
    fetch: (...args) => fetch(...args),
  };
}

async function handler(event, deps) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const d = deps || defaultDeps();
  const env = d.env;

  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !env[k]);
  if (missing.length) return json(500, { error: "Configuration incomplète", missing });
  if (!env.STRIPE_SECRET_KEY) return json(501, { error: "not_configured" });

  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(401, { error: "Non authentifié" });

  const db = d.createDb(env);
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  const user = userData && userData.user;
  if (userErr || !user) return json(401, { error: "Jeton invalide" });

  const { data: sub, error: subErr } = await db
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subErr) return json(500, { error: "Lecture de l'abonnement impossible" });
  if (!sub || !sub.stripe_customer_id) return json(404, { error: "no_customer" });

  const headers = (event.headers) || {};
  const origin = env.URL || headers.origin || headers.Origin || "";
  const params = new URLSearchParams({ customer: sub.stripe_customer_id });
  if (origin) params.set("return_url", origin.replace(/\/+$/, "") + "/");

  let res;
  try {
    res = await d.fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch {
    return json(502, { error: "stripe_unreachable" });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) {
    console.error("Stripe portal error:", res.status, body && body.error && body.error.message);
    return json(502, { error: "stripe_error" });
  }
  return json(200, { url: body.url });
}

exports.handler = (event) => handler(event);
exports._test = { handler };
