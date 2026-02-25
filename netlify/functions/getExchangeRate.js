// netlify/functions/getExchangeRate.js
// Proxy pour récupérer les taux de change (évite CORS et 522 depuis le navigateur)

const CRYPTO_IDS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  XRP: "ripple",
  ADA: "cardano",
  SOL: "solana",
  DOGE: "dogecoin",
  DOT: "polkadot",
  MATIC: "matic-network",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
};

const FETCH_TIMEOUT_MS = 6000;

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
}

function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal })
    .then((res) => {
      clearTimeout(timeoutId);
      return res;
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      throw err;
    });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const from = (event.queryStringParameters?.from || "").toUpperCase();
  const to = (event.queryStringParameters?.to || "EUR").toUpperCase();
  const dateParam = event.queryStringParameters?.date || "";

  if (!from || !dateParam) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Missing from or date" }),
    };
  }

  // Date au format ISO YYYY-MM-DD
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : dateParam.split("T")[0];

  try {
    if (CRYPTO_IDS[from] && to === "EUR") {
      const coinId = CRYPTO_IDS[from];
      const [y, m, d] = isoDate.split("-");
      const dateFormatted = `${d}-${m}-${y}`;
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${dateFormatted}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const data = await res.json();
      const rate = data.market_data?.current_price?.eur;
      if (rate == null) throw new Error("No crypto rate");
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ rate }),
      };
    }

    // 1) Taux historique (API documentée api.frankfurter.dev, timeout 6s)
    const historicalUrl = `https://api.frankfurter.dev/v1/${isoDate}?from=${from}&to=${to}`;
    let res = await fetchWithTimeout(historicalUrl).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      const rate = data.rates?.[to];
      if (rate != null) {
        return {
          statusCode: 200,
          headers: corsHeaders(),
          body: JSON.stringify({ rate }),
        };
      }
    }

    // 2) Fallback: taux "latest" si historique timeout ou indisponible
    const latestUrl = `https://api.frankfurter.dev/v1/latest?from=${from}&to=${to}`;
    res = await fetchWithTimeout(latestUrl);
    if (!res.ok) throw new Error(`Frankfurter latest ${res.status}`);
    const data = await res.json();
    const rate = data.rates?.[to];
    if (rate == null) throw new Error("No rate");
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ rate, fromLatest: true }),
    };
  } catch (err) {
    console.error("getExchangeRate error:", err.message);
    return {
      statusCode: 502,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: "Exchange rate unavailable",
        message: err.message,
      }),
    };
  }
};
