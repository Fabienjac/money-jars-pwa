// src/autoRules.ts
import type { JarKey } from "./types";

export type AutoRuleMode = "spending" | "revenue";

export interface AutoRule {
  id: string;
  mode: AutoRuleMode;
  keyword: string;     // mot-clé à détecter dans la description / source

  // Pour les dépenses
  jar?: JarKey;
  account?: string;

  // Pour les revenus
  destination?: string;
  incomeType?: string;
}

const AUTO_RULES_KEY = "mjars:autoRules";

/**
 * Charge les règles depuis le localStorage.
 * Renvoie un tableau vide si rien trouvé ou si erreur.
 */
export function loadAutoRules(): AutoRule[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(AUTO_RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as AutoRule[];
  } catch {
    return [];
  }
}
