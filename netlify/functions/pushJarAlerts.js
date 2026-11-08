// netlify/functions/pushJarAlerts.js
// Notifications push d'alerte des jarres (80 % du solde dépensé, ou jarre dépassée).
//
// Appelée par l'app (POST + jeton Supabase de l'utilisateur) :
//   { action: "jarAlerts", lang, currency, labels }  → recalcule les alertes de l'utilisateur côté serveur et envoie
//                                                       un push pour chaque jarre qui franchit un niveau, une fois.
//   { action: "test",      lang }                    → envoie une notification de test à ses appareils.
// Le serveur relit lui-même les totaux : on ne fait jamais confiance au client pour décider d'envoyer.
//
// Variables d'environnement (Netlify → Site configuration → Environment variables) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (déjà utilisées par stripeWebhook)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY       paire de clés Web Push (npx web-push generate-vapid-keys)
//   VAPID_SUBJECT                             « mailto:ton.adresse@exemple.com »
// Tables : supabase/push_alerts.sql (push_subscriptions, jar_alert_notified).

const JAR_KEYS = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
const JAR_EMOJIS = { NEC: "🏺", FFA: "🌱", LTSS: "🏦", PLAY: "🎮", EDUC: "📚", GIFT: "🎁" };
const DEFAULT_PCT = { NEC: 55, FFA: 10, LTSS: 10, PLAY: 10, EDUC: 10, GIFT: 5 };
const WARN_RATIO = 0.8;
const PAGE = 1000;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// ── Niveaux d'alerte : même règle que src/jarAlerts.ts (un test vérifie l'équivalence) ──
function jarLevel(j) {
  const revenues = Number(j && j.revenues) || 0;
  const spent = Number(j && j.spendings) || 0;
  const net = revenues - spent;
  // Solde déplacé volontairement vers d'autres jarres : hors du plan pour le seuil de 80 % (port de src/jarAlerts.ts)
  const base = revenues + Math.max(0, Number(j && j.transferOut) || 0);
  // Déficit effacé (« repartir de zéro ») : dépense pardonnée pour le seuil
  const counted = Math.max(0, spent - Math.max(0, Number(j && j.settled) || 0));
  if (net < -0.005) return { level: 2, percent: base > 0 ? (counted / base) * 100 : 100, net };
  if (base > 0 && counted / base >= WARN_RATIO) return { level: 1, percent: (counted / base) * 100, net };
  return { level: 0, percent: base > 0 ? (counted / base) * 100 : 0, net };
}

function computeAlerts(jars) {
  const out = [];
  for (const jar of JAR_KEYS) {
    const r = jarLevel(jars && jars[jar]);
    if (r.level > 0) out.push({ jar, level: r.level, percent: r.percent, net: r.net });
  }
  return out.sort((a, b) => b.level - a.level || b.percent - a.percent);
}

// ── Texte des notifications ─────────────────────────────────────────────────
const TEXTS = {
  fr: {
    title: "Alerte jarre",
    titleMany: "Alertes jarres",
    over: (amount) => `dépassée de ${amount}`,
    empty: "épuisée",
    warn: (pct, amount) => `${pct} % dépensé · reste ${amount}`,
    testTitle: "Money Jars",
    testBody: "Les alertes de jarres sont bien activées sur cet appareil. 🎉",
  },
  en: {
    title: "Jar alert",
    titleMany: "Jar alerts",
    over: (amount) => `over by ${amount}`,
    empty: "empty",
    warn: (pct, amount) => `${pct}% spent · ${amount} left`,
    testTitle: "Money Jars",
    testBody: "Jar alerts are working on this device. 🎉",
  },
};

const cleanText = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

function buildPayload(alerts, opts) {
  const lang = opts && opts.lang === "en" ? "en" : "fr";
  const T = TEXTS[lang];
  const currency = cleanText(opts && opts.currency, 4) || "€";
  const labels = (opts && opts.labels) || {};
  const nf = new Intl.NumberFormat(lang === "en" ? "en-US" : "fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (n) => `${nf.format(Math.abs(n))} ${currency}`;

  const lines = alerts.map((a) => {
    const name = cleanText(labels[a.jar], 30) || a.jar;
    const msg =
      a.level === 2 ? T.over(money(a.net)) : a.net < 0.005 ? T.empty : T.warn(Math.floor(a.percent), money(a.net));
    return `${JAR_EMOJIS[a.jar]} ${name} : ${msg}`;
  });
  return {
    title: alerts.length > 1 ? T.titleMany : T.title,
    body: lines.join("\n"),
    tag: "jar-alerts",
    url: "/#alerts",
  };
}

// ── Lecture des totaux (mêmes règles que fetchTotals côté app) ──────────────
async function readAll(buildPage) {
  const out = [];
  for (let page = 0; page < 500; page++) {
    const from = page * PAGE;
    const { data, error } = await buildPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function readJarTotals(db, userId) {
  const { data: jarRows, error: jarErr } = await db
    .from("jar_settings")
    .select("jar_key, percent, initial_balance")
    .eq("user_id", userId);
  if (jarErr) throw new Error(jarErr.message);

  const spendings = await readAll((from, to) =>
    db.from("transactions_spending").select("jar, amount").eq("user_id", userId).order("id", { ascending: true }).range(from, to)
  );
  const revenues = await readAll((from, to) =>
    db
      .from("transactions_revenue")
      .select("amount, rate, crypto_quantity")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  const totalRevenues = revenues.reduce((sum, r) => {
    const amount = r.amount != null ? Number(r.amount) : Number(r.crypto_quantity || 0) * Number(r.rate || 0);
    return sum + amount;
  }, 0);

  const pct = { ...DEFAULT_PCT };
  const initial = { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 };
  (jarRows || []).forEach((r) => {
    if (JAR_KEYS.includes(r.jar_key)) {
      pct[r.jar_key] = Number(r.percent);
      initial[r.jar_key] = Number(r.initial_balance) || 0;
    }
  });
  const spent = { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 };
  spendings.forEach((s) => {
    if (JAR_KEYS.includes(s.jar)) spent[s.jar] += Number(s.amount);
  });

  const moved = await readTransferDeltas(db, userId);
  const settled = await readAdjustmentTotals(db, userId);

  const jars = {};
  for (const k of JAR_KEYS) jars[k] = {
    revenues: totalRevenues * (pct[k] / 100) + initial[k] + moved[k] + settled[k],
    spendings: spent[k],
    transferOut: Math.max(0, -moved[k]),
    settled: settled[k],
  };
  return jars;
}

// Déficits effacés (port de adjustmentTotals dans src/jarTransfers.ts), au centime. Table absente : aucun.
async function readAdjustmentTotals(db, userId) {
  const cents = { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 };
  let rows = [];
  try {
    rows = await readAll((from, to) =>
      db.from("jar_adjustments").select("jar, amount").eq("user_id", userId).order("id", { ascending: true }).range(from, to)
    );
  } catch (err) {
    if (!/does not exist|schema cache|could not find the table/i.test(String((err && err.message) || ""))) throw err;
  }
  for (const r of rows) {
    const c = Math.round(Number(r.amount) * 100);
    if (!Number.isFinite(c) || c <= 0 || !JAR_KEYS.includes(r.jar)) continue;
    cents[r.jar] += c;
  }
  const out = {};
  for (const k of JAR_KEYS) out[k] = cents[k] / 100;
  return out;
}

// Transferts entre jarres (port de transferDeltas dans src/jarTransfers.ts) : entrées moins sorties, au centime.
// Table absente (SQL pas encore exécuté) : aucun transfert, comme dans l'app.
async function readTransferDeltas(db, userId) {
  const cents = { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 };
  let rows = [];
  try {
    rows = await readAll((from, to) =>
      db.from("jar_transfers").select("from_jar, to_jar, amount").eq("user_id", userId).order("id", { ascending: true }).range(from, to)
    );
  } catch (err) {
    if (!/does not exist|schema cache|could not find the table/i.test(String((err && err.message) || ""))) throw err;
  }
  for (const r of rows) {
    const c = Math.round(Number(r.amount) * 100);
    if (!Number.isFinite(c) || c <= 0) continue;
    if (!JAR_KEYS.includes(r.from_jar) || !JAR_KEYS.includes(r.to_jar) || r.from_jar === r.to_jar) continue;
    cents[r.from_jar] -= c;
    cents[r.to_jar] += c;
  }
  const out = {};
  for (const k of JAR_KEYS) out[k] = cents[k] / 100;
  return out;
}

// ── Envoi ───────────────────────────────────────────────────────────────────
async function sendToDevices(db, wp, subs, payload) {
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const s of subs) {
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 6 * 3600 });
      sent++;
    } catch (err) {
      // 404 / 410 : l'appareil s'est désabonné ou l'abonnement a expiré → on l'oublie
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      } else {
        console.warn("push: envoi impossible", err && (err.statusCode || err.message));
      }
    }
  }
  return sent;
}

// Une jarre n'est notifiée qu'une fois par niveau : on « réserve » le niveau dans jar_alert_notified avec une
// mise à jour conditionnelle (level < nouveau), ce qui évite les doublons même si plusieurs appels se croisent.
async function claimLevels(db, userId, alerts) {
  const { data: rows, error } = await db.from("jar_alert_notified").select("jar_key, level").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const known = new Map((rows || []).map((r) => [r.jar_key, Number(r.level)]));

  const claimed = [];
  for (const a of alerts) {
    if (!known.has(a.jar)) {
      await db
        .from("jar_alert_notified")
        .upsert({ user_id: userId, jar_key: a.jar, level: 0 }, { onConflict: "user_id,jar_key", ignoreDuplicates: true });
    }
    const { data: won, error: upErr } = await db
      .from("jar_alert_notified")
      .update({ level: a.level, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("jar_key", a.jar)
      .lt("level", a.level)
      .select("jar_key");
    if (upErr) throw new Error(upErr.message);
    if (won && won.length > 0) claimed.push(a);
  }

  // Une jarre qui redescend (nouveau revenu, dépense supprimée) oublie son niveau : le prochain franchissement re-notifie
  for (const [jar, level] of known) {
    const current = alerts.find((a) => a.jar === jar);
    const cur = current ? current.level : 0;
    if (cur < level) {
      await db
        .from("jar_alert_notified")
        .update({ level: cur, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("jar_key", jar)
        .gt("level", cur);
    }
  }
  return claimed;
}

function defaultDeps() {
  const { createClient } = require("@supabase/supabase-js");
  const webpush = require("web-push");
  return {
    env: process.env,
    createDb: (env) => createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }),
    webpush,
  };
}

async function handler(event, deps) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const d = deps || defaultDeps();
  const env = d.env;

  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"].filter(
    (k) => !env[k]
  );
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
  if (body.action !== "jarAlerts" && body.action !== "test") return json(400, { error: "Action inconnue" });

  const db = d.createDb(env);
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  const user = userData && userData.user;
  if (userErr || !user) return json(401, { error: "Jeton invalide" });

  try {
    d.webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    const { data: subs, error: subErr } = await db
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user.id);
    if (subErr) throw new Error(subErr.message);
    const devices = (subs || []).length;

    if (body.action === "test") {
      if (devices === 0) return json(200, { sent: 0, devices: 0 });
      const T = TEXTS[body.lang === "en" ? "en" : "fr"];
      const sent = await sendToDevices(db, d.webpush, subs, { title: T.testTitle, body: T.testBody, tag: "jar-alerts-test", url: "/#alerts" });
      return json(200, { sent, devices });
    }

    // Même sans appareil abonné, on met à jour la mémoire des niveaux : un abonnement ultérieur ne déclenche
    // pas une rafale d'alertes déjà anciennes.
    const alerts = computeAlerts(await readJarTotals(db, user.id));
    const claimed = await claimLevels(db, user.id, alerts);
    if (claimed.length === 0 || devices === 0) return json(200, { sent: 0, devices, alerts: claimed.map((a) => a.jar) });

    const payload = buildPayload(claimed, { lang: body.lang, currency: body.currency, labels: body.labels });
    const sent = await sendToDevices(db, d.webpush, subs, payload);
    return json(200, { sent, devices, alerts: claimed.map((a) => a.jar) });
  } catch (err) {
    console.error("pushJarAlerts:", err && err.message);
    return json(502, { error: "Traitement impossible" });
  }
}

exports.handler = (event) => handler(event);
exports._test = { handler, jarLevel, computeAlerts, buildPayload, claimLevels, readTransferDeltas, readAdjustmentTotals };
