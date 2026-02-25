// src/accountStatsUtils.ts
// Rapports par compte de dépense : reçus (revenus → destination) et dépensés par tag
import type { SearchSpendingResult, SearchRevenueResult } from "./types";
import type { AdvancedFilterState } from "./components/AdvancedTagFilters";
import { matchesPeriodFilter } from "./advancedTagFiltersUtils";
import type { TagStat } from "./tagStatsUtils";
import { calculateTagStats } from "./tagStatsUtils";

/**
 * Convertit un revenu en montant EUR (même logique que l'Apps Script)
 */
export function revenueToEur(r: SearchRevenueResult): number {
  const amount = Number(r.amount) || 0;
  const value = String(r.value || "USD").trim();
  const cryptoQty = Number(r.cryptoQuantity) || 0;
  const rate = Number(r.rate) || 0;

  if (value === "EUR") return amount;
  if (cryptoQty > 0 && rate > 10) return cryptoQty * rate;
  const effectiveRate = rate > 0 && rate < 2 ? rate : 0.94;
  return amount * effectiveRate;
}

/**
 * Filtre les revenus selon la période (30j, 90j, 6m, personnalisé)
 */
export function filterRevenuesByPeriod(
  revenues: SearchRevenueResult[],
  filters: AdvancedFilterState
): SearchRevenueResult[] {
  return revenues.filter((r) => matchesPeriodFilter(r.date, filters));
}

/**
 * Total reçu par compte de dépense (destination des revenus), sur la période filtrée
 */
export function computeReceivedByAccount(
  revenues: SearchRevenueResult[],
  filters: AdvancedFilterState
): Record<string, number> {
  const filtered = filterRevenuesByPeriod(revenues, filters);
  const byAccount: Record<string, number> = {};
  for (const r of filtered) {
    const dest = (r.destination || "").toString().trim();
    if (!dest) continue;
    const eur = revenueToEur(r);
    byAccount[dest] = (byAccount[dest] || 0) + eur;
  }
  return byAccount;
}

export interface AccountTagStats {
  accountName: string;
  totalReceived: number;
  totalSpent: number;
  tagStats: TagStat[];
}

/**
 * Pour chaque compte : total dépensé et répartition par tag (sur dépenses déjà filtrées par période/tag)
 */
export function computeSpentByAccountByTag(
  spendings: SearchSpendingResult[]
): AccountTagStats[] {
  const accounts = new Set<string>();
  spendings.forEach((s) => {
    const acc = (s.account || "").toString().trim();
    if (acc) accounts.add(acc);
  });

  const result: AccountTagStats[] = [];

  for (const accountName of Array.from(accounts).sort()) {
    const forAccount = spendings.filter(
      (s) => (s.account || "").toString().trim() === accountName
    );
    const totalSpent = forAccount.reduce((sum, s) => sum + (s.amount || 0), 0);
    const tagStats = calculateTagStats(forAccount);
    result.push({
      accountName,
      totalReceived: 0, // sera rempli côté vue avec computeReceivedByAccount
      totalSpent,
      tagStats,
    });
  }

  return result.sort((a, b) => b.totalSpent - a.totalSpent);
}

/**
 * Fusionne la liste des comptes (réglages + comptes présents dans les données)
 */
export function getAccountNames(
  fromSettings: { name: string }[],
  spendings: SearchSpendingResult[],
  revenueDestinations: string[]
): string[] {
  const set = new Set<string>();
  fromSettings.forEach((a) => set.add(a.name.trim()));
  spendings.forEach((s) => {
    const acc = (s.account || "").toString().trim();
    if (acc) set.add(acc);
  });
  revenueDestinations.forEach((d) => {
    const t = d.trim();
    if (t) set.add(t);
  });
  return Array.from(set).sort();
}
