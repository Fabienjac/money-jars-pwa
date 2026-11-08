// Transferts entre jarres : on déplace une partie du solde d'une jarre vers une autre (typiquement le non-dépensé des
// jarres de dépense vers l'épargne). Ce n'est ni un revenu ni une dépense : les analyses ne bougent pas, seuls les
// soldes des deux jarres changent. Module pur, sans React ni réseau (le serveur en a un port JS identique).
import type { JarKey } from "./types";

export const JAR_KEYS_ALL: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
/** Jarres faites pour être dépensées : leur reste non dépensé est celui qu'on propose de verser à l'épargne. */
export const SPENDING_JARS: JarKey[] = ["NEC", "EDUC", "PLAY", "GIFT"];
/** Jarres d'épargne : destination par défaut. */
export const SAVINGS_JARS: JarKey[] = ["FFA", "LTSS"];

export interface JarTransfer {
  id: string;
  fromJar: JarKey;
  toJar: JarKey;
  amount: number;
  /** Date du transfert, AAAA-MM-JJ. */
  date: string;
  note: string;
}

export function isJarKey(x: unknown): x is JarKey {
  return typeof x === "string" && (JAR_KEYS_ALL as string[]).includes(x);
}

const toCents = (n: number) => Math.round(n * 100);

/** Arrondi au centime (évite 0,1 + 0,2 = 0,30000000000000004 dans les soldes). */
export function round2(n: number): number {
  return toCents(n) / 100;
}

interface TransferRowLike { from_jar: string; to_jar: string; amount: number | string }

/** Variation de solde de chaque jarre due aux transferts : entrées moins sorties. */
export function transferDeltas(rows: TransferRowLike[] | null | undefined): Record<JarKey, number> {
  const cents: Record<JarKey, number> = { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 };
  for (const r of rows ?? []) {
    const amount = toCents(Number(r.amount));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (!isJarKey(r.from_jar) || !isJarKey(r.to_jar) || r.from_jar === r.to_jar) continue;
    cents[r.from_jar] -= amount;
    cents[r.to_jar] += amount;
  }
  const out = {} as Record<JarKey, number>;
  for (const k of JAR_KEYS_ALL) out[k] = cents[k] / 100;
  return out;
}

/** Montant maximal transférable depuis une jarre : son solde positif, arrondi au centime inférieur. */
export function availableToTransfer(net: number): number {
  if (!Number.isFinite(net) || net <= 0) return 0;
  return Math.floor(net * 100 + 1e-6) / 100;
}

export type TransferError = "sameJar" | "amount" | "insufficient";

/** Contrôle d'un transfert avant enregistrement ; null = valide. */
export function checkTransfer(input: { from: JarKey; to: JarKey; amount: number; fromNet: number }): TransferError | null {
  if (input.from === input.to) return "sameJar";
  if (!Number.isFinite(input.amount) || toCents(input.amount) <= 0) return "amount";
  if (toCents(input.amount) > toCents(availableToTransfer(input.fromNet))) return "insufficient";
  return null;
}

/** Reste non dépensé des jarres de dépense (solde positif), à proposer en versement vers l'épargne. */
export function leftoverSuggestions(
  jars: Partial<Record<JarKey, { revenues: number; spendings: number }>> | null | undefined
): Array<{ jar: JarKey; amount: number }> {
  const out: Array<{ jar: JarKey; amount: number }> = [];
  for (const jar of SPENDING_JARS) {
    const j = jars?.[jar];
    if (!j) continue;
    const amount = availableToTransfer((Number(j.revenues) || 0) - (Number(j.spendings) || 0));
    if (amount > 0) out.push({ jar, amount });
  }
  return out;
}

/** Une sortie depuis une jarre d'épargne mérite un avertissement : on entame le capital. */
export function isSavingsJar(jar: JarKey): boolean {
  return SAVINGS_JARS.includes(jar);
}

// ── « Repartir de zéro » : effacer le déficit d'une jarre ─────────────────────
// Un effacement ajoute au solde de la jarre exactement ce qui lui manque pour revenir à zéro. Les dépenses restent
// dans l'historique ; l'effacement est une ligne à part, annulable. Il compte comme « dépense pardonnée » pour le
// seuil d'alerte : une jarre remise à zéro n'est pas « épuisée », elle repart.

export interface JarAdjustment {
  id: string;
  jar: JarKey;
  amount: number;
  /** AAAA-MM-JJ */
  date: string;
  note: string;
}

interface AdjustmentRowLike { jar: string; amount: number | string }

/** Total effacé par jarre, au centime. */
export function adjustmentTotals(rows: AdjustmentRowLike[] | null | undefined): Record<JarKey, number> {
  const cents: Record<JarKey, number> = { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 };
  for (const r of rows ?? []) {
    const c = toCents(Number(r.amount));
    if (!Number.isFinite(c) || c <= 0 || !isJarKey(r.jar)) continue;
    cents[r.jar] += c;
  }
  const out = {} as Record<JarKey, number>;
  for (const k of JAR_KEYS_ALL) out[k] = cents[k] / 100;
  return out;
}

/** Montant à ajouter pour ramener une jarre en déficit à zéro (arrondi au centime supérieur) ; 0 si elle n'est pas en déficit. */
export function deficitToForgive(net: number): number {
  if (!Number.isFinite(net) || net >= -0.005) return 0;
  return Math.ceil(-net * 100 - 1e-6) / 100;
}

// ── Rappel de janvier ─────────────────────────────────────────────────────────

export interface YearStartPrompt {
  /** Total non dépensé des jarres de dépense, à proposer en versement vers l'épargne. */
  leftover: number;
  /** Jarres en déficit, avec le montant qui manque. */
  deficits: Array<{ jar: JarKey; amount: number }>;
}

/**
 * Rappel de début d'année : en janvier, une fois par an (tant qu'il n'est pas écarté), s'il y a du non-dépensé à
 * verser à l'épargne ou un déficit à solder. null = rien à afficher.
 */
export function yearStartPrompt(input: {
  now: Date;
  jars: Partial<Record<JarKey, { revenues: number; spendings: number }>> | null | undefined;
  /** Dernière année pour laquelle le rappel a été écarté. */
  dismissedYear?: number | null;
}): YearStartPrompt | null {
  const { now, jars } = input;
  if (now.getMonth() !== 0) return null;
  if (input.dismissedYear === now.getFullYear()) return null;
  if (!jars) return null;
  const leftover = round2(leftoverSuggestions(jars).reduce((s, l) => s + l.amount, 0));
  const deficits: Array<{ jar: JarKey; amount: number }> = [];
  for (const jar of JAR_KEYS_ALL) {
    const j = jars[jar];
    if (!j) continue;
    const amount = deficitToForgive((Number(j.revenues) || 0) - (Number(j.spendings) || 0));
    if (amount > 0) deficits.push({ jar, amount });
  }
  if (leftover <= 0 && deficits.length === 0) return null;
  return { leftover, deficits };
}
