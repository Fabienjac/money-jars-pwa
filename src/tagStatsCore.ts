// Calcul des statistiques par étiquette. Module pur (types seulement) : testé dans tests/tagStatsUtils.test.mjs.
import type { SearchSpendingResult } from "./types";

export interface TagLike {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface TagStat {
  tagId: string;
  tagName: string;
  emoji: string;
  color: string;
  totalAmount: number;
  count: number;
  /**
   * Part des dépenses touchées par cette étiquette : montant / total réellement dépensé. Une dépense qui porte
   * plusieurs étiquettes compte en entier dans chacune : la somme des parts peut donc dépasser 100 %.
   */
  percentage: number;
  /** Poids relatif dans le graphique en anneau : montant / somme des montants par étiquette (somme = 100 %). */
  pieShare: number;
}

/**
 * Calculer les statistiques par tag
 */
export function computeTagStats(
  transactions: SearchSpendingResult[],
  allTags: TagLike[],
  getTagById: (id: string) => TagLike | undefined
): TagStat[] {
  const tagMap = new Map<string, { amount: number; count: number }>();

  // Initialiser tous les tags à 0
  allTags.forEach(tag => {
    tagMap.set(tag.id, { amount: 0, count: 0 });
  });

  // Parcourir toutes les transactions
  transactions.forEach(transaction => {
    if (!transaction.tags) return;

    const tagIds = transaction.tags.split(',').map(t => t.trim()).filter(Boolean);
    const amount = transaction.amount || 0;

    tagIds.forEach(tagId => {
      const current = tagMap.get(tagId);
      if (current) {
        current.amount += amount;
        current.count += 1;
      } else {
        // Tag inconnu, on l'ajoute quand même
        tagMap.set(tagId, { amount, count: 1 });
      }
    });
  });

  // Somme des montants par étiquette (une dépense à deux étiquettes y figure deux fois) : sert aux angles du graphique
  const tagSum = Array.from(tagMap.values()).reduce((sum, stat) => sum + stat.amount, 0);
  // Total réellement dépensé (chaque dépense une seule fois, étiquetée ou non) : sert aux pourcentages
  const totalSpent = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);

  // Convertir en tableau de stats
  const stats: TagStat[] = [];

  tagMap.forEach((stat, tagId) => {
    const tag = getTagById(tagId);
    if (stat.count > 0) {  // N'afficher que les tags utilisés
      stats.push({
        tagId,
        tagName: tag?.name || tagId,
        emoji: tag?.emoji || '🏷️',
        color: tag?.color || '#999',
        totalAmount: stat.amount,
        count: stat.count,
        percentage: totalSpent > 0 ? (stat.amount / totalSpent) * 100 : 0,
        pieShare: tagSum > 0 ? (stat.amount / tagSum) * 100 : 0,
      });
    }
  });

  // Trier par montant décroissant
  return stats.sort((a, b) => b.totalAmount - a.totalAmount);
}

