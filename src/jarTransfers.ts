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
