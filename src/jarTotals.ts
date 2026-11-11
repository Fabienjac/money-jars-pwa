// Totaux servant au solde des jarres : dépenses par jarre et total des revenus, depuis le début.
// Module pur, testé dans tests/jarTotals.test.ts.
//
// Deux sources donnent le même résultat :
//  - la fonction SQL my_jar_totals() (supabase/jar_totals.sql) : la base additionne et renvoie quelques chiffres ;
//  - l'ancienne lecture de toutes les lignes (repli si la fonction n'existe pas encore) : totalsFromRows().

import type { JarKey } from "./types";

export interface JarTotalsSource {
  /** Dépenses cumulées par jarre. */
  spending: Record<JarKey, number>;
  /** Total des revenus (montants déjà dans la devise de référence). */
  revenueTotal: number;
}

// Pas d'import d'un autre module : celui-ci est exécuté tel quel par les tests (node --test)
const JAR_KEYS: readonly string[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
const isJarKey = (x: unknown): x is JarKey => typeof x === "string" && JAR_KEYS.includes(x);

const emptySpending = (): Record<JarKey, number> => ({ NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 });

/** Mêmes règles que la fonction SQL : un revenu sans montant vaut quantité de crypto × cours. */
export function revenueAmount(r: { amount: number | string | null; rate?: number | string | null; crypto_quantity?: number | string | null }): number {
  return r.amount != null ? Number(r.amount) : Number(r.crypto_quantity ?? 0) * Number(r.rate ?? 0);
}

/** Repli : totaux calculés sur l'appareil à partir de toutes les lignes (jarres inconnues ignorées). */
export function totalsFromRows(
  spendings: Array<{ jar: string; amount: number | string }>,
  revenues: Array<{ amount: number | string | null; rate?: number | string | null; crypto_quantity?: number | string | null }>,
): JarTotalsSource {
  const spending = emptySpending();
  for (const s of spendings) if (isJarKey(s.jar)) spending[s.jar] += Number(s.amount);
  return { spending, revenueTotal: revenues.reduce((sum, r) => sum + revenueAmount(r), 0) };
}

/**
 * Lit la réponse de my_jar_totals() : { spending: { NEC: 123.45, … }, revenue_total: 4567.89 }.
 * null si la forme est inattendue (l'appelant retombe alors sur l'ancienne lecture) ; jarres inconnues ignorées.
 */
export function parseDbTotals(data: unknown): JarTotalsSource | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { spending?: unknown; revenue_total?: unknown };
  const revenueTotal = Number(d.revenue_total);
  if (d.revenue_total == null || !Number.isFinite(revenueTotal)) return null;
  if (!d.spending || typeof d.spending !== "object" || Array.isArray(d.spending)) return null;
  const spending = emptySpending();
  for (const [jar, v] of Object.entries(d.spending as Record<string, unknown>)) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (isJarKey(jar)) spending[jar] = n;
  }
  return { spending, revenueTotal };
}
