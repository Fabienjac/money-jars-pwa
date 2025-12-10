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

// src/types.ts

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

/* ===========================
   RÉGLAGES (front uniquement)
   =========================== */

export interface JarSetting {
  key: JarKey;
  percent: number;        // 55 pour 55 %
  initialBalance: number; // en EUR
}

export type AutoRuleKind = 'spending' | 'revenue';

export interface AutoRule {
  id: string;            // UUID simple
  kind: AutoRuleKind;    // dépense ou revenu
  name?: string;         // optionnel, label de règle
  keyword: string;       // mot-clé à détecter (dans la description / source)
  jar: JarKey;           // jarre cible
  account?: string;      // compte de paiement (pour dépenses)
  destination?: string;  // destination (pour revenus)
  incomeType?: string;   // type de revenu si tu veux
}

