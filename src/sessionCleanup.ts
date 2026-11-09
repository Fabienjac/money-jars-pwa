// Nettoyage des copies locales (localStorage) des données d'un compte, à la déconnexion.
// Les totaux, analyses, étiquettes, budgets, règles… sont gardés en local pour aller vite, SANS identifiant de compte :
// sans ce nettoyage, la personne qui se connecte ensuite sur le même appareil verrait un moment les chiffres de la
// précédente (jusqu'à 30 minutes pour les totaux). Le cloud reste la source de vérité : tout est relu à la connexion.
// Module pur (stockage injecté) : testé dans tests/sessionCleanup.test.mjs.

/** Réglages d'affichage ou d'origine, sans lien avec les données d'un compte : conservés. */
const KEEP = new Set(["mjars:lang", "mjars:ref", "mjars:preferredCurrencies", "mjars:currencyFavorites"]);

interface KeyStorage {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/** Retire toutes les clés « mjars:* » sauf les réglages conservés. Renvoie le nombre de clés retirées. */
export function clearAccountLocalData(storage: KeyStorage): number {
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith("mjars:") && !KEEP.has(k)) doomed.push(k);
  }
  doomed.forEach((k) => storage.removeItem(k));
  return doomed.length;
}

/** Version navigateur : ne lève jamais (stockage indisponible = rien à nettoyer). */
export function clearAccountLocalDataSafe(): void {
  try {
    clearAccountLocalData(window.localStorage);
    clearAccountLocalData(window.sessionStorage);
  } catch { /* sans importance */ }
}
