// netlify/functions/deleteAccount.js
// Suppression du compte de l'utilisateur connecté, à sa demande.
//
// POST + jeton Supabase de l'utilisateur (en-tête Authorization: Bearer …) + { confirmEmail } :
//   - le serveur identifie l'utilisateur par son jeton : on ne supprime jamais que SON compte ;
//   - l'adresse saisie doit être celle du compte (garde-fou contre un clic ou une requête par erreur) ;
//   - un abonnement payant encore actif bloque la suppression (409 active_subscription) : on ne laisse jamais quelqu'un
//     continuer à payer un compte qui n'existe plus ; à résilier d'abord chez Stripe ;
//   - la suppression de l'utilisateur dans Supabase Auth efface en cascade toutes ses données (ON DELETE CASCADE :
//     dépenses, revenus, transferts, étiquettes, comptes, préférences, abonnements push). Seuls ses messages de
//     suggestion sont conservés, détachés de son identité (ON DELETE SET NULL, supabase/feedback.sql).
//
// Variables d'environnement : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (déjà utilisées par les autres fonctions).

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
  };
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
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subErr) return json(500, { error: "Lecture de l'abonnement impossible" });
  if (sub && sub.plan === "active") return json(409, { error: "active_subscription" });

  const { error: delErr } = await db.auth.admin.deleteUser(user.id);
  if (delErr) return json(500, { error: "Suppression impossible" });
  return json(200, { ok: true });
}

exports.handler = (event) => handler(event);
exports._test = { handler };
