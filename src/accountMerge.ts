// Fusion des comptes par nom, sans tenir compte de la casse ni des espaces. Module pur (aucun import) : testé dans
// tests/accountMerge.test.ts.
//
// Pourquoi : le « reçu » d'un compte vient de la destination des revenus, le « dépensé » du compte des dépenses. Ce
// sont deux colonnes distinctes : « Keystone » (revenus) et « KEYSTONE » (dépenses) donnaient deux cartes séparées.

/** Clé de comparaison : minuscules, espaces de début/fin retirés, espaces multiples réduits. */
export function accountKey(name: string | null | undefined): string {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Somme par nom exact de compte (les noms vides sont ignorés). */
export function sumByName<T>(items: T[], getName: (i: T) => string | null | undefined, getAmount: (i: T) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const name = String(getName(it) ?? "").trim();
    if (!name) continue;
    out[name] = (out[name] || 0) + (getAmount(it) || 0);
  }
  return out;
}

export interface AccountLine {
  name: string;
  received: number;
  spent: number;
}

export interface MergedAccount {
  key: string;
  /** Nom affiché. */
  name: string;
  received: number;
  spent: number;
}

/**
 * Regroupe les lignes qui désignent le même compte. Nom affiché : celui des Réglages (`preferred`) s'il existe, sinon
 * l'écriture la plus chargée en montants, puis celle qui n'est pas toute en majuscules, puis l'ordre alphabétique.
 * Résultat trié par nom.
 */
export function mergeAccountLines(lines: AccountLine[], preferred: string[] = []): MergedAccount[] {
  const groups = new Map<string, { variants: Map<string, number>; received: number; spent: number }>();
  for (const l of lines) {
    const name = String(l.name ?? "").trim().replace(/\s+/g, " ");
    const key = accountKey(name);
    if (!key) continue;
    const g = groups.get(key) ?? { variants: new Map(), received: 0, spent: 0 };
    g.variants.set(name, (g.variants.get(name) ?? 0) + Math.abs(l.received || 0) + Math.abs(l.spent || 0));
    g.received += l.received || 0;
    g.spent += l.spent || 0;
    groups.set(key, g);
  }
  const preferredByKey = new Map<string, string>();
  for (const p of preferred) {
    const name = String(p ?? "").trim().replace(/\s+/g, " ");
    if (name && !preferredByKey.has(accountKey(name))) preferredByKey.set(accountKey(name), name);
  }
  const out: MergedAccount[] = [];
  for (const [key, g] of groups) {
    const variants = Array.from(g.variants.entries()).sort(
      (a, b) => b[1] - a[1] || Number(a[0] === a[0].toUpperCase()) - Number(b[0] === b[0].toUpperCase()) || a[0].localeCompare(b[0])
    );
    out.push({ key, name: preferredByKey.get(key) ?? variants[0][0], received: g.received, spent: g.spent });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
