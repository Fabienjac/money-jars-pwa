// src/accountsUtils.ts
import { Account } from "./types";

const ACCOUNTS_KEY = "mjars:accounts";

/**
 * Charge la liste des comptes depuis le localStorage.
 * Renvoie des comptes par défaut si rien n'est trouvé.
 */
export function loadAccounts(): Account[] {
  if (typeof window === "undefined") return getDefaultAccounts();

  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return getDefaultAccounts();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getDefaultAccounts();
    return parsed as Account[];
  } catch {
    return getDefaultAccounts();
  }
}

/**
 * Sauvegarde la liste des comptes dans le localStorage.
 */
export function saveAccounts(accounts: Account[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (error) {
    console.error("Erreur lors de la sauvegarde des comptes:", error);
  }
}

/**
 * Retourne la liste des comptes par défaut.
 */
function getDefaultAccounts(): Account[] {
  return [
    { id: "acc_1", name: "Cash", icon: "💵" },
    { id: "acc_2", name: "Revolut", icon: "💳" },
    { id: "acc_3", name: "N26", icon: "🏦" },
  ];
}
