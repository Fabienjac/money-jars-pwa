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

/** Une ou plusieurs étiquettes à suivre. Une dépense compte dès qu'elle porte l'une d'elles, et une seule fois. */
export type TagFocus = string | readonly string[];

/** Un focus est actif s'il désigne au moins une étiquette. */
export function focusActive(focus: TagFocus | undefined): focus is TagFocus {
  return typeof focus === "string" ? focus !== "" : !!focus && focus.length > 0;
}

/** La dépense (ses étiquettes « a,b,c ») entre-t-elle dans le focus ? Sans focus, toutes les dépenses comptent. */
export function matchesFocus(tags: string | null | undefined, focus: TagFocus | undefined): boolean {
  if (!focusActive(focus)) return true;
  const own = splitTags(tags);
  return typeof focus === "string" ? own.includes(focus) : focus.some((id) => own.includes(id));
}

/** Date à partir de laquelle charger les dépenses : début d'année, ou 29 jours avant aujourd'hui s'il est plus tôt (janvier). */
export function lifestyleFetchFrom(today: string): string | null {
  const t = dayNumber(today);
  if (t == null) return null;
  const year = Number(today.slice(0, 4));
  const jan1 = dayNumber(`${year}-01-01`)!;
  return isoFromDayNumber(Math.min(jan1, t - 29));
}

export interface LifestyleOptions {
  /** Ne compter que les dépenses portant cette étiquette, ou l'une de ces étiquettes (ex. « alimentaire »). */
  tagId?: TagFocus;
  /** Début de période imposé (AAAA-MM-JJ), pour comparer une étiquette sur la même période que le total. */
  start?: string;
}

export function computeLifestyle(
  rows: readonly LifestyleRow[],
  extraordinaryTags: ReadonlySet<string>,
  today: string,
  options: LifestyleOptions = {}
): LifestyleStats | null {
  const t = dayNumber(today);
  if (t == null) return null;
  const jan1 = dayNumber(`${today.slice(0, 4)}-01-01`)!;

  const dated = rows
    .filter((r) => matchesFocus(r.tags, options.tagId))
    .map((r) => ({ d: dayNumber(r.date), amount: Number(r.amount), extra: isExtraordinary(r.tags, extraordinaryTags) }))
    .filter((r): r is { d: number; amount: number; extra: boolean } => r.d != null && Number.isFinite(r.amount) && r.d <= t);

  const inYear = dated.filter((r) => r.d >= jan1);
  if (inYear.length === 0) return null;

  const forced = options.start ? dayNumber(options.start) : null;
  const start = forced != null ? Math.max(jan1, forced) : Math.max(jan1, Math.min(...inYear.map((r) => r.d)));
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
  tagId?: TagFocus
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
    if (!matchesFocus(r.tags, tagId)) continue;
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

/**
 * Dépense moyenne par jour sur les 30 jours qui se terminent à `date`, hors extraordinaires (et limitée à une
 * étiquette si `tagId`). Sert à comparer « maintenant » à « il y a 3 mois ». null si la date est invalide.
 */
export function rollingAverageAt(
  rows: readonly LifestyleRow[],
  extraordinaryTags: ReadonlySet<string>,
  date: string,
  tagId?: TagFocus
): number | null {
  const end = dayNumber(date);
  if (end == null) return null;
  let sum = 0;
  for (const r of rows) {
    const d = dayNumber(r.date);
    const amount = Number(r.amount);
    if (d == null || d > end || d <= end - 30 || !Number.isFinite(amount)) continue;
    if (isExtraordinary(r.tags, extraordinaryTags)) continue;
    if (!matchesFocus(r.tags, tagId)) continue;
    sum += amount;
  }
  return sum / 30;
}

export interface WindowStats {
  /** Premier et dernier jour de la fenêtre (AAAA-MM-JJ) : les 30 jours qui se terminent à `today`, jour courant inclus. */
  from: string;
  to: string;
  /** Somme des dépenses retenues (hors extraordinaires, limitées au focus) et leur nombre. */
  sum: number;
  count: number;
}

/**
 * Ce qui entre dans la moyenne sur 30 jours affichée par la carte : la somme, divisée par 30, donne exactement le
 * dernier point de rollingAverageSeries. Sert à contrôler les chiffres (somme et liste des dépenses concernées).
 */
export function windowStats(
  rows: readonly LifestyleRow[],
  extraordinaryTags: ReadonlySet<string>,
  today: string,
  focus?: TagFocus
): WindowStats | null {
  const end = dayNumber(today);
  if (end == null) return null;
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    const d = dayNumber(r.date);
    const amount = Number(r.amount);
    if (d == null || d > end || d <= end - 30 || !Number.isFinite(amount)) continue;
    if (isExtraordinary(r.tags, extraordinaryTags)) continue;
    if (!matchesFocus(r.tags, focus)) continue;
    sum += amount;
    count++;
  }
  return { from: isoFromDayNumber(end - 29), to: today, sum, count };
}

/** Date AAAA-MM-JJ située `days` jours avant `date` ; null si `date` est invalide. */
export function daysBefore(date: string, days: number): string | null {
  const n = dayNumber(date);
  return n == null ? null : isoFromDayNumber(n - days);
}

export interface TrendLine {
  /** Moyenne par jour sur les 30 derniers jours. */
  perDay30: number;
  /** Moyenne par jour depuis le début de la période (la référence de l'écart « deltaYear »). */
  perDayYear: number;
  /** Équivalent sur un mois (30 jours). */
  perMonth: number;
  /** Écart des 30 derniers jours par rapport à la moyenne depuis le début de la période, en %. */
  deltaYear: number | null;
  status: LifestyleStatus | null;
  /** Écart par rapport aux 30 jours qui se terminaient il y a ~3 mois (91 jours), en % ; null si pas assez d'historique. */
  delta3m: number | null;
  /** Début de la période de référence (AAAA-MM-JJ). */
  since: string;
}

const statusOf = (pct: number): LifestyleStatus => (pct > STABLE_BAND * 100 ? "up" : pct < -STABLE_BAND * 100 ? "down" : "stable");

/**
 * Évolution d'une dépense courante (tout, ou une étiquette) : 30 derniers jours contre la moyenne de la période et
 * contre il y a 3 mois. `period` = début de période du total, pour que les lignes soient comparables entre elles.
 * null tant que la période compte moins de 30 jours.
 */
export function trendLine(
  rows: readonly LifestyleRow[],
  extraordinaryTags: ReadonlySet<string>,
  today: string,
  tagId?: TagFocus
): TrendLine | null {
  const total = computeLifestyle(rows, extraordinaryTags, today);
  if (!total || !total.last30) return null;
  const own = focusActive(tagId) ? computeLifestyle(rows, extraordinaryTags, today, { tagId, start: total.startDate }) : total;
  const perDay30 = focusActive(tagId) ? computeLifestyle(rows, extraordinaryTags, today, { tagId })?.last30?.perDay ?? 0 : total.last30.perDay;
  const yearAvg = own?.perDay ?? 0;
  const deltaYear = yearAvg > 0 ? ((perDay30 - yearAvg) / yearAvg) * 100 : null;

  // « Il y a 3 mois » : les 30 jours qui se terminaient 91 jours plus tôt, seulement si l'historique les couvre
  let delta3m: number | null = null;
  const refDate = daysBefore(today, 91);
  const jan7 = `${today.slice(0, 4)}-01-07`;
  if (refDate && refDate >= jan7) {
    const ref = rollingAverageAt(rows, extraordinaryTags, refDate, tagId);
    if (ref != null && ref > 0) delta3m = ((perDay30 - ref) / ref) * 100;
  }

  return {
    perDay30,
    perDayYear: yearAvg,
    perMonth: perDay30 * 30,
    deltaYear,
    status: deltaYear == null ? null : statusOf(deltaYear),
    delta3m,
    since: total.startDate,
  };
}

export interface MonthAverage {
  /** AAAA-MM */
  month: string;
  /** 0 = janvier … 11 = décembre */
  monthIndex: number;
  /** Dépense moyenne par jour : total du mois / jours écoulés (le mois en cours est donc partiel mais comparable). */
  perDay: number;
  days: number;
  current: boolean;
}

/**
 * Dépense moyenne par jour, mois par mois, sur les `count` derniers mois (le mois en cours compris), hors
 * extraordinaires et limitée à une étiquette si `tagId`. `since` = première date réellement chargée : les mois qui
 * commencent avant le mois de cette date sont ignorés (ils seraient sous-estimés).
 */
export function monthlyAverages(
  rows: readonly LifestyleRow[],
  extraordinaryTags: ReadonlySet<string>,
  today: string,
  options: { tagId?: TagFocus; count?: number; since?: string } = {}
): MonthAverage[] {
  const t = dayNumber(today);
  if (t == null) return [];
  const count = options.count ?? 6;
  const y = Number(today.slice(0, 4));
  const m0 = Number(today.slice(5, 7)) - 1;
  const sinceMonthStart = options.since ? dayNumber(`${options.since.slice(0, 7)}-01`) : null;

  const daily = new Map<number, number>();
  for (const r of rows) {
    const d = dayNumber(r.date);
    const amount = Number(r.amount);
    if (d == null || d > t || !Number.isFinite(amount)) continue;
    if (isExtraordinary(r.tags, extraordinaryTags)) continue;
    if (!matchesFocus(r.tags, options.tagId)) continue;
    daily.set(d, (daily.get(d) ?? 0) + amount);
  }

  const out: MonthAverage[] = [];
  for (let k = count - 1; k >= 0; k--) {
    const monthIdx = y * 12 + m0 - k;
    const my = Math.floor(monthIdx / 12);
    const mm = monthIdx % 12;
    const first = dayNumber(`${my}-${String(mm + 1).padStart(2, "0")}-01`)!;
    if (sinceMonthStart != null && first < sinceMonthStart) continue;
    const lastOfMonth = dayNumber(`${my}-${String(mm + 1).padStart(2, "0")}-${String(new Date(my, mm + 1, 0).getDate()).padStart(2, "0")}`)!;
    const current = k === 0;
    const end = current ? t : lastOfMonth;
    const days = end - first + 1;
    let sum = 0;
    for (let d = first; d <= end; d++) sum += daily.get(d) ?? 0;
    out.push({ month: `${my}-${String(mm + 1).padStart(2, "0")}`, monthIndex: mm, perDay: sum / days, days, current });
  }
  return out;
}
