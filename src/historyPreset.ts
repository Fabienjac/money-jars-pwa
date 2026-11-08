// Passage de filtres d'un écran à l'Historique (ex. « Voir dans l'Historique » depuis Analyses). Module pur : le
// stockage est passé en paramètre, testé dans tests/historyPreset.test.ts.

export const OPEN_HISTORY_EVENT = "mjars:openHistory";
const KEY = "mjars:historyPreset";

export interface HistoryPreset {
  /** Dates AAAA-MM-JJ de la période personnalisée ; absentes = pas de filtre de période. */
  from?: string;
  to?: string;
  /** Identifiant d'étiquette. */
  tag?: string;
  /** Clé de jarre (NEC, PLAY…). */
  jar?: string;
  /** Montant minimum saisi. */
  minAmount?: string;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ne garde que les champs attendus et bien formés (la valeur vient du stockage du navigateur). */
export function sanitizePreset(raw: unknown): HistoryPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: HistoryPreset = {};
  if (typeof r.from === "string" && DATE.test(r.from)) out.from = r.from;
  if (typeof r.to === "string" && DATE.test(r.to)) out.to = r.to;
  if (typeof r.tag === "string" && r.tag.length > 0 && r.tag.length <= 64) out.tag = r.tag;
  if (typeof r.jar === "string" && /^[A-Z]{2,6}$/.test(r.jar)) out.jar = r.jar;
  if (typeof r.minAmount === "string" && /^\d+([.,]\d+)?$/.test(r.minAmount.trim())) out.minAmount = r.minAmount.trim();
  return Object.keys(out).length > 0 ? out : null;
}

export function savePreset(p: HistoryPreset, storage: StorageLike): void {
  try { storage.setItem(KEY, JSON.stringify(p)); } catch { /* stockage indisponible : l'Historique s'ouvrira sans filtre */ }
}

/**
 * Lit le préréglage sans l'effacer. À utiliser dans l'initialisation d'un composant : React la joue deux fois en
 * développement, une lecture qui efface donnerait le préréglage à la première passe et rien à la seconde.
 */
export function peekPreset(storage: StorageLike): HistoryPreset | null {
  try {
    const raw = storage.getItem(KEY);
    return raw == null ? null : sanitizePreset(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Efface le préréglage : il ne s'applique qu'une fois (à appeler une fois l'écran monté). */
export function clearPreset(storage: StorageLike): void {
  try { storage.removeItem(KEY); } catch { /* sans importance */ }
}

/** Lit puis efface. */
export function takePreset(storage: StorageLike): HistoryPreset | null {
  const p = peekPreset(storage);
  clearPreset(storage);
  return p;
}
