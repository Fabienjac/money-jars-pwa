import {
  SpendingRow,
  RevenueRow,
  TotalsResponse,
  SearchSpendingResult,
  SearchRevenueResult,
} from './types';

const API_URL = import.meta.env.VITE_API_URL as string;
const API_KEY = import.meta.env.VITE_API_KEY as string;

if (!API_URL) {
  console.warn('⚠️ VITE_API_URL manquant dans .env');
}
if (!API_KEY) {
  console.warn('⚠️ VITE_API_KEY manquant dans .env');
}

async function callApi<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      // JSON classique, le proxy Vite s’occupe de parler à script.google.com
      'Content-Type': 'application/json',
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

// ---------- EXPORTS UTILISÉS PAR TES COMPOSANTS ----------

export async function appendSpending(row: SpendingRow) {
  return callApi<{ ok: boolean; error?: string }>({
    action: 'append',
    type: 'spending',
    row,
  });
}

export async function appendRevenue(row: RevenueRow) {
  return callApi<{ ok: boolean; error?: string }>({
    action: 'append',
    type: 'revenue',
    row,
  });
}

export async function fetchTotals() {
  return callApi<TotalsResponse>({
    action: 'totals',
  });
}

export async function searchSpendings(q: string, max = 50) {
  return callApi<{ rows: SearchSpendingResult[] }>({
    action: 'search',
    type: 'spending',
    q,
    max,
  });
}

export async function searchRevenues(q: string, max = 50) {
  return callApi<{ rows: SearchRevenueResult[] }>({
    action: 'search',
    type: 'revenue',
    q,
    max,
  });
}
