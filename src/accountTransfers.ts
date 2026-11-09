// Virements entre comptes : de l'argent déplacé d'un compte à un autre (ex. de Keystone vers Redotpay). Ce n'est ni un
// revenu ni une dépense : seuls les soldes des deux comptes changent. Module pur, testé dans tests/accountTransfers.test.mjs.
//
// Pourquoi : le « reçu » d'un compte vient de la destination des revenus, le « dépensé » des dépenses payées avec lui. Sans
// les virements, un compte alimenté par un autre (Redotpay approvisionné depuis Keystone) paraît toujours en négatif.
import { accountKey } from "./accountMerge";

export interface AccountTransfer {
  id: string;
  from: string;
  to: string;
  /** Montant dans la devise de référence, > 0 : c'est lui qui entre dans les soldes. */
  amount: number;
  /** Montant réellement viré, dans sa devise (USDC, USD…) ; absent si le virement est déjà dans la devise de référence. */
  originalAmount?: number;
  originalCurrency?: string;
  /** Cours utilisé : 1 unité de la devise d'origine = `rate` unités de la devise de référence. */
  rate?: number;
  /** AAAA-MM-JJ. */
  date: string;
  note: string;
}

export type AccountTransferError = "empty" | "sameAccount" | "amount" | "rate";

const clean = (s: string | null | undefined) => String(s ?? "").trim().replace(/\s+/g, " ");

/** Contrôle d'un virement avant enregistrement ; null = valide. Deux écritures du même compte (casse, espaces) = même compte. */
export function checkAccountTransfer(input: { from: string; to: string; amount: number; /** Cours exigé quand le montant saisi est dans une autre devise. */ rate?: number | null; foreign?: boolean }): AccountTransferError | null {
  const from = clean(input.from);
  const to = clean(input.to);
  if (!from || !to) return "empty";
  if (accountKey(from) === accountKey(to)) return "sameAccount";
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "amount";
  if (input.foreign) {
    if (input.rate == null || !Number.isFinite(input.rate) || input.rate <= 0) return "rate";
    if (Math.round(input.amount * input.rate * 100) <= 0) return "amount";
  } else if (Math.round(input.amount * 100) <= 0) return "amount";
  return null;
}

/** Montant dans la devise de référence : montant d'origine × cours, arrondi au centime. NaN si le cours est inutilisable. */
export function convertTransferAmount(original: number, rate: number | null | undefined): number {
  if (!Number.isFinite(original) || original <= 0 || rate == null || !Number.isFinite(rate) || rate <= 0) return NaN;
  return Math.round(original * rate * 100) / 100;
}

/** Montant saisi (« 1 500,50 », « 1500.5 »…) → nombre, NaN si illisible. */
export function parseTransferAmount(raw: string): number {
  const s = String(raw ?? "").replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

export interface AccountFlow {
  key: string;
  /** Nom affiché : l'écriture la plus fréquente. */
  name: string;
  /** Reçu par virement. */
  in: number;
  /** Envoyé par virement. */
  out: number;
}

/** Entrées et sorties de chaque compte (casse et espaces ignorés), arrondies au centime. */
export function transferFlows(rows: Array<Pick<AccountTransfer, "from" | "to" | "amount">>): AccountFlow[] {
  const groups = new Map<string, { names: Map<string, number>; in: number; out: number }>();
  const touch = (rawName: string, amount: number, dir: "in" | "out") => {
    const name = clean(rawName);
    const key = accountKey(name);
    if (!key) return;
    const g = groups.get(key) ?? { names: new Map(), in: 0, out: 0 };
    g.names.set(name, (g.names.get(name) ?? 0) + 1);
    g[dir] += amount;
    groups.set(key, g);
  };
  for (const r of rows) {
    const cents = Math.round(Number(r.amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    if (accountKey(r.from) === accountKey(r.to)) continue;
    touch(r.from, cents, "out");
    touch(r.to, cents, "in");
  }
  const out: AccountFlow[] = [];
  for (const [key, g] of groups) {
    const name = Array.from(g.names.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    out.push({ key, name, in: g.in / 100, out: g.out / 100 });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Solde d'un compte sur la période : reçu + virements reçus − dépensé − virements envoyés (arrondi au centime). */
export function accountBalance(a: { received: number; spent: number; transfersIn?: number; transfersOut?: number }): number {
  const cents = (n: number | undefined) => Math.round((n || 0) * 100);
  return (cents(a.received) + cents(a.transfersIn) - cents(a.spent) - cents(a.transfersOut)) / 100;
}
