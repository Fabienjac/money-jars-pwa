// netlify/functions/gsheetProxy.js

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

    let response;

    // === CAS 1 : appels POST (append + search) ===
    if (event.httpMethod === "POST") {
      let body = {};

      if (event.body) {
        try {
          body = JSON.parse(event.body);
        } catch (e) {
          console.error("Invalid JSON body from client:", e);
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "invalid_json_body" }),
          };
        }
      }

      // On force la clé côté serveur (on ne fait pas confiance au front)
      if (apiKey) {
        body.key = apiKey;
      }

      response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    // === CAS 2 : appels GET (totals, ou autres) ===
    else {
      const url = new URL(baseUrl);

      const incoming = event.queryStringParameters || {};
      for (const [k, v] of Object.entries(incoming)) {
        if (v != null) url.searchParams.set(k, v);
      }

      if (apiKey) {
        url.searchParams.set("key", apiKey);
      }

      response = await fetch(url.toString(), {
        method: "GET",
      });
    }

    const text = await response.text();
    const contentType =
      response.headers.get("content-type") || "application/json";

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
