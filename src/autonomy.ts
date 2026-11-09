// Autonomie : combien de mois la trésorerie tient au rythme de dépenses actuel. Module pur : testé dans tests/autonomy.test.mjs.
//
// Trésorerie = solde des jarres (les soldes par compte ne sont pas fiables : les virements entre comptes ne sont pas saisis).
//  - niveau 1, « disponible » : NEC + EDUC + GIFT + PLAY ;
//  - niveau 2, « total » : les six jarres.
// Les déficits effacés par « Repartir de zéro » (settled) sont retirés : ils ajoutent de l'argent fictif au solde d'une jarre.
// Deux rythmes de dépense : « courant » (30 derniers jours, hors exceptionnelles) et « avec exceptionnelles »
// (moyenne mensuelle des 12 derniers mois, tout compris).
import { parseAppDate } from "./historyPeriod";
import { splitOneOff } from "./monthProjection";

export const LIQUID_JARS = ["NEC", "EDUC", "GIFT", "PLAY"] as const;
export const ALL_JARS = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"] as const;

export interface JarBalanceLite {
  /** Revenus attribués à la jarre (inclut les déficits effacés) − dépenses = net. */
  net: number;
  /** Déficits effacés ajoutés au solde (« Repartir de zéro »). */
  settled?: number;
}

export interface Treasury {
  /** Niveau 1 : NEC + EDUC + GIFT + PLAY. */
  liquid: number;
  /** Niveau 2 : les six jarres. */
  total: number;
  /** Jarres du niveau 1 en négatif (hors déficits effacés), en valeur positive. */
  liquidDeficit: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function treasuryLevels(jars: Record<string, JarBalanceLite | undefined>): Treasury {
  const bal = (k: string) => {
    const j = jars[k];
    return j ? (j.net || 0) - (j.settled || 0) : 0;
  };
  const liquid = LIQUID_JARS.reduce((s, k) => s + bal(k), 0);
  const total = ALL_JARS.reduce((s, k) => s + bal(k), 0);
  const liquidDeficit = LIQUID_JARS.reduce((s, k) => s + Math.max(0, -bal(k)), 0);
  return { liquid: round2(liquid), total: round2(total), liquidDeficit: round2(liquidDeficit) };
}

export interface BurnRates {
  /** Dépense mensuelle courante : 30 derniers jours, hors exceptionnelles. */
  regular: number;
  /** Dépense mensuelle moyenne, exceptionnelles comprises, sur 12 mois (moins si l'historique est plus court). */
  withOneOff: number;
  /** Nombre de mois effectivement couverts par `withOneOff` (≤ 12). */
  monthsCovered: number;
  /** Historique trop court (moins de 30 jours) pour que le rythme courant soit fiable. */
  shortHistory: boolean;
}

const DAY = 86400000;

export function burnRates(
  rows: Array<{ date: string; amount: number; tags?: string | null }>,
  oneOffTagIds: string[],
  today: Date
): BurnRates {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const from30 = t0 - 29 * DAY;
  const from12m = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 1).getTime();

  const last30: typeof rows = [];
  const last12m: typeof rows = [];
  let earliest = Infinity;
  for (const r of rows) {
    const d = parseAppDate(r.date);
    if (!d) continue;
    const ts = d.getTime();
    if (ts > t0 + DAY - 1) continue; // dépense datée du futur : ignorée
    if (ts >= from12m) {
      last12m.push(r);
      if (ts < earliest) earliest = ts;
    }
    if (ts >= from30) last30.push(r);
  }

  // Mois couverts : de la première dépense de la fenêtre à aujourd'hui, plafonné à 12, plancher 1.
  const spanDays = earliest === Infinity ? 0 : (t0 - earliest) / DAY + 1;
  const monthsCovered = Math.max(1, Math.min(12, spanDays / 30.4375));
  const all12 = last12m.reduce((s, r) => s + (r.amount || 0), 0);

  const split30 = splitOneOff(last30, oneOffTagIds);
  return {
    regular: round2(split30.regular),
    withOneOff: round2(all12 / monthsCovered),
    monthsCovered: round2(monthsCovered),
    shortHistory: spanDays < 30,
  };
}

/** Mois de trésorerie restants ; null si rien n'est dépensé (division impossible) ; 0 si la trésorerie est vide ou négative. */
export function monthsOfRunway(treasury: number, monthlyBurn: number): number | null {
  if (!(monthlyBurn > 0)) return null;
  if (!(treasury > 0)) return 0;
  return treasury / monthlyBurn;
}

export interface AutonomyResult {
  treasury: Treasury;
  burn: BurnRates;
  /** Les quatre combinaisons niveau × rythme (mois, null = pas de dépense). */
  liquidRegular: number | null;
  liquidWithOneOff: number | null;
  totalRegular: number | null;
  totalWithOneOff: number | null;
}

export function computeAutonomy(
  jars: Record<string, JarBalanceLite | undefined>,
  rows: Array<{ date: string; amount: number; tags?: string | null }>,
  oneOffTagIds: string[],
  today: Date
): AutonomyResult {
  const treasury = treasuryLevels(jars);
  const burn = burnRates(rows, oneOffTagIds, today);
  return {
    treasury,
    burn,
    liquidRegular: monthsOfRunway(treasury.liquid, burn.regular),
    liquidWithOneOff: monthsOfRunway(treasury.liquid, burn.withOneOff),
    totalRegular: monthsOfRunway(treasury.total, burn.regular),
    totalWithOneOff: monthsOfRunway(treasury.total, burn.withOneOff),
  };
}
