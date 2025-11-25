// netlify/functions/gsheetProxy.js

// Fonction serverless Netlify qui fait proxy vers ton Google Apps Script
exports.handler = async (event) => {
  try {
    const baseUrl = process.env.GSCRIPT_URL;
    const apiKey = process.env.VITE_API_KEY;

    if (!baseUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing GSCRIPT_URL env var" }),
      };
    }

    // Reconstruire l’URL de destination
    const url = new URL(baseUrl);

    // Copier les query params reçus (action, q, max, etc.)
    const incoming = event.queryStringParameters || {};
    for (const [k, v] of Object.entries(incoming)) {
      if (v != null) url.searchParams.set(k, v);
    }

    // Forcer la clé secrète côté serveur (on ne fait pas confiance au front)
    if (apiKey) {
      url.searchParams.set("key", apiKey);
    }

    // Appel à ton Apps Script (Node 18 sur Netlify → fetch global dispo)
    const response = await fetch(url.toString(), {
      method: "GET",
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "application/json";

    return {
      statusCode: response.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      },
      body: text,
    };
  } catch (err) {
    console.error("gsheetProxy error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "proxy_error",
        message: err.message,
      }),
    };
  }
};
