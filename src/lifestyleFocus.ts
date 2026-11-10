// Train de vie : quelles étiquettes la courbe verte suit-elle ? Par défaut l'alimentation ; la personne peut en regrouper
// jusqu'à MAX_FOCUS. Module pur : testé dans tests/lifestyleFocus.test.mjs.

export const DEFAULT_FOCUS: string[] = ["alimentaire"];
export const MAX_FOCUS = 3;

/**
 * Choix enregistré → liste utilisable : textes uniques, étiquettes encore existantes, au plus MAX_FOCUS. Rien de valable
 * (jamais choisi, étiquettes supprimées) : l'alimentation par défaut.
 */
export function normalizeFocus(raw: unknown, knownIds: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_FOCUS];
  const known = new Set(knownIds);
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === "string" && known.has(x) && !out.includes(x)) out.push(x);
    if (out.length >= MAX_FOCUS) break;
  }
  return out.length > 0 ? out : [...DEFAULT_FOCUS];
}

/** Coche ou décoche une étiquette : jamais plus de MAX_FOCUS, jamais aucune (la dernière ne se retire pas). */
export function toggleFocus(current: readonly string[], id: string): string[] {
  if (current.includes(id)) return current.length > 1 ? current.filter((x) => x !== id) : [...current];
  return current.length >= MAX_FOCUS ? [...current] : [...current, id];
}

/** « Alimentation + Restaurant » : noms des étiquettes suivies. */
export function focusLabel(ids: readonly string[], nameOf: (id: string) => string): string {
  return ids.map(nameOf).join(" + ");
}
