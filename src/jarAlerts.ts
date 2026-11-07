// Alertes des jarres : une jarre est « presque épuisée » dès 80 % de son solde dépensé, « dépassée » quand son
// solde passe sous zéro. Le calcul reprend exactement les totaux affichés sur les cartes de l'accueil
// (revenus alloués + solde initial, dépenses cumulées). Module pur, sans React ni réseau.
import type { JarKey } from "./types";

export const JAR_KEY_LIST: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
export const JAR_ALERT_EMOJIS: Record<JarKey, string> = {
  NEC: "🏺", FFA: "🌱", LTSS: "🏦", PLAY: "🎮", EDUC: "📚", GIFT: "🎁",
};

/** Part du solde dépensée à partir de laquelle on prévient. */
export const WARN_RATIO = 0.8;

/** 0 = rien à signaler, 1 = presque épuisée (ou épuisée), 2 = dépassée. */
export type AlertLevel = 0 | 1 | 2;

export interface JarAlert {
  jar: JarKey;
  level: 1 | 2;
  /** % du solde alloué déjà dépensé (peut dépasser 100). */
  percent: number;
  /** Solde restant (négatif si dépassée). */
  net: number;
}

interface JarTotalsLike { revenues: number; spendings: number }

export function jarAlertLevel(j: JarTotalsLike | undefined): { level: AlertLevel; percent: number; net: number } {
  const revenues = Number(j?.revenues) || 0;
  const spent = Number(j?.spendings) || 0;
  const net = revenues - spent;
  if (net < -0.005) return { level: 2, percent: revenues > 0 ? (spent / revenues) * 100 : 100, net };
  if (revenues > 0 && spent / revenues >= WARN_RATIO) return { level: 1, percent: (spent / revenues) * 100, net };
  return { level: 0, percent: revenues > 0 ? (spent / revenues) * 100 : 0, net };
}

/** Alertes en cours, les plus graves d'abord (dépassées avant épuisées, puis par % décroissant). */
export function computeJarAlerts(jars: Partial<Record<JarKey, JarTotalsLike>> | null | undefined): JarAlert[] {
  if (!jars) return [];
  const out: JarAlert[] = [];
  for (const jar of JAR_KEY_LIST) {
    const r = jarAlertLevel(jars[jar]);
    if (r.level > 0) out.push({ jar, level: r.level as 1 | 2, percent: r.percent, net: r.net });
  }
  return out.sort((a, b) => b.level - a.level || b.percent - a.percent);
}

// ── Mémoire des alertes déjà vues (point rouge) ─────────────────────────────

export type SeenLevels = Partial<Record<JarKey, AlertLevel>>;

/** Vrai s'il existe une alerte plus grave que celle que l'utilisateur a déjà consultée. */
export function hasUnseenAlerts(alerts: JarAlert[], seen: SeenLevels): boolean {
  return alerts.some((a) => a.level > (seen[a.jar] ?? 0));
}

/** Niveaux à enregistrer quand l'utilisateur consulte les alertes : l'état actuel. */
export function markAllSeen(alerts: JarAlert[]): SeenLevels {
  const seen: SeenLevels = {};
  for (const a of alerts) seen[a.jar] = a.level;
  return seen;
}

/** Si une jarre redescend (nouveau revenu…), on oublie son niveau « vu » : un nouveau franchissement re-signale. */
export function reconcileSeen(alerts: JarAlert[], seen: SeenLevels): SeenLevels {
  const next: SeenLevels = {};
  for (const jar of JAR_KEY_LIST) {
    const cur = alerts.find((a) => a.jar === jar)?.level ?? 0;
    const was = seen[jar] ?? 0;
    const lvl = Math.min(cur, was) as AlertLevel;
    if (lvl > 0) next[jar] = lvl;
  }
  return next;
}
