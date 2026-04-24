// src/autoTagRules.ts
// Logique pure pour les règles d'auto-tag.
// Le stockage (Google Sheets + cache localStorage) est géré dans api.ts.

export interface AutoTagRule {
  /** Clé normalisée du libellé original (lowercase, trim, espace unique) */
  originalKey: string;
  /** Description affichée corrigée par l'utilisateur */
  correctedDescription: string;
  /** IDs de tags */
  tags: string[];
  /** Jarre suggérée */
  jar?: string;
  /** Nombre de fois que cette règle a été confirmée */
  useCount: number;
  /** Dernière mise à jour ISO */
  updatedAt: string;
}

/** Normalise un libellé pour le matching */
export function normalizeKey(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Trouve une règle correspondant à un libellé original (null si aucune) */
export function findRule(
  originalDescription: string,
  rules: AutoTagRule[]
): AutoTagRule | null {
  const key = normalizeKey(originalDescription);
  return rules.find(r => r.originalKey === key) ?? null;
}

/**
 * Retourne un nouveau tableau de règles avec la règle pour ce libellé
 * créée ou mise à jour. Fonction pure (ne touche pas au stockage).
 */
export function upsertRule(
  rules: AutoTagRule[],
  originalDescription: string,
  correctedDescription: string,
  tags: string[],
  jar?: string
): AutoTagRule[] {
  const key = normalizeKey(originalDescription);
  const now = new Date().toISOString();
  const existingIdx = rules.findIndex(r => r.originalKey === key);

  if (existingIdx >= 0) {
    const updated = [...rules];
    updated[existingIdx] = {
      ...rules[existingIdx],
      correctedDescription,
      tags,
      jar,
      useCount: rules[existingIdx].useCount + 1,
      updatedAt: now,
    };
    return updated;
  }

  return [
    ...rules,
    {
      originalKey: key,
      correctedDescription,
      tags,
      jar,
      useCount: 1,
      updatedAt: now,
    },
  ];
}

// ── Cache localStorage (fallback offline) ────────────────────────────────────

const LS_CACHE_KEY = "mjars:autotag:rules";

export function loadCachedRules(): AutoTagRule[] {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AutoTagRule[];
  } catch {
    return [];
  }
}

export function saveCachedRules(rules: AutoTagRule[]): void {
  try {
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(rules));
  } catch {}
}
