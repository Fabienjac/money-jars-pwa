// Liste « Pour démarrer » : les 7 étapes, cochées toutes seules d'après les données de la personne.
// Module pur (aucun accès au stockage ni au réseau) : testé dans tests/startChecklist.test.mjs.

export type StepId = "jars" | "accounts" | "revenue" | "spending" | "voice" | "rule" | "install";

/** Ordre d'affichage. */
export const STEP_ORDER: StepId[] = ["jars", "accounts", "revenue", "spending", "voice", "rule", "install"];

/** Ce qu'on sait de la personne. `null` : lecture impossible (réseau…), l'étape reste « à faire ». */
export interface StartFacts {
  accounts: number | null;
  revenues: number | null;
  spendings: number | null;
  manualRules: number | null;
  voiceUsed: boolean;
  /** App déjà ajoutée à l'écran d'accueil (détectée) ou marquée « c'est fait » par la personne. */
  installed: boolean;
}

export interface StepState {
  id: StepId;
  done: boolean;
  /** Étape facultative à ce stade : plus utile après quelques dépenses (règles). */
  later?: boolean;
}

/** Nombre de dépenses à partir duquel une règle automatique devient vraiment utile. */
export const RULE_USEFUL_AFTER = 3;

/** Un compte est « récent » (la liste lui est proposée) pendant ce nombre de jours. */
export const RECENT_DAYS = 60;

const has = (n: number | null) => n != null && n > 0;

export function computeSteps(f: StartFacts): StepState[] {
  return STEP_ORDER.map((id): StepState => {
    switch (id) {
      case "jars": return { id, done: true }; // faite à l'arrivée dans l'app : l'écran de configuration précède tout
      case "accounts": return { id, done: has(f.accounts) };
      case "revenue": return { id, done: has(f.revenues) };
      case "spending": return { id, done: has(f.spendings) };
      case "voice": return { id, done: f.voiceUsed };
      case "rule": {
        const done = has(f.manualRules);
        return { id, done, later: !done && (f.spendings ?? 0) < RULE_USEFUL_AFTER };
      }
      case "install": return { id, done: f.installed };
    }
  });
}

export function progressOf(steps: StepState[]): { done: number; total: number; complete: boolean } {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, complete: done === steps.length };
}

/** La prochaine étape à mettre en avant : la première non faite, hors étapes « plus tard » tant qu'il en reste d'autres. */
export function nextStep(steps: StepState[]): StepId | null {
  const todo = steps.filter((s) => !s.done);
  return (todo.find((s) => !s.later) ?? todo[0])?.id ?? null;
}

/** Compte créé il y a moins de RECENT_DAYS jours (date illisible : non). */
export function isRecentAccount(createdAt: string | null | undefined, now: number): boolean {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(t)) return false;
  return now - t < RECENT_DAYS * 24 * 3600 * 1000;
}

/** Entrée « Pour démarrer » dans Plus : compte récent, liste ni terminée ni masquée. */
export function shouldShowEntry(o: { createdAt: string | null | undefined; now: number; dismissed: boolean; complete: boolean }): boolean {
  if (o.dismissed || o.complete) return false;
  return isRecentAccount(o.createdAt, o.now);
}

/**
 * Bouton « Faire le tour en 2 minutes » sur l'accueil : compte récent resté vide (aucune dépense, aucun revenu), liste
 * non masquée. Dès la première saisie il disparaît. Compteur inconnu (lecture impossible) : on ne montre rien.
 */
export function shouldShowHomeTour(o: {
  createdAt: string | null | undefined; now: number; dismissed: boolean; spendings: number | null; revenues: number | null;
}): boolean {
  if (o.dismissed || !isRecentAccount(o.createdAt, o.now)) return false;
  return o.spendings === 0 && o.revenues === 0;
}
