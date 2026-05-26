// netlify/functions/lemonsqueezyWebhook.js
// Reçoit les événements LemonSqueezy et met à jour la table subscriptions dans Supabase

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Vérifier la signature HMAC LemonSqueezy
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (secret) {
    const sig = event.headers["x-signature"] ?? "";
    const hmac = crypto
      .createHmac("sha256", secret)
      .update(event.body ?? "")
      .digest("hex");
    if (sig !== hmac) {
      return { statusCode: 401, body: "Invalid signature" };
    }
  }

  let payload;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const eventName = payload?.meta?.event_name;
  const attrs = payload?.data?.attributes;
  const customData = payload?.meta?.custom_data;

  // L'user_id Supabase doit être passé dans les custom_data du checkout
  const userId = customData?.user_id;
  if (!userId) {
    console.error("lemonsqueezyWebhook: user_id manquant dans custom_data");
    return { statusCode: 400, body: "Missing user_id" };
  }

  const lsId = String(payload?.data?.id ?? "");
  const periodEnd = attrs?.renews_at ? new Date(attrs.renews_at).toISOString() : null;

  if (["subscription_created", "subscription_updated", "subscription_resumed"].includes(eventName)) {
    const plan = attrs?.status === "active" ? "active" : "expired";
    await supabase.from("subscriptions").upsert({
      user_id:             userId,
      plan,
      lemonsqueezy_id:     lsId,
      current_period_end:  periodEnd,
      updated_at:          new Date().toISOString(),
    }, { onConflict: "user_id" });

  } else if (["subscription_cancelled", "subscription_expired"].includes(eventName)) {
    await supabase.from("subscriptions").update({
      plan:       "cancelled",
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
  }

  return { statusCode: 200, body: "ok" };
};
