// netlify/functions/createCheckoutSession.js
// Crée une Stripe Checkout Session et retourne l'URL de paiement

const Stripe = require("stripe");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { userId, plan } = body;
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: "userId manquant" }) };
  }

  const priceId = plan === "yearly"
    ? process.env.STRIPE_PRICE_YEARLY
    : process.env.STRIPE_PRICE_MONTHLY;

  if (!priceId) {
    const missing = plan === "yearly" ? "STRIPE_PRICE_YEARLY" : "STRIPE_PRICE_MONTHLY";
    return { statusCode: 500, body: JSON.stringify({ error: `Variable ${missing} non configurée` }) };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      success_url: "https://money-jars-saas.netlify.app/?payment=success",
      cancel_url:  "https://money-jars-saas.netlify.app/",
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("createCheckoutSession error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
