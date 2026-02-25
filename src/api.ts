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

const API_URL = import.meta.env.VITE_API_URL as string;
const API_KEY = import.meta.env.VITE_API_KEY as string;

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

export async function fetchTotals() {
  
  console.log('FETCH TOTALS URL =', (import.meta.env.VITE_API_URL || '' ) + '/totals');
// Exemple final en prod :
  // https://willowy-nougat-51e2a4.netlify.app/.netlify/functions/gsheetProxy?action=totals&key=...
  const url = `${API_URL}?action=totals&key=${encodeURIComponent(API_KEY)}`;

  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erreur API totals (${res.status}): ${text}`);
  }

  return res.json() as Promise<TotalsResponse>;
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

export async function fetchAnalytics() {
  const url = `${API_URL}?action=analytics&key=${encodeURIComponent(API_KEY)}`;

  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erreur API analytics (${res.status}): ${text}`);
  }

  return res.json() as Promise<AnalyticsResponse>;
}