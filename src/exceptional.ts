// Propositions de dépenses « Exceptionnelles » : repère les grosses dépenses de l'année qui pèsent sur la moyenne par
// jour du « train de vie » sans être étiquetées, pour que l'utilisateur les marque en un geste.
// Module pur, testé dans tests/exceptional.test.ts ; l'écriture est faite par api.ts.
import { normalizeLabel } from "./subscriptions";
import { isExtraordinary, splitTags } from "./lifestyle";

export interface ExpenseLike {
  id: number | string;
  /** AAAA-MM-JJ */
  date: string;
  amount: number;
  description?: string | null;
  tags?: string | null;
  subscription?: string | null;
}

export interface ExceptionalSuggestion {
  id: string;
  date: string;
  amount: number;
  description: string;
  /** Combien de fois une dépense habituelle (médiane) : « 14× ». */
  times: number;
}

/** Nombre minimal de dépenses courantes avant de proposer quoi que ce soit : en dessous, la médiane ne veut rien dire. */
export const MIN_ROWS = 15;
/** Nombre minimal de jours couverts. */
export const MIN_DAYS = 14;
/** Une dépense est « grosse » à partir de ce multiple de la dépense médiane… */
export const BIG_FACTOR = 10;
/** …et de ce multiple de la dépense moyenne par jour. */
export const DAILY_FACTOR = 3;
export const MAX_SUGGESTIONS = 3;
/** Un même libellé vu sur ce nombre de mois différents est une dépense régulière (loyer, assurance…), pas exceptionnelle. */
export const RECURRING_MONTHS = 3;

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS) : null;
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function suggestExceptional(input: {
  rows: readonly ExpenseLike[];
  extraordinaryTags: ReadonlySet<string>;
  /** Identifiants déjà écartés par l'utilisateur (« non, c'est normal »). */
  dismissed: ReadonlySet<string>;
  /** AAAA-MM-JJ */
  today: string;
}): ExceptionalSuggestion[] {
  const t = dayNumber(input.today);
  if (t == null) return [];
  const jan1 = dayNumber(`${input.today.slice(0, 4)}-01-01`)!;

  const inYear = input.rows
    .map((r) => ({ r, d: dayNumber(r.date), amount: Number(r.amount) }))
    .filter((x): x is { r: ExpenseLike; d: number; amount: number } => x.d != null && x.d >= jan1 && x.d <= t && Number.isFinite(x.amount) && x.amount > 0);

  const regular = inYear.filter((x) => !isExtraordinary(x.r.tags, input.extraordinaryTags));
  if (regular.length < MIN_ROWS) return [];

  const first = Math.min(...regular.map((x) => x.d));
  const days = t - first + 1;
  if (days < MIN_DAYS) return [];

  const med = median(regular.map((x) => x.amount));
  const perDay = regular.reduce((s, x) => s + x.amount, 0) / days;
  const threshold = Math.max(BIG_FACTOR * med, DAILY_FACTOR * perDay);

  // Libellés réguliers : vus sur plusieurs mois de l'année
  const monthsByLabel = new Map<string, Set<string>>();
  for (const x of inYear) {
    const key = normalizeLabel(x.r.description ?? "");
    if (key.length < 3) continue;
    const set = monthsByLabel.get(key) ?? new Set<string>();
    set.add(x.r.date.slice(0, 7));
    monthsByLabel.set(key, set);
  }

  return regular
    .filter((x) => x.amount >= threshold)
    .filter((x) => !(x.r.subscription ?? "").trim())
    .filter((x) => !input.dismissed.has(String(x.r.id)))
    .filter((x) => (monthsByLabel.get(normalizeLabel(x.r.description ?? ""))?.size ?? 0) < RECURRING_MONTHS)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, MAX_SUGGESTIONS)
    .map((x) => ({
      id: String(x.r.id),
      date: x.r.date.slice(0, 10),
      amount: x.amount,
      description: (x.r.description ?? "").trim(),
      times: med > 0 ? Math.round(x.amount / med) : 0,
    }));
}

/** Ajoute une étiquette à une liste d'étiquettes « a,b,c » sans doublon. */
export function addTagTo(tags: string | null | undefined, id: string): string {
  const list = splitTags(tags);
  if (!list.includes(id)) list.push(id);
  return list.join(",");
}
