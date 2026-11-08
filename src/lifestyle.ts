// Indicateur « train de vie » : dépense moyenne par jour depuis le début de l'année,
// hors dépenses extraordinaires (celles portant une étiquette que l'utilisateur a marquée comme telle).
// Module pur (aucune dépendance applicative) : testé dans tests/lifestyle.test.ts.

export interface LifestyleRow {
  date: string; // AAAA-MM-JJ (le suffixe heure éventuel est ignoré)
  amount: number; // dépense, nombre positif
  tags?: string | null; // identifiants d'étiquettes séparés par des virgules
}

export type LifestyleStatus = "up" | "stable" | "down";

export interface LifestyleStats {
  /** Début de la période : 1er janvier, ou la première dépense de l'année si elle est plus tardive. */
  startDate: string;
  /** Jours écoulés depuis startDate, jour courant inclus. */
  days: number;
  /** Dépenses de la période, toutes confondues. */
  total: number;
  /** Part marquée extraordinaire, et nombre d'opérations concernées. */
  extraordinary: number;
  extraordinaryCount: number;
  /** Dépenses courantes = total − extraordinaires. */
  regular: number;
  /** Dépense courante moyenne par jour depuis startDate (l'indicateur clé). */
  perDay: number;
  /** Même moyenne, extraordinaires inclus (pour comparer). */
  perDayAll: number;
  /** 30 derniers jours (courantes seulement) ; null tant que la période compte moins de 30 jours. */
  last30: { perDay: number; extraordinary: number } | null;
  /** Écart des 30 derniers jours par rapport à perDay, en % ; null si pas de comparaison possible. */
  deltaPct: number | null;
  status: LifestyleStatus | null;
}

/** Écart (±) en dessous duquel le train de vie est considéré stable. */
export const STABLE_BAND = 0.1;

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

function isoFromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function splitTags(tags: string | null | undefined): string[] {
  return String(tags ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function isExtraordinary(tags: string | null | undefined, extraordinaryTags: ReadonlySet<string>): boolean {
  if (extraordinaryTags.size === 0) return false;
  return splitTags(tags).some((id) => extraordinaryTags.has(id));
}

/** Date à partir de laquelle charger les dépenses : début d'année, ou 29 jours avant aujourd'hui s'il est plus tôt (janvier). */
export function lifestyleFetchFrom(today: string): string | null {
  const t = dayNumber(today);
  if (t == null) return null;
  const year = Number(today.slice(0, 4));
  const jan1 = dayNumber(`${year}-01-01`)!;
  return isoFromDayNumber(Math.min(jan1, t - 29));
}

export function computeLifestyle(
  rows: readonly LifestyleRow[],
  extraordinaryTags: ReadonlySet<string>,
  today: string
): LifestyleStats | null {
  const t = dayNumber(today);
  if (t == null) return null;
  const jan1 = dayNumber(`${today.slice(0, 4)}-01-01`)!;

  const dated = rows
    .map((r) => ({ d: dayNumber(r.date), amount: Number(r.amount), extra: isExtraordinary(r.tags, extraordinaryTags) }))
    .filter((r): r is { d: number; amount: number; extra: boolean } => r.d != null && Number.isFinite(r.amount) && r.d <= t);

  const inYear = dated.filter((r) => r.d >= jan1);
  if (inYear.length === 0) return null;

  const start = Math.max(jan1, Math.min(...inYear.map((r) => r.d)));
  const days = t - start + 1;

  let total = 0;
  let extra = 0;
  let extraCount = 0;
  for (const r of inYear) {
    total += r.amount;
    if (r.extra) {
      extra += r.amount;
      extraCount++;
    }
  }
  const regular = total - extra;
  const perDay = regular / days;

  let last30: LifestyleStats["last30"] = null;
  let deltaPct: number | null = null;
  let status: LifestyleStatus | null = null;
  if (days >= 30) {
    const from = t - 29;
    let reg30 = 0;
    let extra30 = 0;
    for (const r of dated) {
      if (r.d < from) continue;
      if (r.extra) extra30 += r.amount;
      else reg30 += r.amount;
    }
    last30 = { perDay: reg30 / 30, extraordinary: extra30 };
    if (perDay > 0) {
      deltaPct = ((last30.perDay - perDay) / perDay) * 100;
      status = deltaPct > STABLE_BAND * 100 ? "up" : deltaPct < -STABLE_BAND * 100 ? "down" : "stable";
    }
  }

  return {
    startDate: isoFromDayNumber(start),
    days,
    total,
    extraordinary: extra,
    extraordinaryCount: extraCount,
    regular,
    perDay,
    perDayAll: total / days,
    last30,
    deltaPct,
    status,
  };
}

/** Total dépensé cette année par étiquette (une opération portant plusieurs étiquettes compte pour chacune). */
export function tagTotalsThisYear(rows: readonly LifestyleRow[], today: string): Record<string, number> {
  const t = dayNumber(today);
  if (t == null) return {};
  const jan1 = dayNumber(`${today.slice(0, 4)}-01-01`)!;
  const out: Record<string, number> = {};
  for (const r of rows) {
    const d = dayNumber(r.date);
    const amount = Number(r.amount);
    if (d == null || d < jan1 || d > t || !Number.isFinite(amount)) continue;
    for (const id of splitTags(r.tags)) out[id] = (out[id] ?? 0) + amount;
  }
  return out;
}

// ── Courbe « dépense moyenne par jour » ───────────────────────────────────────

export interface RollingPoint {
  /** AAAA-MM-JJ */
  date: string;
  /** Dépense moyenne par jour sur les 30 jours se terminant à cette date. */
  avg: number;
}

/**
 * Moyenne glissante sur 30 jours, un point par semaine depuis le 7 janvier, plus un point pour aujourd'hui.
 * Les dépenses extraordinaires sont exclues ; avec `tagId`, seules les dépenses portant cette étiquette comptent.
 * Il faut les dépenses des 30 jours qui précèdent le 7 janvier pour que les premiers points soient justes.
 */
export function rollingAverageSeries(
  rows: readonly LifestyleRow[],
  extraordinaryTags: ReadonlySet<string>,
  today: string,
  tagId?: string
): RollingPoint[] {
  const t = dayNumber(today);
  if (t == null) return [];
  const start = dayNumber(`${today.slice(0, 4)}-01-07`)!;
  if (t < start) return [];

  const daily = new Map<number, number>();
  for (const r of rows) {
    const d = dayNumber(r.date);
    const amount = Number(r.amount);
    if (d == null || d > t || !Number.isFinite(amount)) continue;
    if (isExtraordinary(r.tags, extraordinaryTags)) continue;
    if (tagId && !splitTags(r.tags).includes(tagId)) continue;
    daily.set(d, (daily.get(d) ?? 0) + amount);
  }

  const average = (end: number) => {
    let sum = 0;
    for (let i = 0; i < 30; i++) sum += daily.get(end - i) ?? 0;
    return sum / 30;
  };

  const days: number[] = [];
  for (let d = start; d <= t; d += 7) days.push(d);
  if (days[days.length - 1] !== t) days.push(t);
  return days.map((d) => ({ date: isoFromDayNumber(d), avg: average(d) }));
}
