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
  date: string;              // Colonne A: Date
  source: string;            // Colonne B: Source
  amount?: number;           // Colonne C: Montant
  value?: string;            // Colonne D: Valeur (USD, EUR, etc.)
  cryptoQuantity?: number;   // Colonne E: Quantité Crypto
  method?: string;           // Colonne F: Méthode
  rate?: number;             // Colonne G: Taux USD/EUR
  cryptoAddress?: string;    // Colonne H: Adresse crypto
  destination?: string;      // Colonne J: Compte de destination
  incomeType?: string;       // Colonne K: Type
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
  amount: number;            // Montant
  value: string;             // Valeur (USD, EUR, etc.)
  cryptoQuantity: number;    // Quantité Crypto
  method: string;            // Méthode
  rate: number;              // Taux USD/EUR
  cryptoAddress: string;     // Adresse crypto
  destination: string;       // Compte de destination
  incomeType: string;        // Type
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
