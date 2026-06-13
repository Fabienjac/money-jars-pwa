// netlify/functions/stripeWebhook.js
// Reçoit les événements Stripe et met à jour la table subscriptions dans Supabase

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  // Netlify peut encoder le body en base64
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : (event.body ?? "");

  // Vérifier la signature Stripe
  const sig = event.headers["stripe-signature"] ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe signature invalide:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  console.log("Stripe webhook event:", stripeEvent.type);

  const eventType = stripeEvent.type;

  // ── checkout.session.completed : paiement initial réussi ────────────────
  if (eventType === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const userId = session.client_reference_id;

    if (!userId) {
      console.error("checkout.session.completed : client_reference_id manquant");
      return { statusCode: 400, body: "Missing client_reference_id" };
    }

    // Récupérer les détails de l'abonnement pour avoir current_period_end
    let periodEnd = null;
    let subscriptionId = session.subscription;
    if (subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
      } catch (e) {
        console.warn("Impossible de récupérer l'abonnement:", e.message);
      }
    }

    const { error } = await supabase.from("subscriptions").upsert({
      user_id:            userId,
      plan:               "active",
      lemonsqueezy_id:    subscriptionId ?? null,
      current_period_end: periodEnd,
      updated_at:         new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (error) console.error("Supabase upsert error:", error);
    else console.log("Subscription activated:", userId);
  }

  // ── customer.subscription.updated : renouvellement, changement de plan ──
  else if (eventType === "customer.subscription.updated") {
    const sub = stripeEvent.data.object;
    const subscriptionId = sub.id;
    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;
    const plan = sub.status === "active" ? "active" : "expired";

    const { error } = await supabase.from("subscriptions")
      .update({
        plan,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("lemonsqueezy_id", subscriptionId);

    if (error) console.error("Supabase update error:", error);
    else console.log("Subscription updated:", subscriptionId, "→", plan);
  }

  // ── customer.subscription.deleted : résiliation ──────────────────────────
  else if (eventType === "customer.subscription.deleted") {
    const sub = stripeEvent.data.object;
    const subscriptionId = sub.id;

    const { error } = await supabase.from("subscriptions")
      .update({
        plan:       "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("lemonsqueezy_id", subscriptionId);

    if (error) console.error("Supabase update error:", error);
    else console.log("Subscription cancelled:", subscriptionId);
  }

  return { statusCode: 200, body: "ok" };
};
