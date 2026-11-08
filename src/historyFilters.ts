// Recherche, tri, montant minimum, regroupement par jour et export CSV de l'écran Historique.
// Module pur (aucun import) : testé dans tests/historyFilters.test.ts.

export type SortKey = "dateDesc" | "dateAsc" | "amountDesc" | "amountAsc";

/** Minuscules sans accents ni ponctuation superflue : « Café » et « cafe » se valent. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La recherche porte sur plusieurs champs à la fois (libellé, étiquettes, compte, jarre…). Chaque mot de la saisie
 * doit se retrouver quelque part (« carrefour alimentation » trouve un achat Carrefour étiqueté Alimentation).
 * Saisie vide : tout passe.
 */
export function matchesSearch(fields: Array<string | number | null | undefined>, query: string): boolean {
  const words = normalizeText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(fields.filter((f) => f != null && f !== "").join(" "));
  return words.every((w) => haystack.includes(w));
}

/** Montant minimum saisi (« 100 », « 12,5 »), ou null si vide / invalide / négatif. */
export function parseMinAmount(raw: string): number | null {
  const n = parseFloat(String(raw ?? "").trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Montant ≥ minimum (le minimum est inclus). Sans minimum, tout passe. */
export function passesMinAmount(amount: number, min: number | null): boolean {
  if (min == null) return true;
  return Math.abs(amount || 0) >= min;
}

/** Valeur du filtre « sans étiquette ». */
export const NO_TAG = "__none";

/** La ligne porte-t-elle l'étiquette demandée ? "all" = pas de filtre ; NO_TAG = aucune étiquette. */
export function matchesTag(tagIds: string[], filter: string): boolean {
  if (filter === "all") return true;
  if (filter === NO_TAG) return tagIds.length === 0;
  return tagIds.includes(filter);
}

/**
 * Tri stable. Par date, les égalités gardent l'ordre d'origine (la lecture est déjà du plus récent au plus ancien) ;
 * par montant, les égalités sont départagées par la date la plus récente.
 */
export function sortRows<T>(
  rows: T[],
  sort: SortKey,
  getTime: (r: T) => number,
  getAmount: (r: T) => number
): T[] {
  const idx = new Map<T, number>();
  rows.forEach((r, i) => idx.set(r, i));
  const byOrigin = (a: T, b: T) => (idx.get(a) ?? 0) - (idx.get(b) ?? 0);
  const out = rows.slice();
  switch (sort) {
    case "dateDesc":
      return out.sort((a, b) => getTime(b) - getTime(a) || byOrigin(a, b));
    case "dateAsc":
      // À date égale on inverse aussi l'ordre d'origine : la liste est exactement le miroir de « plus récent »
      return out.sort((a, b) => getTime(a) - getTime(b) || byOrigin(b, a));
    case "amountDesc":
      return out.sort((a, b) => getAmount(b) - getAmount(a) || getTime(b) - getTime(a) || byOrigin(a, b));
    case "amountAsc":
      return out.sort((a, b) => getAmount(a) - getAmount(b) || getTime(b) - getTime(a) || byOrigin(a, b));
  }
}

/** Clé de jour AAAA-MM-JJ (heure locale) d'une date, ou "" si invalide. */
export function dayKey(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Total par jour, calculé sur toutes les lignes (même celles qui ne sont pas encore affichées). */
export function dayTotals<T>(rows: T[], getKey: (r: T) => string, getAmount: (r: T) => number): Map<string, { total: number; count: number }> {
  const out = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const k = getKey(r);
    const cur = out.get(k) ?? { total: 0, count: 0 };
    cur.total += getAmount(r) || 0;
    cur.count += 1;
    out.set(k, cur);
  }
  return out;
}

/** Une cellule CSV : entre guillemets si elle contient séparateur, guillemet ou retour ligne ; guillemets doublés. */
export function csvCell(value: string | number | null | undefined, sep = ";"): string {
  let s = value == null ? "" : String(value);
  // Une cellule qui commence par = + - @ serait interprétée comme formule par un tableur : on la neutralise
  // (sauf les nombres, qui doivent rester des nombres)
  if (typeof value === "string" && /^[=+\-@]/.test(s) && !/^[-+]?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r") ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Texte CSV (lignes séparées par \r\n, comme Excel l'attend). */
export function toCsv(rows: Array<Array<string | number | null | undefined>>, sep = ";"): string {
  return rows.map((r) => r.map((c) => csvCell(c, sep)).join(sep)).join("\r\n");
}

/** Nombre au format du tableur : virgule décimale en français (séparateur « ; »), point sinon. */
export function csvNumber(n: number, decimalComma: boolean): string {
  const s = (Math.round((n || 0) * 100) / 100).toFixed(2);
  return decimalComma ? s.replace(".", ",") : s;
}
