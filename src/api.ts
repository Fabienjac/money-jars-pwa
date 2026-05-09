// src/api.ts
import {
  SpendingRow,
  RevenueRow,
  TotalsResponse,
  SearchSpendingResult,
  SearchRevenueResult,
  Account,
  RevenueAccount,
} from "./types";
import { AutoTagRule, saveCachedRules, loadCachedRules } from "./autoTagRules";

const API_URL = import.meta.env.VITE_API_URL as string;
const API_KEY = import.meta.env.VITE_API_KEY as string;

// --------- CACHE localStorage TTL 5 min ---------
const CACHE_TTL = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function setCache<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

if (!API_URL) {
  console.warn("⚠️ VITE_API_URL manquant dans .env");
}
if (!API_KEY) {
  console.warn("⚠️ VITE_API_KEY manquant dans .env");
}

/**
 * Appels POST génériques (append + search)
 * -> passent par le proxy Netlify en JSON
 */
async function callApi<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key: API_KEY,
      ...payload,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erreur API (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

// --------- ENDPOINTS D’ÉCRITURE & RECHERCHE (POST) ---------

export async function appendSpending(row: SpendingRow) {
  return callApi<{ ok: boolean; error?: string }>({
    action: "append",
    type: "spending",
    row,
  });
}

export async function appendRevenue(row: RevenueRow) {
  return callApi<{ ok: boolean; error?: string }>({
    action: "append",
    type: "revenue",
    row,
  });
}

export async function updateSpending(rowIndex: number, row: SpendingRow) {
  return callApi<{ ok: boolean; error?: string }>({
    action: "updateSpending",
    rowIndex,
    row,
  });
}

export async function updateRevenue(rowIndex: number, row: RevenueRow) {
  return callApi<{ ok: boolean; error?: string }>({
    action: "updateRevenue",
    rowIndex,
    row,
  });
}

export async function deleteSpending(rowIndex: number) {
  return callApi<{ ok: boolean; error?: string }>({
    action: "deleteSpending",
    rowIndex,
  });
}

export async function deleteRevenue(rowIndex: number) {
  return callApi<{ ok: boolean; error?: string }>({
    action: "deleteRevenue",
    rowIndex,
  });
}

export async function searchSpendings(q: string, max = 50) {
  return callApi<{ rows: SearchSpendingResult[] }>({
    action: "search",
    type: "spending",
    q,
    max,
  });
}

export async function searchRevenues(q: string, max = 50) {
  return callApi<{ rows: SearchRevenueResult[] }>({
    action: "search",
    type: "revenue",
    q,
    max,
  });
}

// --------- TOTALS : ON UTILISE UN GET (COMME TON TEST SAFARI) ---------

export async function fetchTotals(forceRefresh = false): Promise<TotalsResponse> {
  const CACHE_KEY = "mjars:cache:totals";
  if (!forceRefresh) {
    const cached = getCached<TotalsResponse>(CACHE_KEY);
    if (cached) return cached;
  }

  const url = `${API_URL}?action=totals&key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erreur API totals (${res.status}): ${text}`);
  }

  const data = await res.json() as TotalsResponse;
  setCache(CACHE_KEY, data);
  return data;
}

// --------- TAGS - GET depuis Google Sheets ---------
export async function fetchTagsFromSheet(): Promise<import("./tagsUtils").Tag[]> {
  const url = `${API_URL}?action=getTags&key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`API getTags (${res.status}): ${await res.text()}`);
  const data = await res.json();
  // Accepte { tags: [...] } ou directement [...]
  const rows: any[] = data.tags ?? data.rows ?? data ?? [];
  return rows
    .filter(r => r && typeof r.id === "string" && r.id.trim())
    .map(r => ({
      id:        r.id.trim(),
      name:      r.name || r.id,
      emoji:     r.emoji || "🏷️",
      color:     r.color || "#8E8E93",
      categorie: r.categorie || undefined,
      favori:    r.favori === true || String(r.favori).toUpperCase() === "OUI",
    }));
}

export async function saveTags(tags: import("./tagsUtils").Tag[]): Promise<void> {
  await callApi({ action: "saveTags", tags });
}

// --------- COMPTES (Accounts / RevenueAccounts) - GET ---------
export async function getAccounts(): Promise<Account[]> {
  const url = `${API_URL}?action=getAccounts&key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`API getAccounts (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { accounts?: Account[]; rows?: Account[] };
  return data.accounts ?? data.rows ?? [];
}

export async function getRevenueAccounts(): Promise<RevenueAccount[]> {
  const url = `${API_URL}?action=getRevenueAccounts&key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`API getRevenueAccounts (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { accounts?: RevenueAccount[]; rows?: RevenueAccount[] };
  return data.accounts ?? data.rows ?? [];
}

// --------- COMPTES - POST (sauvegarde vers le Sheet) ---------
export async function setAccounts(accounts: Account[]): Promise<{ ok: boolean; error?: string }> {
  if (!API_URL) {
    console.error("setAccounts: VITE_API_URL manquant, impossible d’envoyer au Sheet");
    throw new Error("VITE_API_URL manquant");
  }
  console.log("setAccounts: envoi de", accounts.length, "compte(s) vers", API_URL.replace(/\?.*$/, ""));
  return callApi({ action: "setAccounts", accounts });
}

export async function setRevenueAccounts(accounts: RevenueAccount[]): Promise<{ ok: boolean; error?: string }> {
  return callApi({ action: "setRevenueAccounts", accounts });
}

// --------- ANALYTICS ---------

export interface AnalyticsResponse {
  monthlyData: Array<{
    month: string;
    revenues: number;
    spendings: number;
  }>;
  sourcesData: Array<{
    name: string;
    value: number;
  }>;
  jarEvolution: Array<{
    month: string;
    NEC?: number;
    FFA?: number;
    LTSS?: number;
    PLAY?: number;
    EDUC?: number;
    GIFT?: number;
  }>;
  trends: {
    currentMonth: string;
    previousMonth: string;
    revenues: {
      current: number;
      previous: number;
    };
    spendings: {
      current: number;
      previous: number;
    };
  };
}

export async function fetchAnalytics(forceRefresh = false): Promise<AnalyticsResponse> {
  const CACHE_KEY = "mjars:cache:analytics";
  if (!forceRefresh) {
    const cached = getCached<AnalyticsResponse>(CACHE_KEY);
    if (cached) return cached;
  }

  const url = `${API_URL}?action=analytics&key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erreur API analytics (${res.status}): ${text}`);
  }

  const data = await res.json() as AnalyticsResponse;
  setCache(CACHE_KEY, data);
  return data;
}
// --------- NET WORTH ---------
export interface NetWorthResponse {
  value: number;
  currency: string;
}

export async function fetchNetWorth(forceRefresh = false): Promise<NetWorthResponse> {
  const CACHE_KEY = "mjars:cache:networth";
  if (!forceRefresh) {
    const cached = getCached<NetWorthResponse>(CACHE_KEY);
    if (cached) return cached;
  }
  const url = `${API_URL}?action=getNetWorth&key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`Erreur API netWorth (${res.status})`);
  const data = await res.json() as NetWorthResponse;
  setCache(CACHE_KEY, data);
  return data;
}

// ── Column mappings (Google Sheets ↔ localStorage cache) ─────────────────────

const COLMAPPING_CACHE_KEY = "mjars:colmappings:all";
const COLMAPPING_CACHE_TTL = 60 * 60 * 1000; // 1h

/**
 * Récupère tous les mappings de colonnes depuis Google Sheets.
 * Cache en localStorage (TTL 1h) pour éviter un appel API à chaque import.
 */
export async function fetchColumnMappings(): Promise<Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(COLMAPPING_CACHE_KEY);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as { data: Record<string, unknown>; ts: number };
      if (Date.now() - ts < COLMAPPING_CACHE_TTL) return data;
    }
  } catch {}

  try {
    const url = `${API_URL}?action=getColumnMappings&key=${encodeURIComponent(API_KEY)}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { mappings: Record<string, unknown> };
    const mappings = data.mappings || {};
    try { localStorage.setItem(COLMAPPING_CACHE_KEY, JSON.stringify({ data: mappings, ts: Date.now() })); } catch {}
    return mappings;
  } catch (err) {
    console.warn("fetchColumnMappings: erreur API", err);
    return {};
  }
}

/**
 * Sauvegarde un mapping dans Google Sheets (upsert par clé).
 * Met aussi à jour le cache local immédiatement.
 *
 * ⚠️  On utilise `mappingKey` (pas `key`) pour ne pas écraser
 *     le champ `key: API_KEY` injecté par callApi().
 */
export async function saveColumnMappingToSheet(mappingKey: string, mapping: unknown): Promise<void> {
  // Mettre à jour le cache local tout de suite
  try {
    const raw = localStorage.getItem(COLMAPPING_CACHE_KEY);
    const existing = raw ? (JSON.parse(raw) as { data: Record<string, unknown>; ts: number }) : { data: {}, ts: 0 };
    existing.data[mappingKey] = mapping;
    existing.ts = Date.now();
    localStorage.setItem(COLMAPPING_CACHE_KEY, JSON.stringify(existing));
  } catch {}

  // Envoyer au Sheet (fire-and-forget)
  // mappingKey → transmis comme `mappingKey` pour éviter le conflit avec `key: API_KEY`
  callApi<{ ok: boolean }>({ action: "saveColumnMapping", mappingKey, mapping }).catch(err =>
    console.warn("saveColumnMappingToSheet: erreur API", err)
  );
}

// ── Auto-tag rules (Google Sheets ↔ localStorage cache) ──────────────────────

/**
 * Récupère les règles d'auto-tag depuis Google Sheets.
 * Utilise le cache localStorage comme fallback si l'API échoue.
 */
export async function fetchAutoTagRules(): Promise<AutoTagRule[]> {
  try {
    const url = `${API_URL}?action=getAutoTagRules&key=${encodeURIComponent(API_KEY)}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { rules: AutoTagRule[] };
    const rules = Array.isArray(data.rules) ? data.rules : [];
    saveCachedRules(rules); // mettre à jour le cache local
    return rules;
  } catch (err) {
    console.warn("fetchAutoTagRules: fallback localStorage", err);
    return loadCachedRules();
  }
}

/**
 * Sauvegarde toutes les règles d'auto-tag dans Google Sheets (remplacement complet).
 * Met aussi à jour le cache localStorage.
 */
export async function saveAutoTagRulesToSheet(rules: AutoTagRule[]): Promise<void> {
  saveCachedRules(rules); // toujours mettre à jour le cache local en premier
  await callApi<{ ok: boolean }>({
    action: "saveAutoTagRules",
    rules,
  });
}
