export type JarKey = 'NEC' | 'FFA' | 'LTSS' | 'PLAY' | 'EDUC' | 'GIFT';

export interface SpendingRow {
  date: string;
  jar: JarKey;
  account: string;
  amount: number;
  description: string;
}

export interface RevenueRow {
  date: string;
  source: string;
  amountEUR?: number;
  amountUSD?: number;
  method?: string;
  rate?: number;
  destination?: string;
  incomeType?: string;
}

export interface JarTotals {
  revenues: number;
  spendings: number;
  net: number;
  revPct: number;
}

export interface TotalsResponse {
  jars: Record<JarKey, JarTotals>;
  totalRevenues: number;
  split: Record<JarKey, number>;
}

export interface SearchSpendingResult {
  date: string;
  jar: JarKey;
  account: string;
  amount: number;
  description: string;
}

export interface SearchRevenueResult {
  mois: string;
  date: string;
  source: string;
  amountEUR: number;
  amountUSD: number;
  method: string;
  rate: number;
  destination: string;
  incomeType: string;
}
