// src/types.ts
export type JarKey = "NEC" | "FFA" | "LTSS" | "PLAY" | "EDUC" | "GIFT";

export interface SpendingRow {
  date: string;
  jar: string;
  account: string;
  amount: number;
  description: string;
  tags?: string;
}

export interface RevenueRow {
  date: string;
  source: string;
  amount?: number;
  value?: string;
  cryptoQuantity?: number;
  method?: string;
  rate?: number;
  cryptoAddress?: string;
  destination?: string;
  incomeType?: string;
  tags?: string;
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
  tags?: string;
}

export interface SearchRevenueResult {
  date: string;
  source: string;
  amount: number;
  value: string;
  cryptoQuantity: number;
  method: string;
  rate: number;
  cryptoAddress: string;
  destination: string;
  incomeType: string;
  tags?: string;
}
