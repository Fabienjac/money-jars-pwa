// Création d'un tag depuis la saisie : un nom déjà existant (à la casse, aux accents et à la ponctuation près) n'est pas
// recréé, on retrouve le tag existant : pas de variante d'orthographe. Module pur, testé dans tests/tagCreate.test.mjs.
import type { Tag } from "./tagsUtils";
import { foldText } from "./entryRules";

export const TAG_COLORS = ["#06B6D4", "#8B5CF6", "#EF4444", "#F97316", "#EC4899", "#22C55E", "#6366F1", "#F59E0B"];
const MAX_NAME = 40;

export type NewTagResult =
  | { kind: "created"; tag: Tag }
  | { kind: "existing"; tag: Tag }
  | { kind: "error"; reason: "empty" | "tooLong" };

/** Identifiant technique : minuscules, sans accents, mots reliés par « _ » (même forme que ceux créés dans les Réglages). */
export function slugifyTagId(name: string): string {
  return foldText(name).replace(/ /g, "_");
}

export function createTag(nameRaw: string, emojiRaw: string, existing: Tag[]): NewTagResult {
  const name = String(nameRaw ?? "").trim().replace(/\s+/g, " ");
  const key = foldText(name);
  if (!key) return { kind: "error", reason: "empty" };
  if (name.length > MAX_NAME) return { kind: "error", reason: "tooLong" };

  const found = existing.find((t) => foldText(t.name) === key || foldText(t.id) === key);
  if (found) return { kind: "existing", tag: found };

  let id = slugifyTagId(name);
  const base = id;
  for (let n = 2; existing.some((t) => t.id === id); n++) id = `${base}_${n}`;

  return {
    kind: "created",
    tag: {
      id,
      name,
      emoji: (emojiRaw ?? "").trim() || "🏷️",
      color: TAG_COLORS[existing.length % TAG_COLORS.length],
      favori: true,
      categorie: "Intention",
    },
  };
}

/**
 * Tags à montrer d'emblée : les favoris, plus ceux déjà choisis même s'ils ne sont pas favoris. Les autres sont derrière
 * « N autres ».
 */
export function splitTags(all: Tag[], selectedIds: string[]): { shown: Tag[]; others: Tag[] } {
  const shown: Tag[] = [];
  const others: Tag[] = [];
  for (const t of all) (t.favori !== false || selectedIds.includes(t.id) ? shown : others).push(t);
  return { shown, others };
}
