// src/tagStatsUtils.ts
import { SearchSpendingResult } from "./types";
import { getTagById, loadTags } from "./tagsUtils";

export type { TagStat } from "./tagStatsCore";
import { computeTagStats, type TagStat } from "./tagStatsCore";

/**
 * Calculer les statistiques par tag
 */
export function calculateTagStats(transactions: SearchSpendingResult[]): TagStat[] {
  return computeTagStats(transactions, loadTags(), getTagById);
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
