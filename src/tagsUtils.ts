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
    // Palette: cyan, violet, rouge, orange, rose, vert, bleu indigo
    { id: "vie_quotidienne", name: "Vie quotidienne", emoji: "🛒", color: "#06B6D4" }, // cyan
    { id: "alimentaire", name: "Alimentation", emoji: "🥗", color: "#84CC16" },        // vert lime
    { id: "sante_corps", name: "Santé & corps", emoji: "🧘", color: "#EC4899" },       // rose
    { id: "transport", name: "Transport", emoji: "🚗", color: "#F97316" },             // orange
    { id: "habitat", name: "Habitat", emoji: "🏠", color: "#8B5CF6" },                 // violet
    { id: "loisirs", name: "Loisirs", emoji: "🎉", color: "#22C55E" },                 // vert
    { id: "evolution", name: "Évolution", emoji: "🌱", color: "#6366F1" },             // bleu indigo
    { id: "administratif", name: "Administratif", emoji: "📄", color: "#EF4444" },     // rouge
    { id: "don_cadeau", name: "Don / Cadeau", emoji: "🎁", color: "#0EA5E9" },         // cyan clair
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
