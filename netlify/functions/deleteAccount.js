// netlify/functions/deleteAccount.js
// Suppression du compte de l'utilisateur connecté, à sa demande.
//
// POST + jeton Supabase de l'utilisateur (en-tête Authorization: Bearer …) + { confirmEmail } :
//   - le serveur identifie l'utilisateur par son jeton : on ne supprime jamais que SON compte ;
//   - l'adresse saisie doit être celle du compte (garde-fou contre un clic ou une requête par erreur) ;
//   - un abonnement payant encore actif bloque la suppression (409 active_subscription) : on ne laisse jamais quelqu'un
//     continuer à payer un compte qui n'existe plus. Deux issues : résilier d'abord (manageSubscription.js, portail
//     Stripe), ou renvoyer { cancelSubscription: true } : l'abonnement est alors résilié tout de suite chez Stripe
//     (sans remboursement de la période en cours), puis le compte supprimé. Si Stripe échoue, rien n'est supprimé (502) ;
//   - la suppression de l'utilisateur dans Supabase Auth efface en cascade toutes ses données (ON DELETE CASCADE :
//     dépenses, revenus, transferts, étiquettes, comptes, préférences, abonnements push). Seuls ses messages de
//     suggestion sont conservés, détachés de son identité (ON DELETE SET NULL, supabase/feedback.sql).
//
// Variables d'environnement : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (déjà utilisées par les autres fonctions) ;
// STRIPE_SECRET_KEY seulement pour la résiliation à la suppression (clé restreinte : « Abonnements : écriture »).

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const norm = (s) => String(s || "").trim().toLowerCase();

function defaultDeps() {
  const { createClient } = require("@supabase/supabase-js");
  return {
    env: process.env,
    createDb: (env) => createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }),
    fetch: (...args) => fetch(...args),
  };
}

/**
 * Résilie immédiatement les abonnements Stripe encore actifs de ce client. Un abonnement déjà disparu (404) compte comme résilié.
 * Retourne true si tout est résilié, false sinon.
 */
async function cancelAtStripe(d, key, sub) {
  const call = (method, path) =>
    d.fetch("https://api.stripe.com/v1" + path, { method, headers: { Authorization: "Bearer " + key } });
  try {
    let ids = sub.lemonsqueezy_id ? [sub.lemonsqueezy_id] : [];
    if (!ids.length && sub.stripe_customer_id) {
      const r = await call("GET", "/subscriptions?status=active&limit=20&customer=" + encodeURIComponent(sub.stripe_customer_id));
      const b = await r.json().catch(() => ({}));
      if (!r.ok) return false;
      ids = (b.data || []).map((x) => x.id);
    }
    if (!ids.length) return false; // rien d'identifiable à résilier : on ne supprime pas à l'aveugle
    for (const id of ids) {
      const r = await call("DELETE", "/subscriptions/" + encodeURIComponent(id));
      if (!r.ok && r.status !== 404) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function handler(event, deps) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const d = deps || defaultDeps();
  const env = d.env;

  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !env[k]);
  if (missing.length) return json(500, { error: "Configuration incomplète", missing });

  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(401, { error: "Non authentifié" });

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: "Corps invalide" });
  }

  const db = d.createDb(env);
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  const user = userData && userData.user;
  if (userErr || !user) return json(401, { error: "Jeton invalide" });

  if (!user.email || norm(body.confirmEmail) !== norm(user.email)) {
    return json(400, { error: "confirm_mismatch" });
  }

  const { data: sub, error: subErr } = await db
    .from("subscriptions")
    .select("plan, lemonsqueezy_id, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subErr) return json(500, { error: "Lecture de l'abonnement impossible" });
  if (sub && sub.plan === "active") {
    if (body.cancelSubscription !== true) return json(409, { error: "active_subscription" });
    if (!env.STRIPE_SECRET_KEY) return json(501, { error: "not_configured" });
    if (!(await cancelAtStripe(d, env.STRIPE_SECRET_KEY, sub))) return json(502, { error: "stripe_cancel_failed" });
  }

  const { error: delErr } = await db.auth.admin.deleteUser(user.id);
  if (delErr) return json(500, { error: "Suppression impossible" });
  return json(200, { ok: true });
}

exports.handler = (event) => handler(event);
exports._test = { handler };
