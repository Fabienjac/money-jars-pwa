// Aides pures pour les graphiques mensuels (courbe de tendance, barres par jarre) : mois vides, échelle plafonnée.
// Testé dans tests/monthlyChart.test.mjs.

/** « 2026-03 » pour une date. */
export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Tous les mois entre le premier et le dernier (inclus), dans l'ordre : un mois sans saisie apparaît quand même.
 * Les clés illisibles sont ignorées.
 */
export function fillMonthKeys(keys: string[]): string[] {
  const valid = keys.filter((k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k)).sort();
  if (valid.length === 0) return [];
  const [y0, m0] = valid[0].split("-").map(Number);
  const [y1, m1] = valid[valid.length - 1].split("-").map(Number);
  const out: string[] = [];
  let y = y0, m = m0;
  while (y < y1 || (y === y1 && m <= m1)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Graduations « rondes » (1, 2, 2,5, 5 × 10ⁿ) de 0 jusqu'à un maximum ≥ max. */
export function niceTicks(max: number, count = 4): number[] {
  if (!isFinite(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) {
    ticks.push(Math.round(v / step) * step);
    if (ticks.length > 20) break;
    if (v >= max) break;
  }
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export interface AxisScale {
  /** Valeur en haut de l'axe. */
  max: number;
  ticks: number[];
  /** Un mois dépasse très nettement les autres : l'axe est coupé et ces mois sont marqués d'une cassure. */
  capped: boolean;
  /** Indices des valeurs qui dépassent le haut de l'axe. */
  overflow: number[];
}

/**
 * Échelle verticale. Si le plus grand mois dépasse 2,5 fois le deuxième (et qu'il y a au moins 3 mois non vides),
 * l'axe s'arrête un peu au-dessus du deuxième pour que les mois « normaux » restent lisibles.
 */
export function axisScale(values: number[]): AxisScale {
  const positives = values.filter((v) => v > 0).sort((a, b) => b - a);
  const top = positives[0] ?? 0;
  const second = positives[1] ?? 0;
  const capped = positives.length >= 3 && second > 0 && top > 2.5 * second;
  const ticks = niceTicks(capped ? second * 1.1 : top);
  const max = ticks[ticks.length - 1];
  const overflow = capped ? values.map((v, i) => (v > max ? i : -1)).filter((i) => i >= 0) : [];
  return { max, ticks, capped: overflow.length > 0, overflow };
}

/** Hauteur proportionnelle d'une valeur (0..1), coupée au haut de l'axe. */
export function ratioOf(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.min(value, max) / max;
}

/** Quels mois porter en légende pour ne pas surcharger l'axe : un sur `step`. */
export function labelStep(count: number, maxLabels = 12): number {
  return Math.max(1, Math.ceil(count / maxLabels));
}
