// src/tagsUtils.ts

export interface Tag {
  id: string;
  name: string;
  emoji: string;
  color: string;
  favori?: boolean;   // colonne F du sheet ("OUI"/"NON")
  categorie?: string; // colonne E du sheet ("Intention"/"Transversal"/…)
}

/**
 * Tags prédéfinis - Basés sur l'onglet Tags du Google Sheet
 * Les IDs correspondent exactement à ce qui sera sauvegardé dans Google Sheets
 */
export function getDefaultTags(): Tag[] {
  return [
    // Palette: cyan, violet, rouge, orange, rose, vert, bleu indigo
    { id: "vie_quotidienne", name: "Vie quotidienne", emoji: "🛒", color: "#06B6D4", favori: true },
    { id: "alimentaire",    name: "Alimentation",    emoji: "🍓", color: "#81CF6B", favori: true },
    { id: "sante_corps",    name: "Santé & corps",   emoji: "🧘", color: "#EC4899", favori: true },
    { id: "transport",      name: "Transport",       emoji: "🚗", color: "#F97316", favori: true },
    { id: "habitat",        name: "Habitat",         emoji: "🏠", color: "#8B5CF6", favori: true },
    { id: "loisirs",        name: "Loisirs",         emoji: "🎉", color: "#22C55E", favori: true },
    { id: "evolution",      name: "Évolution",       emoji: "🌱", color: "#6366F1", favori: true },
    { id: "administratif",  name: "Administratif",   emoji: "📄", color: "#EF4444", favori: false },
    { id: "don_cadeau",     name: "Don / Cadeau",    emoji: "🎁", color: "#0EA5E9", favori: false },
  ];
}

// ── Cache des tags chargés depuis Google Sheets ──────────────────────────────
const TAGS_CACHE_KEY = "mjars:tags";
let _cachedTags: Tag[] | null = null;

/**
 * Mémorise les tags récupérés depuis le Sheet (appelé au démarrage de l'app)
 */
export function setCachedTags(tags: Tag[]): void {
  if (!tags || tags.length === 0) return;
  _cachedTags = tags;
  try { localStorage.setItem(TAGS_CACHE_KEY, JSON.stringify(tags)); } catch {}
}

/**
 * Charge tous les tags disponibles.
 * Priorité : mémoire → localStorage → défauts codés en dur
 */
export function loadTags(): Tag[] {
  if (_cachedTags && _cachedTags.length > 0) return _cachedTags;
  try {
    const raw = localStorage.getItem(TAGS_CACHE_KEY);
    if (raw) {
      const parsed: Tag[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        _cachedTags = parsed;
        return parsed;
      }
    }
  } catch {}
  return getDefaultTags();
}

/**
 * Trouve un tag par son ID (dans les tags chargés)
 */
export function getTagById(tagId: string): Tag | undefined {
  return loadTags().find(t => t.id === tagId);
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
