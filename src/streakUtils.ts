// src/streakUtils.ts
// Suivi de la régularité de saisie — streak de jours consécutifs avec au moins 1 transaction

const KEY_LAST_DATE = "mjars:streakLastDate";
const KEY_COUNT     = "mjars:streakCount";

/** Enregistre une saisie du jour et recalcule le streak. Retourne le nouveau compteur. */
export function updateStreak(): number {
  const _d = new Date();
  const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`; // YYYY-MM-DD local
  const lastDate = localStorage.getItem(KEY_LAST_DATE);
  let count = parseInt(localStorage.getItem(KEY_COUNT) || "0", 10);

  // Déjà enregistré aujourd'hui → rien à changer
  if (lastDate === today) return count;

  if (lastDate) {
    const diffMs  = new Date(today).getTime() - new Date(lastDate).getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    count = diffDays === 1 ? count + 1 : 1; // consécutif → +1, sinon reset à 1
  } else {
    count = 1; // première saisie ever
  }

  localStorage.setItem(KEY_LAST_DATE, today);
  localStorage.setItem(KEY_COUNT, String(count));
  return count;
}

export interface StreakState {
  count: number;
  /** true si la dernière saisie date d'aujourd'hui ou d'hier (streak non brisé) */
  isAlive: boolean;
}

/** Lit le streak actuel sans le modifier. */
export function getStreak(): StreakState {
  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  const _yst = new Date(_now); _yst.setDate(_yst.getDate() - 1);
  const yesterday = `${_yst.getFullYear()}-${String(_yst.getMonth() + 1).padStart(2, "0")}-${String(_yst.getDate()).padStart(2, "0")}`;
  const lastDate  = localStorage.getItem(KEY_LAST_DATE);
  const count     = parseInt(localStorage.getItem(KEY_COUNT) || "0", 10);

  if (!lastDate || count === 0) return { count: 0, isAlive: false };

  const isAlive = lastDate === today || lastDate === yesterday;
  return { count, isAlive };
}

// ── Calcul à partir des données (multi-appareils) ────────────────────────────
// Le compteur local ci-dessus ne voit que cet appareil et disparaît si le stockage est vidé. Ici le streak est
// recalculé depuis les dates de saisie (created_at) des dépenses stockées dans le cloud : même résultat sur le
// Mac et sur l'iPhone, et un import en masse ne compte que pour une journée.

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function previousDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - 1, 12)); // midi : à l'abri des changements d'heure
}

/**
 * @param entryTimestamps horodatages (ISO) de saisie des dépenses
 * @param now             instant courant (injectable pour les tests)
 */
export function computeStreak(entryTimestamps: string[], now: Date = new Date()): StreakState {
  const days = new Set<string>();
  for (const ts of entryTimestamps) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) days.add(dayKey(d));
  }
  if (days.size === 0) return { count: 0, isAlive: false };

  const latest = [...days].sort().pop() as string;
  const today = dayKey(now);
  if (latest > today) return { count: 0, isAlive: false }; // horloge incohérente : on ne devine pas

  let count = 0;
  for (let k = latest; days.has(k); k = previousDay(k)) count++;
  return { count, isAlive: latest === today || latest === previousDay(today) };
}
