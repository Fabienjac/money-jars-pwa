// Détection des abonnements récurrents (accueil). Module pur, sans React ni réseau.
//
// Deux sources :
//  1. les dépenses marquées « abonnement » à la main (mensuel, trimestriel…), tant qu'elles restent actives ;
//  2. une détection automatique des prélèvements mensuels, volontairement prudente : un libellé n'est retenu que
//     s'il revient à raison d'une fois par mois sur des mois consécutifs, à date et montant stables. Les achats
//     courants (courses, boulangerie…) reviennent plusieurs fois par mois ou à des dates quelconques : ils sont écartés.
import type { SearchSpendingResult } from "./types";

export type SubscriptionFreq = "mensuel" | "trimestriel" | "semestriel" | "annuel";

export const FREQ_DIVISOR: Record<SubscriptionFreq, number> = {
  mensuel: 1, trimestriel: 3, semestriel: 6, annuel: 12,
};

/** Mois (après le dernier prélèvement) au-delà desquels un abonnement marqué à la main est considéré arrêté. */
const MANUAL_GRACE_MONTHS: Record<SubscriptionFreq, number> = {
  mensuel: 2, trimestriel: 4, semestriel: 8, annuel: 14,
};

/** Étiquettes des dépenses du quotidien : jamais détectées automatiquement comme abonnement. */
const EVERYDAY_TAGS = new Set(["alimentaire", "vie_quotidienne"]);

export interface RecurringItem {
  key: string;             // libellé normalisé : identifie l'abonnement (ex. pour le masquer)
  description: string;
  avgAmount: number;       // montant moyen brut
  monthlyAmount: number;   // équivalent mensuel (= avgAmount / diviseur)
  lastAmount: number;
  occurrences: number;
  uniqueMonths: number;
  isFixed: boolean;        // variation de montant < 5 %
  account: string;
  lastDate: string;
  freq?: SubscriptionFreq; // défini si marqué manuellement
}

// ── Dates (les lignes de l'app sont en JJ/MM/AAAA, parfois en AAAA-MM-JJ) ────

interface YMD { y: number; m: number; d: number }

function parseDate(dateStr: string | undefined): YMD | null {
  if (!dateStr) return null;
  const fr = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fr) return { y: +fr[3], m: +fr[2], d: +fr[1] };
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { y: +iso[1], m: +iso[2], d: +iso[3] };
  const dt = new Date(dateStr);
  if (!isNaN(dt.getTime())) return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  return null;
}

/** Numéro de mois absolu (année × 12 + mois) : permet de comparer et de compter les mois d'écart. */
const monthIndex = (p: YMD): number => p.y * 12 + (p.m - 1);

export function getMonthKeyFromDate(dateStr: string): string | null {
  const p = parseDate(dateStr);
  return p ? `${p.y}-${String(p.m).padStart(2, "0")}` : null;
}

// ── Libellés ─────────────────────────────────────────────────────────────────

const NOISE_WORDS = new Set([
  "prlv", "prelevement", "sepa", "cb", "carte", "paiement", "achat", "vir", "virement", "pos", "facture",
  "com", "fr", "net", "org", "www", "eu", "payment", "debit",
]);

/**
 * Clé de regroupement d'un libellé : sans casse, accents, chiffres, ponctuation ni mots de banque, pour que
 * « PRLV SEPA NETFLIX.COM 12345 » et « Netflix » désignent le même abonnement.
 */
export function normalizeLabel(s: string): string {
  const words = (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NOISE_WORDS.has(w));
  return words.join(" ");
}

const isUsableKey = (k: string) => k.length >= 3;

// ── Aides statistiques ───────────────────────────────────────────────────────

function amountsOf(txns: SearchSpendingResult[]): number[] {
  return txns.map((t) => Math.abs(t.amount || 0)).filter((a) => a > 0);
}

function stats(amounts: number[]): { avg: number; isFixed: boolean } {
  if (amounts.length === 0) return { avg: 0, isFixed: false };
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const spread = Math.max(...amounts) - Math.min(...amounts);
  return { avg, isFixed: avg > 0 ? spread / avg < 0.05 : false };
}

const byRecentFirst = (a: SearchSpendingResult, b: SearchSpendingResult) => {
  const pa = parseDate(a.date), pb = parseDate(b.date);
  const ka = pa ? pa.y * 10000 + pa.m * 100 + pa.d : 0;
  const kb = pb ? pb.y * 10000 + pb.m * 100 + pb.d : 0;
  return kb - ka;
};

/** Plus longue suite de mois consécutifs. */
function longestRun(monthIdx: number[]): number {
  const sorted = [...new Set(monthIdx)].sort((a, b) => a - b);
  let best = 0, run = 0, prev = Number.NaN;
  for (const m of sorted) {
    run = m === prev + 1 ? run + 1 : 1;
    prev = m;
    if (run > best) best = run;
  }
  return best;
}

// ── Détection ────────────────────────────────────────────────────────────────

/**
 * @param dismissed clés (libellés normalisés) que l'utilisateur a déclarées « pas un abonnement » : elles ne sont
 *                  jamais proposées par la détection automatique. Les abonnements marqués à la main restent toujours.
 */
export function detectRecurring(
  transactions: SearchSpendingResult[],
  now: Date = new Date(),
  dismissed: ReadonlySet<string> = new Set(),
): RecurringItem[] {
  const nowIdx = now.getFullYear() * 12 + now.getMonth();

  // ── 1. Abonnements marqués à la main ───────────────────────────────────────
  const manualMap = new Map<string, SearchSpendingResult[]>();
  for (const t of transactions) {
    const freq = (t.subscription || "").trim().toLowerCase();
    if (!freq || !(freq in FREQ_DIVISOR)) continue;
    const key = normalizeLabel(t.description || "");
    if (!isUsableKey(key)) continue;
    if (!manualMap.has(key)) manualMap.set(key, []);
    manualMap.get(key)!.push(t);
  }

  // Dernier prélèvement connu par libellé, qu'il soit marqué ou non : un abonnement marqué une seule fois reste
  // actif tant que les lignes suivantes du même libellé continuent d'arriver.
  const lastSeen = new Map<string, number>();
  for (const t of transactions) {
    const p = parseDate(t.date);
    const key = normalizeLabel(t.description || "");
    if (!p || !manualMap.has(key)) continue;
    lastSeen.set(key, Math.max(lastSeen.get(key) ?? 0, monthIndex(p)));
  }

  const manualItems: RecurringItem[] = [];
  const manualKeys = new Set<string>();

  manualMap.forEach((txns, key) => {
    const sorted = [...txns].sort(byRecentFirst);
    const last = sorted[0];
    const freq = (last.subscription || "mensuel").trim().toLowerCase() as SubscriptionFreq;
    manualKeys.add(key); // même arrêté, il ne doit pas réapparaître dans la détection automatique

    // Arrêté : plus de prélèvement depuis longtemps par rapport à sa fréquence
    const lastIdx = lastSeen.get(key);
    if (lastIdx !== undefined && nowIdx - lastIdx > MANUAL_GRACE_MONTHS[freq]) return;

    const amounts = amountsOf(txns);
    const { avg, isFixed } = stats(amounts);
    manualItems.push({
      key,
      description: last.description || "",
      avgAmount: avg,
      monthlyAmount: avg / FREQ_DIVISOR[freq],
      lastAmount: Math.abs(last.amount || avg),
      occurrences: txns.length,
      uniqueMonths: new Set(txns.map((t) => getMonthKeyFromDate(t.date)).filter(Boolean)).size,
      isFixed: amounts.length === 0 ? true : isFixed,
      account: last.account || "",
      lastDate: last.date || "",
      freq,
    });
  });

  // ── 2. Détection automatique : prélèvements mensuels des 6 derniers mois ───
  const sixMonthsAgoIdx = nowIdx - 5;
  const groups = new Map<string, SearchSpendingResult[]>();
  for (const t of transactions) {
    const p = parseDate(t.date);
    if (!p || monthIndex(p) < sixMonthsAgoIdx || monthIndex(p) > nowIdx) continue;
    const key = normalizeLabel(t.description || "");
    if (!isUsableKey(key) || manualKeys.has(key) || dismissed.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const autoItems: RecurringItem[] = [];

  groups.forEach((txns, key) => {
    // Dépenses du quotidien : exclues d'office
    const everyday = txns.filter((t) => (t.tags || "").split(",").some((x) => EVERYDAY_TAGS.has(x.trim()))).length;
    if (everyday * 2 >= txns.length) return;

    const parsed = txns.map((t) => parseDate(t.date)).filter((p): p is YMD => p !== null);
    const monthsIdx = parsed.map(monthIndex);
    const months = new Set(monthsIdx);
    if (months.size < 2) return;

    // Un abonnement se prélève une fois par mois : si le libellé revient souvent deux fois dans un même mois,
    // c'est un commerce fréquenté (supermarché, boulangerie, station-service…).
    const perMonth = new Map<number, number>();
    for (const m of monthsIdx) perMonth.set(m, (perMonth.get(m) ?? 0) + 1);
    const multi = [...perMonth.values()].filter((c) => c >= 2).length;
    if (multi / months.size > 0.25) return;

    // Toujours actif : prélevé ce mois-ci ou le mois dernier
    if (Math.max(...months) < nowIdx - 1) return;

    const run = longestRun(monthsIdx);
    if (run < 2) return;

    const { avg, isFixed } = stats(amountsOf(txns));
    if (avg <= 0) return;

    // Régularité de la date de prélèvement ; un montant variable exige en plus 3 mois de suite
    const days = parsed.map((p) => p.d);
    const daySpread = Math.max(...days) - Math.min(...days);
    if (isFixed ? daySpread > 10 : daySpread > 7 || run < 3) return;

    const last = [...txns].sort(byRecentFirst)[0];
    autoItems.push({
      key,
      description: last.description || "",
      avgAmount: avg,
      monthlyAmount: avg,
      lastAmount: Math.abs(last.amount || avg),
      occurrences: txns.length,
      uniqueMonths: months.size,
      isFixed,
      account: last.account || "",
      lastDate: last.date || "",
    });
  });

  // ── 3. Fusion : manuels en tête, puis auto ─────────────────────────────────
  const sortFn = (a: RecurringItem, b: RecurringItem) => {
    if (a.isFixed !== b.isFixed) return a.isFixed ? -1 : 1;
    return b.monthlyAmount - a.monthlyAmount;
  };
  return [...manualItems.sort(sortFn), ...autoItems.sort(sortFn)];
}
