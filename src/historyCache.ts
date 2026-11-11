// Cache en mémoire de l'écran Historique (dépenses et revenus), pour ne pas relire tout l'historique à chaque visite
// ou à chaque passage Dépenses ↔ Revenus. Module pur (aucun import) : testé dans tests/historyCache.test.ts.
//
// Principe : on affiche tout de suite ce qu'on a en mémoire ; si la copie a plus de FRESH_MS, l'écran la rafraîchit
// discrètement. Toute écriture de données (ajout, modification, suppression, import, renommage) vide le cache.

export type HistoryKind = "spending" | "revenue";

/** Durée pendant laquelle une copie est considérée à jour (pas de nouvelle lecture). */
export const FRESH_MS = 20_000;

interface Entry {
  rows: unknown[];
  at: number;
  /** Première date (AAAA-MM-JJ) couverte par la copie ; null = tout l'historique. */
  since: string | null;
}

let version = 0;
const store = new Map<string, Entry>();
const keyOf = (user: string, kind: HistoryKind) => `${user}|${kind}`;

/** Numéro de version : à relever avant de lancer une lecture, à repasser à l'écriture dans le cache. */
export function cacheVersion(): number {
  return version;
}

/** Vide le cache. Une lecture déjà en cours devient périmée (voir writeHistoryCache). */
export function invalidateHistoryCache(): void {
  version++;
  store.clear();
}

/**
 * Copie en mémoire (ou null) ; `fresh` dit si elle a moins de FRESH_MS ; `since` dit jusqu'où elle remonte
 * (null = tout l'historique : seule une copie complète convient aux écrans qui comptent sur toutes les lignes).
 */
export function readHistoryCache<T>(user: string, kind: HistoryKind, now = Date.now()): { rows: T[]; fresh: boolean; since: string | null } | null {
  const e = store.get(keyOf(user, kind));
  if (!e) return null;
  return { rows: e.rows as T[], fresh: now - e.at < FRESH_MS, since: e.since };
}

/**
 * Enregistre le résultat d'une lecture. Refusé (false) si une écriture de données a eu lieu depuis le début de la
 * lecture : ce résultat pourrait déjà être périmé.
 */
export function writeHistoryCache<T>(user: string, kind: HistoryKind, rows: T[], startedAtVersion: number, now = Date.now(), since: string | null = null): boolean {
  if (startedAtVersion !== version) return false;
  store.set(keyOf(user, kind), { rows, at: now, since });
  return true;
}

/** Après une modification faite sur l'écran lui-même : met la copie à jour sans relire (la date de lecture ne change pas). */
export function rememberHistoryRows<T>(user: string, kind: HistoryKind, rows: T[], now = Date.now(), since?: string | null): void {
  const k = keyOf(user, kind);
  const prev = store.get(k);
  store.set(k, { rows, at: prev ? prev.at : now, since: since !== undefined ? since : prev ? prev.since : null });
}
