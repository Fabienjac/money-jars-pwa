/** Taux historiques : en prod via Netlify ; en dev (Vite seul) via Frankfurter en direct (CORS OK). */
const rateCache = new Map<string, number>();

/** Même logique que netlify/functions/getExchangeRate.js (partie fiat Frankfurter). */
async function fetchFrankfurterRate(from: string, to: string, isoDate: string): Promise<number> {
  const historicalUrl = `https://api.frankfurter.dev/v1/${isoDate}?from=${from}&to=${to}`;
  let res = await fetch(historicalUrl).catch(() => null as Response | null);
  if (res && res.ok) {
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[to];
    if (rate != null) return rate;
  }
  const latestUrl = `https://api.frankfurter.dev/v1/latest?from=${from}&to=${to}`;
  res = await fetch(latestUrl);
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const data = (await res.json()) as { rates?: Record<string, number> };
  const rate = data.rates?.[to];
  if (rate == null) throw new Error("Taux indisponible");
  return rate;
}

export function convertToISODate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const longMatch = dateStr.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (longMatch) {
    const [, day, monthName, year] = longMatch;
    const months: Record<string, string> = {
      January: "01",
      February: "02",
      March: "03",
      April: "04",
      May: "05",
      June: "06",
      July: "07",
      August: "08",
      September: "09",
      October: "10",
      November: "11",
      December: "12",
    };
    const month = months[monthName];
    if (month) {
      return `${year}-${month}-${day.padStart(2, "0")}`;
    }
  }

  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
  } catch {
    /* ignore */
  }

  return new Date().toISOString().split("T")[0];
}

export async function getHistoricalExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<number> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return 1;

  const isoDate = convertToISODate(date);
  const cacheKey = `${from}-${to}-${isoDate}`;
  const cached = rateCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // En dev avec `npm run dev` (Vite seul), il n’y a pas de serveur sur :8888 → le proxy Netlify casse.
  // Frankfurter autorise le navigateur (CORS) pour ces GET.
  if (import.meta.env.DEV) {
    try {
      const rate = await fetchFrankfurterRate(from, to, isoDate);
      rateCache.set(cacheKey, rate);
      return rate;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur taux";
      throw new Error(msg);
    }
  }

  const url = `/.netlify/functions/getExchangeRate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(
    to
  )}&date=${encodeURIComponent(isoDate)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error((errBody as { message?: string }).message || `Taux indisponible (${response.status})`);
    }
    const data = (await response.json()) as { rate?: number };
    if (typeof data.rate !== "number") {
      throw new Error("Réponse taux invalide");
    }
    rateCache.set(cacheKey, data.rate);
    return data.rate;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Délai dépassé pour récupérer le taux");
    }
    throw err;
  }
}
