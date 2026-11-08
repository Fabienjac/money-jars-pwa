// Poids relatif des étiquettes (écran Analyses > Par tag). Module pur, testé dans tests/tagWeight.test.ts.
import type { TagStat } from "./tagStatsCore";

const byAmount = (a: TagStat, b: TagStat) => b.totalAmount - a.totalAmount;

export interface WeightGroups {
  /** Étiquettes affichées une à une, de la plus lourde à la plus légère. */
  head: TagStat[];
  /** Étiquettes regroupées sous « Autres » (vide s'il n'y a rien à regrouper). */
  others: TagStat[];
  othersAmount: number;
  /** Poids cumulé des « Autres » (somme des poids : 100 % avec ceux de `head`). */
  othersShare: number;
}

/**
 * Garde les `keep` plus lourdes et regroupe le reste sous « Autres ». Regrouper une seule étiquette n'aurait pas de
 * sens : tant qu'il y en a au plus `keep + 1`, toutes restent visibles.
 */
export function groupTagWeights(stats: TagStat[], keep = 6): WeightGroups {
  const sorted = [...stats].sort(byAmount);
  if (sorted.length <= keep + 1) return { head: sorted, others: [], othersAmount: 0, othersShare: 0 };
  const head = sorted.slice(0, keep);
  const others = sorted.slice(keep);
  return {
    head,
    others,
    othersAmount: others.reduce((s, t) => s + t.totalAmount, 0),
    othersShare: others.reduce((s, t) => s + t.pieShare, 0),
  };
}

/** Poids cumulé des `n` plus lourdes étiquettes (0 à 100). */
export function topShare(stats: TagStat[], n = 3): number {
  return [...stats].sort(byAmount).slice(0, n).reduce((s, t) => s + t.pieShare, 0);
}

/** La plus lourde et la plus légère (même étiquette s'il n'y en a qu'une). */
export function extremes(stats: TagStat[]): { largest?: TagStat; smallest?: TagStat } {
  if (stats.length === 0) return {};
  const sorted = [...stats].sort(byAmount);
  return { largest: sorted[0], smallest: sorted[sorted.length - 1] };
}
