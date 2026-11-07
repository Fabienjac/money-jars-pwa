// netlify/functions/notifyFeedback.js
// Prévient par email à chaque nouvelle ligne de la table `feedback` (suggestion, bug, idée).
// Appelée par un Database Webhook Supabase (INSERT sur public.feedback) avec un secret partagé.
// Envoi via l'API Resend (simple appel HTTPS, aucune dépendance).
//
// Variables d'environnement (Netlify → Site configuration → Environment variables) :
//   FEEDBACK_WEBHOOK_SECRET  secret partagé, à recopier dans l'en-tête du webhook Supabase
//   RESEND_API_KEY           clé API Resend
//   FEEDBACK_NOTIFY_TO       adresse qui reçoit les emails (doit être l'adresse du compte Resend
//                            tant qu'aucun domaine n'est vérifié chez Resend)
//   FEEDBACK_MAIL_FROM       optionnel, défaut « Money Jars <onboarding@resend.dev> »

const crypto = require("crypto");

const CATEGORY_LABELS = { idea: "💡 Idée", bug: "🐞 Bug", ux: "✨ Confort d'usage" };

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Construit l'email à partir de la ligne insérée. Exporté pour être testé.
function buildEmail(record) {
  const category = CATEGORY_LABELS[record.category] || record.category || "Suggestion";
  const message = String(record.message || "").trim();
  const email = record.email ? String(record.email).trim() : "";
  const lang = record.lang ? String(record.lang).toUpperCase() : "";
  const firstLine = message.split("\n")[0].slice(0, 70);

  const text = [
    `${category}${lang ? ` (${lang})` : ""}`,
    "",
    message,
    "",
    email ? `Répondre à : ${email}` : "Pas d'email laissé par l'utilisateur.",
    `Reçu le ${record.created_at || new Date().toISOString()}`,
  ].join("\n");

  const html =
    `<p><strong>${escapeHtml(category)}</strong>${lang ? ` · ${escapeHtml(lang)}` : ""}</p>` +
    `<blockquote style="margin:0;padding:8px 12px;border-left:3px solid #ccc;white-space:pre-wrap">${escapeHtml(message)}</blockquote>` +
    `<p>${email ? `Répondre à : ${escapeHtml(email)}` : "Pas d'email laissé par l'utilisateur."}</p>`;

  return {
    subject: `[Money Jars] ${category} : ${firstLine}`,
    text,
    html,
    replyTo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
  };
}

async function handler(event, fetchImpl = fetch) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const secret = process.env.FEEDBACK_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_NOTIFY_TO;
  if (!secret || !apiKey || !to) {
    console.error("notifyFeedback : variables d'environnement manquantes");
    return json(500, { error: "Not configured" });
  }

  const headers = event.headers || {};
  const provided = headers["x-webhook-secret"] || headers["X-Webhook-Secret"];
  if (!safeEqual(provided, secret)) return json(401, { error: "Unauthorized" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  // Format d'un Database Webhook Supabase : { type: "INSERT", table, record, ... }
  if (payload.type !== "INSERT" || !payload.record || !payload.record.message) {
    return json(200, { ignored: true });
  }

  const mail = buildEmail(payload.record);
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.FEEDBACK_MAIL_FROM || "Money Jars <onboarding@resend.dev>",
      to: [to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    console.error("notifyFeedback : Resend a refusé l'envoi", res.status, await res.text().catch(() => ""));
    return json(502, { error: "Email provider error" });
  }
  return json(200, { sent: true });
}

exports.handler = (event) => handler(event);
exports._test = { handler, buildEmail };
