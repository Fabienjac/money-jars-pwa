// Filtres de l'écran Analyses > Par tag. Module pur (testé dans tests/analyticsFilters.test.mjs).
import { inBounds, parseAppDate, periodBounds, type PeriodFilter } from "./historyPeriod";
import { dayKey, parseMinAmount } from "./historyFilters";
import type { HistoryPreset } from "./historyPreset";

export interface AnalyticsFilters {
  period: PeriodFilter;
  /** Dates AAAA-MM-JJ de la période personnalisée. */
  from: string;
  to: string;
  minAmount: string;
  maxAmount: string;
  jars: string[];
  /** La dépense doit porter AU MOINS UNE de ces étiquettes (vide = toutes). */
  tags: string[];
}

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilters = {
  period: "all", from: "", to: "", minAmount: "", maxAmount: "", jars: [], tags: [],
};

export const tagIdsOf = (tags: string | null | undefined): string[] =>
  String(tags ?? "").split(",").map((x) => x.trim()).filter(Boolean);

interface SpendingLike { date: string; amount: number; jar: string; tags?: string }

/**
 * Filtre les dépenses. `excludeTags` : étiquettes écartées (« hors exceptionnelles ») ; une dépense qui en porte une
 * disparaît, même si elle porte aussi une étiquette sélectionnée.
 */
export function filterSpendingRows<T extends SpendingLite>(
  rows: T[], f: AnalyticsFilters, now: Date, excludeTags: string[] = []
): T[] {
  const bounds = periodBounds(f.period, now, f.from, f.to);
  const min = parseMinAmount(f.minAmount);
  const max = parseMinAmount(f.maxAmount);
  const exclude = new Set(excludeTags);
  return rows.filter((r) => {
    if (!inBounds(parseAppDate(r.date), bounds)) return false;
    const a = Math.abs(r.amount || 0);
    if (min != null && a < min) return false;
    if (max != null && a > max) return false;
    if (f.jars.length > 0 && !f.jars.includes(r.jar)) return false;
    const ids = tagIdsOf(r.tags);
    if (f.tags.length > 0 && !f.tags.some((t) => ids.includes(t))) return false;
    if (exclude.size > 0 && ids.some((t) => exclude.has(t))) return false;
    return true;
  });
}
type SpendingLite = SpendingLike;

/** Filtre de période seul (pour les revenus). */
export function filterByPeriod<T extends { date: string }>(rows: T[], f: AnalyticsFilters, now: Date): T[] {
  const bounds = periodBounds(f.period, now, f.from, f.to);
  return rows.filter((r) => inBounds(parseAppDate(r.date), bounds));
}

/** Nombre de filtres actifs (pastille du bouton « Filtres »). `hideOneOff` : l'interrupteur « hors exceptionnelles ». */
export function countActiveFilters(f: AnalyticsFilters, hideOneOff = false): number {
  let n = 0;
  if (f.period !== "all" && !(f.period === "custom" && !f.from && !f.to)) n++;
  if (parseMinAmount(f.minAmount) != null) n++;
  if (parseMinAmount(f.maxAmount) != null) n++;
  if (f.jars.length > 0) n++;
  if (f.tags.length > 0) n++;
  if (hideOneOff) n++;
  return n;
}

const DAY = 86400000;
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Nombre de jours de la période, pour les moyennes par jour. Période bornée : du premier jour jusqu'à aujourd'hui au
 * plus ; sinon : de la première à la dernière dépense.
 */
export function periodDays(f: AnalyticsFilters, rows: Array<{ date: string }>, now: Date): number {
  const bounds = periodBounds(f.period, now, f.from, f.to);
  const open = !bounds || bounds.start.getTime() <= 0 || bounds.end.getTime() > 8.6e15 - 1;
  if (!open && bounds) {
    const end = bounds.end.getTime() > now.getTime() ? now : bounds.end;
    return Math.max(1, Math.round((midnight(end) - midnight(bounds.start)) / DAY) + 1);
  }
  const times = rows.map((r) => parseAppDate(r.date)?.getTime()).filter((t): t is number => t != null);
  if (times.length === 0) return 30;
  return Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / DAY) + 1);
}

/**
 * Filtres → préréglage de l'Historique (qui n'a pas les mêmes périodes préfaites : on lui passe des dates).
 * Étiquette et jarre ne sont transmises que s'il n'y en a qu'une de sélectionnée (l'Historique n'en prend qu'une).
 */
export function toHistoryPreset(f: AnalyticsFilters, now: Date, tagOverride?: string): HistoryPreset {
  const p: HistoryPreset = {};
  const bounds = periodBounds(f.period, now, f.from, f.to);
  if (bounds) {
    if (f.period === "custom") {
      if (f.from) p.from = f.from;
      if (f.to) p.to = f.to;
    } else {
      p.from = dayKey(bounds.start);
      p.to = dayKey(bounds.end.getTime() > now.getTime() ? now : bounds.end);
    }
  }
  const tag = tagOverride ?? (f.tags.length === 1 ? f.tags[0] : undefined);
  if (tag) p.tag = tag;
  if (f.jars.length === 1) p.jar = f.jars[0];
  const min = parseMinAmount(f.minAmount);
  if (min != null) p.minAmount = String(min);
  return p;
}
