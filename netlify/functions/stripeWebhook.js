// netlify/functions/stripeWebhook.js
// Reçoit les événements Stripe et met à jour la table subscriptions dans Supabase
// Vérification de signature manuelle — pas besoin de STRIPE_SECRET_KEY

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifyAndParse(rawBody, sigHeader, secret) {
  let timestamp = "";
  const signatures = [];

  for (const part of sigHeader.split(",")) {
    if (part.startsWith("t=")) timestamp = part.slice(2);
    else if (part.startsWith("v1=")) signatures.push(part.slice(3));
  }

  if (!timestamp || !signatures.length) {
    throw new Error("En-tête Stripe-Signature invalide");
  }

  // Bloquer les replays > 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    throw new Error("Timestamp trop ancien");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const valid = signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig, "hex"),
        Buffer.from(expected, "hex")
      );
    } catch { return false; }
  });

  if (!valid) throw new Error("Signature invalide");
  return JSON.parse(rawBody);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : (event.body ?? "");

  const sig = event.headers["stripe-signature"] ?? "";

  let stripeEvent;
  try {
    stripeEvent = verifyAndParse(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook verification failed:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const eventType = stripeEvent.type;
  const obj = stripeEvent.data?.object ?? {};
  console.log("Stripe event:", eventType);

  // ── checkout.session.completed : paiement initial ────────────────────────
  if (eventType === "checkout.session.completed") {
    const userId = obj.client_reference_id;
    const subscriptionId = obj.subscription ?? null;
    const customerId = obj.customer ?? null;

    if (!userId) {
      console.error("checkout.session.completed : client_reference_id manquant");
      return { statusCode: 400, body: "Missing client_reference_id" };
    }

    if (!subscriptionId) {
      console.warn("checkout.session.completed : subscription ID absent (paiement one-time ?)");
    }

    // current_period_end sera précisé par customer.subscription.updated
    const approxPeriodEnd = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("subscriptions").upsert({
      user_id:            userId,
      plan:               "active",
      lemonsqueezy_id:    subscriptionId,
      stripe_customer_id: customerId,
      current_period_end: approxPeriodEnd,
      updated_at:         new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (error) console.error("Supabase upsert error:", error);
    else console.log("Subscription activated:", userId, "sub:", subscriptionId);

  // ── customer.subscription.updated : renouvellement ───────────────────────
  } else if (eventType === "customer.subscription.updated") {
    const subscriptionId = obj.id;
    const customerId = obj.customer ?? null;
    const periodEnd = obj.current_period_end
      ? new Date(obj.current_period_end * 1000).toISOString()
      : null;
    const plan = obj.status === "active" ? "active" : "expired";
    const payload = { plan, current_period_end: periodEnd, updated_at: new Date().toISOString() };

    // Tentative 1 : lookup par subscription ID
    const { error, count } = await supabase.from("subscriptions")
      .update(payload)
      .eq("lemonsqueezy_id", subscriptionId)
      .select("user_id", { count: "exact", head: true });

    if (error) {
      console.error("Supabase update error (by sub id):", error);
    } else if ((count ?? 0) === 0 && customerId) {
      // Race condition : checkout.session.completed n'est pas encore arrivé.
      // Fallback : update via stripe_customer_id
      const { error: err2, count: c2 } = await supabase.from("subscriptions")
        .update(payload)
        .eq("stripe_customer_id", customerId)
        .select("user_id", { count: "exact", head: true });

      if (err2) console.error("Supabase update error (by customer id):", err2);
      else if ((c2 ?? 0) === 0) console.warn("customer.subscription.updated : aucune ligne trouvée pour sub", subscriptionId, "customer", customerId);
      else console.log("Subscription updated via customer_id:", customerId, "→", plan);
    } else {
      console.log("Subscription updated:", subscriptionId, "→", plan);
    }

  // ── customer.subscription.deleted : résiliation ──────────────────────────
  } else if (eventType === "customer.subscription.deleted") {
    const subscriptionId = obj.id;
    const customerId = obj.customer ?? null;
    const payload = { plan: "cancelled", updated_at: new Date().toISOString() };

    const { error, count } = await supabase.from("subscriptions")
      .update(payload)
      .eq("lemonsqueezy_id", subscriptionId)
      .select("user_id", { count: "exact", head: true });

    if (error) {
      console.error("Supabase update error (cancelled):", error);
    } else if ((count ?? 0) === 0 && customerId) {
      await supabase.from("subscriptions").update(payload).eq("stripe_customer_id", customerId);
    }
    console.log("Subscription cancelled:", subscriptionId);
  }

  return { statusCode: 200, body: "ok" };
};
