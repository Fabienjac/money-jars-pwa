// Projection de fin de mois des dépenses. Module pur : testé dans tests/monthProjection.test.ts.
//
// Une règle de trois sur le total du mois est trompeuse dès qu'une grosse dépense ponctuelle tombe en début de mois :
// un billet d'avion de 600 € le 3 donnerait 6 000 € « au rythme actuel ». On projette donc le seul rythme courant
// (dépenses hors exceptionnelles) et on ajoute telles quelles les exceptionnelles déjà dépensées.

export interface MonthProjectionInput {
  /** Dépensé depuis le 1er, hors dépenses exceptionnelles. */
  regularSoFar: number;
  /** Dépenses exceptionnelles déjà faites ce mois. */
  oneOffSoFar: number;
  /** Jour du mois (1 = premier jour). */
  day: number;
  daysInMonth: number;
}

export interface MonthProjection {
  /** Total attendu en fin de mois. */
  projected: number;
  /** Part courante projetée (hors exceptionnelles). */
  regularProjected: number;
  /** Exceptionnelles déjà dépensées, reprises telles quelles. */
  oneOff: number;
}

export function projectMonthEnd({ regularSoFar, oneOffSoFar, day, daysInMonth }: MonthProjectionInput): MonthProjection | null {
  if (!(day >= 1) || !(daysInMonth >= day)) return null;
  const regularProjected = (regularSoFar / day) * daysInMonth;
  const oneOff = oneOffSoFar;
  return { projected: regularProjected + oneOff, regularProjected, oneOff };
}

/** Avant le 10 du mois, une extrapolation sur quelques jours est trop instable pour être affichée. */
export const PROJECTION_MIN_DAY = 10;
export const projectionReady = (day: number): boolean => day >= PROJECTION_MIN_DAY;

/** Sépare les dépenses d'un mois en courantes et exceptionnelles (une dépense qui porte une étiquette exceptionnelle). */
export function splitOneOff(
  rows: Array<{ amount: number; tags?: string | null }>,
  oneOffTagIds: string[]
): { regular: number; oneOff: number } {
  const set = new Set(oneOffTagIds);
  let regular = 0;
  let oneOff = 0;
  for (const r of rows) {
    const ids = String(r.tags ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (ids.some((id) => set.has(id))) oneOff += r.amount || 0;
    else regular += r.amount || 0;
  }
  return { regular, oneOff };
}
