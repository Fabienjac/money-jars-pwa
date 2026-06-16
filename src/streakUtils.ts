// src/streakUtils.ts
// Suivi de la régularité de saisie — streak de jours consécutifs avec au moins 1 transaction

const KEY_LAST_DATE = "mjars:streakLastDate";
const KEY_COUNT     = "mjars:streakCount";

/** Enregistre une saisie du jour et recalcule le streak. Retourne le nouveau compteur. */
export function updateStreak(): number {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const lastDate  = localStorage.getItem(KEY_LAST_DATE);
  const count     = parseInt(localStorage.getItem(KEY_COUNT) || "0", 10);

  if (!lastDate || count === 0) return { count: 0, isAlive: false };

  const isAlive = lastDate === today || lastDate === yesterday;
  return { count, isAlive };
}
