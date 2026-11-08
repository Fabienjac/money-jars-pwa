// État de l'écran Analyses mémorisé le temps d'une session (sessionStorage) : l'onglet ouvert et les filtres de « Par
// tag ». Quand on quitte l'écran (par exemple vers l'Historique) puis qu'on y revient, on retrouve ce qu'on avait.
// Module pur, stockage passé en paramètre : testé dans tests/analyticsState.test.mjs.
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsFilters } from "./analyticsFilters";
import type { PeriodFilter } from "./historyPeriod";

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const FILTERS_KEY = "mjars:analyticsFilters";
const TAB_KEY = "mjars:analyticsTab";

export type AnalyticsTab = "report" | "tags" | "subs";
const TABS: AnalyticsTab[] = ["report", "tags", "subs"];
const PERIODS: PeriodFilter[] = ["all", "month", "prevmonth", "30d", "90d", "6m", "year", "custom"];
const JARS = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUM = /^\d+([.,]\d+)?$/;

/** Reconstruit des filtres valides à partir d'une valeur du stockage (non fiable) ; champ invalide = valeur par défaut. */
export function sanitizeFilters(raw: unknown): AnalyticsFilters {
  const d = DEFAULT_ANALYTICS_FILTERS;
  if (!raw || typeof raw !== "object") return { ...d, jars: [], tags: [] };
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, ok: (s: string) => boolean, fallback: string) => (typeof v === "string" && ok(v) ? v : fallback);
  const list = (v: unknown, ok: (s: string) => boolean, max: number) =>
    Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && ok(x)))).slice(0, max) : [];
  return {
    period: PERIODS.includes(r.period as PeriodFilter) ? (r.period as PeriodFilter) : d.period,
    from: str(r.from, (s) => DATE.test(s), ""),
    to: str(r.to, (s) => DATE.test(s), ""),
    minAmount: str(r.minAmount, (s) => s === "" || NUM.test(s.trim()), ""),
    maxAmount: str(r.maxAmount, (s) => s === "" || NUM.test(s.trim()), ""),
    jars: list(r.jars, (s) => JARS.includes(s), JARS.length),
    tags: list(r.tags, (s) => s.length > 0 && s.length <= 64, 40),
  };
}

export function loadFilters(storage: StorageLike): AnalyticsFilters {
  try {
    const raw = storage.getItem(FILTERS_KEY);
    return sanitizeFilters(raw == null ? null : JSON.parse(raw));
  } catch {
    return sanitizeFilters(null);
  }
}

export function saveFilters(f: AnalyticsFilters, storage: StorageLike): void {
  try { storage.setItem(FILTERS_KEY, JSON.stringify(f)); } catch { /* stockage indisponible : l'état ne sera pas conservé */ }
}

export function loadTab(storage: StorageLike): AnalyticsTab {
  try {
    const v = storage.getItem(TAB_KEY);
    return TABS.includes(v as AnalyticsTab) ? (v as AnalyticsTab) : "report";
  } catch {
    return "report";
  }
}

export function saveTab(tab: AnalyticsTab, storage: StorageLike): void {
  try { storage.setItem(TAB_KEY, tab); } catch { /* sans importance */ }
}
