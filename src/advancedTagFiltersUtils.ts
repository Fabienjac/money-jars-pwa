// src/advancedTagFilters.ts
import { SearchSpendingResult } from "./types";
import { AdvancedFilterState } from "./components/AdvancedTagFilters";

/**
 * Appliquer les filtres avancés sur les transactions
 */
export function applyAdvancedFilters(
  transactions: SearchSpendingResult[],
  filters: AdvancedFilterState
): SearchSpendingResult[] {
  return transactions.filter(transaction => {
    // Filtre de période
    if (!matchesPeriodFilter(transaction.date, filters)) {
      return false;
    }

    // Filtre de montant
    if (!matchesAmountFilter(transaction.amount, filters)) {
      return false;
    }

    // Filtre de jarres
    if (!matchesJarFilter(transaction.jar, filters)) {
      return false;
    }

    return true;
  });
}

/**
 * Vérifier si la date correspond au filtre de période
 */
function matchesPeriodFilter(dateStr: string, filters: AdvancedFilterState): boolean {
  if (filters.period === "all") return true;

  const transactionDate = new Date(dateStr);
  const now = new Date();

  if (filters.period === "custom") {
    if (filters.customStartDate && filters.customEndDate) {
      const startDate = new Date(filters.customStartDate);
      const endDate = new Date(filters.customEndDate);
      return transactionDate >= startDate && transactionDate <= endDate;
    }
    return true;
  }

  const diffDays = (now.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24);

  switch (filters.period) {
    case "30d":
      return diffDays <= 30;
    case "90d":
      return diffDays <= 90;
    case "year":
      return diffDays <= 365;
    default:
      return true;
  }
}

/**
 * Vérifier si le montant correspond au filtre
 */
function matchesAmountFilter(amount: number | undefined, filters: AdvancedFilterState): boolean {
  if (!amount) return true;

  const minAmount = filters.minAmount ? parseFloat(filters.minAmount) : null;
  const maxAmount = filters.maxAmount ? parseFloat(filters.maxAmount) : null;

  if (minAmount !== null && amount < minAmount) return false;
  if (maxAmount !== null && amount > maxAmount) return false;

  return true;
}

/**
 * Vérifier si la jarre correspond au filtre
 */
function matchesJarFilter(jar: string, filters: AdvancedFilterState): boolean {
  if (filters.jars.length === 0) return true;
  return filters.jars.includes(jar as any);
}

/**
 * État par défaut des filtres
 */
export const DEFAULT_ADVANCED_FILTERS: AdvancedFilterState = {
  period: "all",
  customStartDate: "",
  customEndDate: "",
  minAmount: "",
  maxAmount: "",
  jars: [],
};
