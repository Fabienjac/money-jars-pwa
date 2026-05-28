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

  // Netlify peut encoder le body en base64 — on décode si nécessaire
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : (event.body ?? "");

  // Vérifier la signature HMAC LemonSqueezy
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (secret) {
    const sig = event.headers["x-signature"] ?? event.headers["X-Signature"] ?? "";
    const hmac = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    console.log("LS webhook sig:", sig, "computed:", hmac);
    if (sig !== hmac) {
      console.error("Invalid signature — sig:", sig, "expected:", hmac);
      return { statusCode: 401, body: "Invalid signature" };
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const eventName = payload?.meta?.event_name;
  const attrs = payload?.data?.attributes;
  const customData = payload?.meta?.custom_data;

  console.log("LS webhook event:", eventName, "customData:", JSON.stringify(customData));

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
    const { error } = await supabase.from("subscriptions").upsert({
      user_id:            userId,
      plan,
      lemonsqueezy_id:    lsId,
      current_period_end: periodEnd,
      updated_at:         new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) console.error("Supabase upsert error:", error);
    else console.log("Subscription updated:", userId, "→", plan);

  } else if (["subscription_cancelled", "subscription_expired"].includes(eventName)) {
    const { error } = await supabase.from("subscriptions").update({
      plan:       "cancelled",
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    if (error) console.error("Supabase update error:", error);
    else console.log("Subscription cancelled:", userId);
  }

  return { statusCode: 200, body: "ok" };
};
