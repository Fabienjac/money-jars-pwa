// Périodes de l'écran Historique. Module pur, testé dans tests/historyPeriod.test.ts.

export type PeriodFilter = "all" | "month" | "prevmonth" | "90d" | "year" | "custom";

export interface PeriodBounds {
  start: Date;
  end: Date;
}

const NEVER = new Date(8640000000000000);

/**
 * Bornes (incluses) d'un filtre de période, ou null pour « tout ».
 * `customFrom` / `customTo` : dates AAAA-MM-JJ de la période personnalisée ; une seule borne = période ouverte de
 * l'autre côté ; aucune des deux = pas de filtre.
 */
export function periodBounds(filter: PeriodFilter, now: Date, customFrom = "", customTo = ""): PeriodBounds | null {
  switch (filter) {
    case "all":
      return null;
    case "custom": {
      if (!customFrom && !customTo) return null;
      const start = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(0);
      const end = customTo ? new Date(`${customTo}T23:59:59`) : NEVER;
      return { start, end };
    }
    case "month":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    case "prevmonth":
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
      };
    case "90d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 90);
      return { start, end: now };
    }
    case "year": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 12);
      return { start, end: now };
    }
  }
}

/** Une date est-elle dans les bornes ? Sans bornes, toujours vrai ; date invalide, jamais. */
export function inBounds(date: Date | null, bounds: PeriodBounds | null): boolean {
  if (!bounds) return true;
  if (!date) return false;
  return date >= bounds.start && date <= bounds.end;
}
