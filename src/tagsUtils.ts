// src/tagsUtils.ts

export interface Tag {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

/**
 * Tags prédéfinis - Basés sur l'onglet Tags du Google Sheet
 * Les IDs correspondent exactement à ce qui sera sauvegardé dans Google Sheets
 */
export function getDefaultTags(): Tag[] {
  return [
    { id: "vie_quotidienne", name: "Vie quotidienne", emoji: "🛒", color: "#FFD60A" },
    { id: "sante_corps", name: "Santé & corps", emoji: "🧘", color: "#FF9AA2" },
    { id: "transport", name: "Transport", emoji: "🚗", color: "#FF9500" },
    { id: "habitat", name: "Habitat", emoji: "🏠", color: "#AF52DE" },
    { id: "loisirs", name: "Loisirs", emoji: "🎉", color: "#30D158" },
    { id: "evolution", name: "Évolution", emoji: "🌱", color: "#34C759" },
    { id: "administratif", name: "Administratif", emoji: "📄", color: "#FF3B30" },
    { id: "don_cadeau", name: "Don / Cadeau", emoji: "🎁", color: "#FFCC00" },
  ];
}

/**
 * Charge tous les tags disponibles
 * Pour l'instant juste les prédéfinis, mais extensible plus tard via Google Sheets
 */
export function loadTags(): Tag[] {
  return getDefaultTags();
}

/**
 * Trouve un tag par son ID
 */
export function getTagById(tagId: string): Tag | undefined {
  return getDefaultTags().find(t => t.id === tagId);
}

/**
 * Convertit un array de tag IDs en string pour Google Sheets
 * ["vie_quotidienne", "transport"] → "vie_quotidienne,transport"
 */
export function tagsToString(tagIds: string[]): string {
  return tagIds.join(",");
}

/**
 * Parse une string de tags depuis Google Sheets en array
 * "vie_quotidienne,transport" → ["vie_quotidienne", "transport"]
 */
export function tagsFromString(tagsString: string | undefined | null): string[] {
  if (!tagsString || tagsString.trim() === "") return [];
  return tagsString.split(",").map(t => t.trim()).filter(Boolean);
}
