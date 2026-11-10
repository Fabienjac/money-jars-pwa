// Une dépense appartient toujours à l'une des six jarres. Un autre texte (un tag, un mot de l'IA ou d'un fichier importé)
// laisserait la dépense hors de toutes les jarres : elle compterait dans l'Historique mais pas dans les soldes.
// Module pur : testé dans tests/jarValidation.test.mjs.
import type { JarKey } from "./types";

export const JAR_KEYS: readonly JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];

/** La clé de jarre (casse et espaces tolérés), ou null si ce n'en est pas une. */
export function normalizeJar(raw: unknown): JarKey | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toUpperCase();
  return (JAR_KEYS as readonly string[]).includes(k) ? (k as JarKey) : null;
}
