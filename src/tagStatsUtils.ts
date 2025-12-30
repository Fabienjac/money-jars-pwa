// src/tagStatsUtils.ts
import { SearchSpendingResult } from "./types";
import { getTagById, loadTags } from "./tagsUtils";

export interface TagStat {
  tagId: string;
  tagName: string;
  emoji: string;
  color: string;
  totalAmount: number;
  count: number;
  percentage: number;
}

/**
 * Calculer les statistiques par tag
 */
export function calculateTagStats(transactions: SearchSpendingResult[]): TagStat[] {
  const allTags = loadTags();
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

  // Calculer le total pour les pourcentages
  const totalAmount = Array.from(tagMap.values()).reduce((sum, stat) => sum + stat.amount, 0);

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
        percentage: totalAmount > 0 ? (stat.amount / totalAmount) * 100 : 0,
      });
    }
  });

  // Trier par montant décroissant
  return stats.sort((a, b) => b.totalAmount - a.totalAmount);
}

/**
 * Filtrer les transactions par tags sélectionnés
 */
export function filterByTags(
  transactions: SearchSpendingResult[],
  selectedTags: string[]
): SearchSpendingResult[] {
  if (selectedTags.length === 0) {
    return transactions;
  }

  return transactions.filter(transaction => {
    if (!transaction.tags) return false;

    const transactionTags = transaction.tags.split(',').map(t => t.trim());
    
    // La transaction doit avoir AU MOINS UN des tags sélectionnés
    return selectedTags.some(selectedTag => transactionTags.includes(selectedTag));
  });
}

/**
 * Obtenir tous les tags uniques présents dans les transactions
 */
export function getUsedTags(transactions: SearchSpendingResult[]): string[] {
  const tagSet = new Set<string>();

  transactions.forEach(transaction => {
    if (!transaction.tags) return;

    const tagIds = transaction.tags.split(',').map(t => t.trim()).filter(Boolean);
    tagIds.forEach(tagId => tagSet.add(tagId));
  });

  return Array.from(tagSet);
}
