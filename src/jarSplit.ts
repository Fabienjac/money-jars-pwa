// Répartition des revenus entre les jarres (fractions : 0,55 = 55 %), lue dans les réglages des jarres.
// Les réglages vivent dans le cloud (table jar_settings) et sont recopiés en local pour aller vite ; sur un appareil
// qui n'a pas cette copie (nouvel appareil, déconnexion, stockage vidé), l'écran d'accueil relit le cloud.
// Module pur : testé dans tests/jarSplit.test.mjs.

export interface JarSettingLike {
  key?: unknown;
  percent?: unknown;
}

/** Fractions par jarre à partir de lignes {key, percent (en %)}. Les lignes mal formées sont ignorées. */
export function splitFromSettings(rows: unknown): Record<string, number> | null {
  if (!Array.isArray(rows)) return null;
  const map: Record<string, number> = {};
  for (const j of rows as JarSettingLike[]) {
    const pct = Number(j?.percent);
    if (typeof j?.key === "string" && j.key && Number.isFinite(pct)) map[j.key] = pct / 100;
  }
  return Object.keys(map).length > 0 ? map : null;
}
