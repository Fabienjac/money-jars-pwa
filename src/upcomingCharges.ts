// Prochains prélèvements : à partir des abonnements détectés, quand tombe le suivant et pour combien.
// Module pur, testé dans tests/upcomingCharges.test.mjs.
import { FREQ_DIVISOR, type RecurringItem, type SubscriptionFreq } from "./subscriptions";
import { parseAppDate } from "./historyPeriod";

export interface UpcomingCharge {
  key: string;
  description: string;
  account: string;
  /** Date estimée du prochain prélèvement. */
  date: Date;
  /** Jours entre aujourd'hui et la date estimée (0 = aujourd'hui). */
  inDays: number;
  amount: number;
  /** Montant variable : c'est une moyenne, pas le dernier montant. */
  approximate: boolean;
  freq: SubscriptionFreq;
}

const DAY = 86400000;
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** `base` décalée de `months` mois, au jour `day` (ramené à la fin du mois si le mois est plus court : 31 janv. → 28 févr.). */
function addMonthsClamped(base: Date, months: number, day: number): Date {
  const y = base.getFullYear();
  const m = base.getMonth() + months;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, lastDay));
}

/**
 * Première échéance qui tombe aujourd'hui ou plus tard. Chaque échéance est calculée depuis le dernier prélèvement
 * (jamais en chaîne) : le jour d'origine ne dérive pas après un mois court.
 */
export function nextOccurrence(last: Date, periodMonths: number, today: Date): Date {
  const t0 = midnight(today).getTime();
  const anchorDay = last.getDate();
  for (let n = 1; n <= 240; n++) {
    const candidate = addMonthsClamped(midnight(last), n * periodMonths, anchorDay);
    if (candidate.getTime() >= t0) return candidate;
  }
  return addMonthsClamped(midnight(last), 240 * periodMonths, anchorDay);
}

/** Prélèvements attendus dans les `horizonDays` jours, du plus proche au plus lointain. */
export function upcomingCharges(items: RecurringItem[], today: Date, horizonDays = 30): UpcomingCharge[] {
  const t0 = midnight(today).getTime();
  const out: UpcomingCharge[] = [];
  for (const it of items) {
    const last = parseAppDate(it.lastDate);
    if (!last) continue;
    const freq: SubscriptionFreq = it.freq ?? "mensuel";
    const date = nextOccurrence(last, FREQ_DIVISOR[freq], today);
    const inDays = Math.round((date.getTime() - t0) / DAY);
    if (inDays > horizonDays) continue;
    const amount = it.isFixed ? Math.abs(it.lastAmount || it.avgAmount) : Math.abs(it.avgAmount);
    out.push({ key: it.key, description: it.description, account: it.account, date, inDays, amount, approximate: !it.isFixed, freq });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime() || b.amount - a.amount);
}

export function totalUpcoming(charges: UpcomingCharge[]): number {
  return charges.reduce((s, c) => s + c.amount, 0);
}
