// Écran Réglages : blocs repliables. Quels blocs sont ouverts à l'arrivée ?
//   - premier passage sur cet appareil : seul le bloc des jarres est ouvert (c'est ce qu'on vient régler en premier) ;
//   - ensuite : tout est replié, sauf ce que la personne a ouvert pendant la session en cours ;
//   - un lien venu d'un autre écran (ex. le rappel de janvier vers les transferts) ouvre son bloc d'office.
// Module pur : testé dans tests/settingsAccordion.test.mjs.

/** localStorage : présent dès qu'on a ouvert les Réglages une fois. */
export const SEEN_KEY = "mjars:settingsSeen";
/** sessionStorage : blocs ouverts pendant la session (liste JSON d'identifiants). */
export const OPEN_KEY = "mjars:settingsOpen";
/** sessionStorage : un bloc à ouvrir d'office à la prochaine arrivée (lien venu de « Pour démarrer »), lu une seule fois. */
export const FORCE_OPEN_KEY = "mjars:settingsForceOpen";
/** Bloc ouvert au tout premier passage. */
export const FIRST_VISIT_OPEN = ["jars"];

export function parseOpenIds(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

export function initialOpenIds(o: { seen: boolean; stored: string[] | null; forced?: string[] }): string[] {
  const base = o.seen ? (o.stored ?? []) : FIRST_VISIT_OPEN;
  const out = [...base];
  for (const id of o.forced ?? []) if (!out.includes(id)) out.push(id);
  return out;
}

export function toggleOpenId(open: string[], id: string): string[] {
  return open.includes(id) ? open.filter((x) => x !== id) : [...open, id];
}

/** « 55 / 10 / 10 / 10 / 10 / 5 % » : répartition des jarres en un coup d'œil (valeurs non numériques ignorées). */
export function percentsSummary(settings: Array<{ percent: unknown }>): string {
  const vals = settings.map((s) => Number(s.percent)).filter((n) => Number.isFinite(n));
  if (vals.length === 0) return "";
  return vals.map((n) => String(Math.round(n * 100) / 100)).join(" / ") + " %";
}
