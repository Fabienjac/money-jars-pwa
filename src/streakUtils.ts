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
