// src/revenueAccountsUtils.ts
import { RevenueAccount } from "./types";

const REVENUE_ACCOUNTS_KEY = "mjars:revenueAccounts";

/**
 * Charge la liste des comptes de revenus depuis le localStorage.
 */
export function loadRevenueAccounts(): RevenueAccount[] {
  if (typeof window === "undefined") return getDefaultRevenueAccounts();

  try {
    const raw = localStorage.getItem(REVENUE_ACCOUNTS_KEY);
    if (!raw) return getDefaultRevenueAccounts();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getDefaultRevenueAccounts();
    return parsed as RevenueAccount[];
  } catch {
    return getDefaultRevenueAccounts();
  }
}

/**
 * Sauvegarde la liste des comptes de revenus dans le localStorage.
 */
export function saveRevenueAccounts(accounts: RevenueAccount[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REVENUE_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (error) {
    console.error("Erreur lors de la sauvegarde des comptes de revenus:", error);
  }
}

/**
 * Retourne la liste des comptes de revenus par défaut.
 */
function getDefaultRevenueAccounts(): RevenueAccount[] {
  return [
    { id: "rev_1", name: "Binance", icon: "🪙", type: "Crypto" },
    { id: "rev_2", name: "Upwork", icon: "💼", type: "Freelance" },
    { id: "rev_3", name: "Dtsmoney", icon: "💰", type: "Passive" },
    { id: "rev_4", name: "Autre", icon: "📊", type: "Autre" },
  ];
}
