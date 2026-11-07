// src/importNormalize.ts
// Lecture tolérante des fichiers bancaires (CSV / XLSX / OFX / QIF), quelle que soit la banque ou le pays :
// montants (1 234,56 · 1,234.56 · (45.00) · 45,00-), dates (JJ/MM/AAAA, MM/JJ/AAAA, AAAA-MM-JJ, « 15 mars 2026 »…),
// colonnes débit / crédit séparées, devinette des colonnes. Aucune dépendance : testable sous Node.

export type DecimalSep = "." | ",";
export type DateOrder = "DMY" | "MDY" | "YMD";
export type ExpenseSign = "negative" | "positive";
export type Row = Record<string, unknown>;

/** Nom de la colonne synthétique créée quand le fichier a une colonne débit et une colonne crédit. */
export const NET_AMOUNT_COLUMN = "Amount (credit − debit)";

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Minuscules, sans accents, ponctuation → espaces. */
export function normalizeHeader(h: string): string {
  return stripAccents(String(h ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ─────────────────────────────── Montants ───────────────────────────────

/** Le séparateur décimal d'une colonne, d'après ses valeurs (".", "," ou null si rien ne permet de trancher). */
export function detectDecimal(values: unknown[]): DecimalSep | null {
  let dot = 0;
  let comma = 0;
  for (const v of values) {
    if (typeof v === "number") {
      if (!Number.isInteger(v)) dot++;
      continue;
    }
    const s = String(v ?? "").replace(/[^\d.,]/g, "");
    if (!s) continue;
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
      if (lastDot > lastComma) dot++;
      else comma++;
    } else if (lastDot >= 0 || lastComma >= 0) {
      const sep = lastDot >= 0 ? "." : ",";
      const count = s.split(sep).length - 1;
      const after = s.length - (lastDot >= 0 ? lastDot : lastComma) - 1;
      if (count > 1) continue; // 1.234.567 → milliers
      if (after !== 3) {
        if (sep === ".") dot++;
        else comma++;
      }
    }
  }
  if (dot === 0 && comma === 0) return null;
  return comma > dot ? "," : ".";
}

/** Convertit un montant texte en nombre. `decimal` = séparateur décimal de la colonne si connu. */
export function parseAmount(raw: unknown, decimal?: DecimalSep | null): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) negative = true; // (45.00)
  if (/^[-−–—]/.test(s) || /[-−–—]$/.test(s)) negative = true; // -45 · 45-
  if (/\bDR\b|\bDB\b/i.test(s)) negative = true; // 45.00 DR
  if (/^[^\d]*[-−–—]\s*\d/.test(s)) negative = true; // € -45 · USD -45

  s = s.replace(/[^\d.,'’\s  ]/g, ""); // retire symboles, lettres, signes
  s = s.replace(/[\s  '’]/g, ""); // espaces / apostrophes = milliers
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let dec: DecimalSep | null = null;

  if (lastDot >= 0 && lastComma >= 0) {
    dec = lastDot > lastComma ? "." : ","; // le dernier gagne, quoi qu'on nous ait dit
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep: DecimalSep = lastDot >= 0 ? "." : ",";
    const count = s.split(sep).length - 1;
    const idx = lastDot >= 0 ? lastDot : lastComma;
    const after = s.length - idx - 1;
    const before = s.slice(0, idx);
    if (decimal) {
      dec = sep === decimal ? sep : null; // l'autre séparateur est celui des milliers
    } else if (count > 1) {
      dec = null;
    } else if (after === 3 && before.length >= 1 && before.length <= 3 && before !== "0" && before !== "00") {
      dec = null; // 1,234 → mille deux cent trente-quatre
    } else {
      dec = sep;
    }
  }

  let normalized: string;
  if (dec === ".") normalized = s.replace(/,/g, "");
  else if (dec === ",") normalized = s.replace(/\./g, "").replace(",", ".");
  else normalized = s.replace(/[.,]/g, "");

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/**
 * Sens des montants (quel signe désigne une dépense).
 * - un seul signe dans le fichier : c'est celui des dépenses (relevé de carte, export de dépenses) ;
 * - deux signes : la convention bancaire (dépense = négatif) l'emporte, sauf si les montants positifs
 *   dominent très nettement (relevé de carte où les achats sont positifs et les paiements rares).
 *   Compter simplement le signe majoritaire se trompe sur un petit relevé qui contient surtout des
 *   rentrées (intérêts, virements reçus).
 */
export function inferExpenseSign(amounts: Array<number | null>): ExpenseSign {
  let neg = 0;
  let pos = 0;
  for (const a of amounts) {
    if (a == null || a === 0) continue;
    if (a < 0) neg++;
    else pos++;
  }
  if (neg === 0 && pos > 0) return "positive";
  if (neg > 0 && pos === 0) return "negative";
  return pos >= 5 && pos >= 5 * neg ? "positive" : "negative";
}

// ─────────────────────────────── Dates ───────────────────────────────

const MONTHS: Record<string, number> = {};
[
  [1, "jan janv january janvier januar enero ene gennaio gen januari janeiro"],
  [2, "feb febr february fev fevr fevrier februar febrero febbraio februari fevereiro"],
  [3, "mar mars march marz marzo maart marco"],
  [4, "apr april avr avril abr abril aprile"],
  [5, "may mai mei mayo mag maggio maio"],
  [6, "jun june juin juni junio giu giugno junho"],
  [7, "jul july juil juill juillet juli julio lug luglio julho"],
  [8, "aug august aout ago agosto augustus"],
  [9, "sep sept september septembre septiembre set settembre setembro"],
  [10, "oct october octobre okt oktober octubre ott ottobre outubro out"],
  [11, "nov november novembre noviembre novembro"],
  [12, "dec december decembre dez dezember dic diciembre dicembre dezembro"],
].forEach(([m, names]) => {
  for (const n of String(names).split(" ")) MONTHS[n] = m as number;
});

function monthFromName(name: string): number | null {
  const k = stripAccents(name.toLowerCase()).replace(/[.\s]/g, "");
  return MONTHS[k] ?? null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function makeISO(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const fullYear = (yy: string): number => {
  if (yy.length === 4) return Number(yy);
  const n = Number(yy);
  return n <= 69 ? 2000 + n : 1900 + n;
};

/** Convertit une date quelconque en AAAA-MM-JJ. `order` départage JJ/MM et MM/JJ. */
export function parseDate(raw: unknown, order: DateOrder = "DMY"): string | null {
  if (raw == null || raw === "") return null;

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    const d = new Date(raw.getTime() + 12 * 3600 * 1000);
    return makeISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  if (typeof raw === "number") {
    // numéro de série Excel
    if (raw > 20000 && raw < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000);
      return makeISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    raw = String(raw);
  }

  const s = String(raw).trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;

  // AAAA-MM-JJ, AAAA/MM/JJ, AAAA.MM.JJ (+ heure éventuelle)
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/))) {
    return makeISO(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  // AAAAMMJJ (OFX, certains exports)
  if ((m = s.match(/^((?:19|20)\d{2})(\d{2})(\d{2})(?:\d{6})?(?:\D|$)/))) {
    return makeISO(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  // 15/03/2026, 03-15-26, 15.03.2026, 15 03 2026
  if ((m = s.match(/^(\d{1,2})[\s/.\-](\d{1,2})[\s/.\-](\d{4}|\d{2})(?!\d)/))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(m[3]);
    const first = order === "MDY" ? makeISO(y, a, b) : makeISO(y, b, a);
    return first ?? (order === "MDY" ? makeISO(y, b, a) : makeISO(y, a, b));
  }
  // 15 mars 2026 · 15-Mar-26 · 1st March 2026
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th|er|e)?[\s\-/.,]+([A-Za-zÀ-ÿ]+\.?)[\s\-/.,]+(\d{4}|\d{2})(?!\d)/))) {
    const mon = monthFromName(m[2]);
    if (mon) return makeISO(fullYear(m[3]), mon, Number(m[1]));
  }
  // March 15, 2026 · Mar 15 2026
  if ((m = s.match(/^([A-Za-zÀ-ÿ]+\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/))) {
    const mon = monthFromName(m[1]);
    if (mon) return makeISO(Number(m[3]), mon, Number(m[2]));
  }
  return null;
}

export interface DateDetection {
  order: DateOrder;
  /** true si rien dans le fichier ne permet de départager JJ/MM et MM/JJ */
  ambiguous: boolean;
}

/** Détecte l'ordre des dates d'une colonne en regardant toutes ses valeurs. */
export function detectDateOrder(values: unknown[], fallback: DateOrder = "DMY"): DateDetection {
  let dmy = 0;
  let mdy = 0;
  let ymd = 0;
  let numeric = 0;
  for (const v of values) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s) || /^(?:19|20)\d{6}(?:\d{6})?(?:\D|$)/.test(s)) {
      ymd++;
      continue;
    }
    const m = s.match(/^(\d{1,2})[\s/.\-](\d{1,2})[\s/.\-](\d{4}|\d{2})(?!\d)/);
    if (!m) continue;
    numeric++;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (ymd > 0 && ymd >= numeric) return { order: "YMD", ambiguous: false };
  if (dmy > 0 || mdy > 0) return { order: mdy > dmy ? "MDY" : "DMY", ambiguous: false };
  return { order: fallback, ambiguous: numeric > 0 };
}

// ─────────────────────────── Débit / crédit séparés ───────────────────────────

const DEBIT_RE =
  /\b(debit|debits|debited|debito|debitos|withdrawal|withdrawals|withdrawn|paid out|money out|outgoing|spent|soll|ausgaben|ausgang|cargo|cargos|retiro|retiros|retrait|retraits|sortie|sorties|uscita|uscite|addebito|addebiti|af|uitgaven|saida|saidas)\b/;
const CREDIT_RE =
  /\b(credit|credits|credited|credito|creditos|deposit|deposits|deposito|depositos|paid in|money in|incoming|received|haben|eingang|einnahmen|abono|abonos|ingreso|ingresos|versement|versements|entree|entrees|entrata|entrate|accredito|accrediti|bij|inkomsten|entrada|entradas)\b/;
const NOT_AMOUNT_RE = /\b(card|carte|number|numero|no|limit|limite|balance|solde|saldo|total|fee|frais|rate|taux|score|type)\b/;

/** Colonnes débit et crédit d'un fichier qui les sépare (sinon null). */
export function findDebitCreditColumns(headers: string[], rows: Row[]): { debit: string; credit: string } | null {
  let debit: string | undefined;
  let credit: string | undefined;
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (!n || NOT_AMOUNT_RE.test(n)) continue;
    if (!debit && DEBIT_RE.test(n)) debit = h;
    else if (!credit && CREDIT_RE.test(n)) credit = h;
  }
  if (!debit || !credit) return null;
  const numericShare = (col: string) => {
    const vals = rows.map((r) => r[col]).filter((v) => v != null && String(v).trim() !== "");
    if (vals.length === 0) return 0;
    return vals.filter((v) => parseAmount(v) != null).length / vals.length;
  };
  // au moins une des deux colonnes contient des montants, l'autre aussi ou est vide
  if (numericShare(debit) < 0.8 || numericShare(credit) < 0.8) return null;
  const filled = (col: string) => rows.some((r) => r[col] != null && String(r[col]).trim() !== "");
  if (!filled(debit) && !filled(credit)) return null;
  return { debit, credit };
}

/** Ajoute une colonne « montant net » (crédit − débit) quand le fichier a deux colonnes séparées. */
export function addNetAmountColumn(headers: string[], rows: Row[]): { headers: string[]; rows: Row[]; added: boolean } {
  const found = findDebitCreditColumns(headers, rows);
  if (!found || headers.includes(NET_AMOUNT_COLUMN)) return { headers, rows, added: false };
  const decimal = detectDecimal(rows.flatMap((r) => [r[found.debit], r[found.credit]]));
  const newRows = rows.map((r) => {
    const d = parseAmount(r[found.debit], decimal);
    const c = parseAmount(r[found.credit], decimal);
    let net = "";
    if (d != null || c != null) net = String(+((c != null ? Math.abs(c) : 0) - (d != null ? Math.abs(d) : 0)).toFixed(6));
    return { ...r, [NET_AMOUNT_COLUMN]: net };
  });
  return { headers: [...headers, NET_AMOUNT_COLUMN], rows: newRows, added: true };
}

// ─────────────────────────── Devinette des colonnes ───────────────────────────

export type SuggestedColumns = Partial<Record<"Date" | "Description" | "Montant" | "Devise", string>>;

const DATE_HEADER_RE = /\b(date|data|fecha|datum|dato|buchung|buchungstag|boekdatum|posted|posting)\b/;
const DATE_EXCLUDE_RE = /\b(value|valeur|valuta|valor|wertstellung|due|expiry|maturity|echeance|start|started|debut|birth)\b/;
const DESC_PRIORITY = [
  /\b(description|descripcion|descrizione|descricao|omschrijving|beschreibung)\b/,
  /\b(libelle|label|intitule|titre|objet|motif)\b/,
  /\b(payee|merchant|beneficiaire|beneficiary|empfanger|name|nom|commercant|counterparty|tegenpartij)\b/,
  /\b(narrative|narration|details|detail|transaction details|concepto|verwendungszweck|buchungstext|text)\b/,
  /\b(memo|reference|ref|note|notes)\b/,
];
const AMOUNT_HEADER_RE = /\b(amount|montant|betrag|importe|importo|bedrag|somme|sum|valor|quantia)\b/;
const AMOUNT_EXCLUDE_RE = /\b(balance|solde|saldo|fee|fees|frais|commission|tax|taxe|rate|taux|original|orig|foreign|local|exchange|kurs)\b/;
const CURRENCY_HEADER_RE = /\b(currency|devise|ccy|waehrung|wahrung|moneda|valuta|divisa|moeda|munt|cur)\b/;

const colValues = (rows: Row[], col: string, max = 300) => rows.slice(0, max).map((r) => r[col]);
const nonEmpty = (vals: unknown[]) => vals.filter((v) => v != null && String(v).trim() !== "");

/** Propose le mapping des colonnes du fichier vers Date / Description / Montant / Devise. */
export function suggestColumns(headers: string[], rows: Row[]): SuggestedColumns {
  const out: SuggestedColumns = {};

  // Date
  const dateScore = (col: string) => {
    const vals = nonEmpty(colValues(rows, col));
    if (!vals.length) return 0;
    return vals.filter((v) => parseDate(v, "DMY") != null || parseDate(v, "MDY") != null).length / vals.length;
  };
  const dateCandidates = headers.filter((h) => {
    const n = normalizeHeader(h);
    return DATE_HEADER_RE.test(n) && dateScore(h) >= 0.6;
  });
  const bestDate =
    dateCandidates.find((h) => !DATE_EXCLUDE_RE.test(normalizeHeader(h))) ??
    dateCandidates[0] ??
    headers.find((h) => dateScore(h) >= 0.9);
  if (bestDate) out.Date = bestDate;

  // Montant : la colonne « net » prime
  if (headers.includes(NET_AMOUNT_COLUMN)) {
    out.Montant = NET_AMOUNT_COLUMN;
  } else {
    const amountScore = (col: string) => {
      const vals = nonEmpty(colValues(rows, col));
      if (!vals.length) return 0;
      return vals.filter((v) => parseAmount(v) != null).length / vals.length;
    };
    const cand = headers.filter((h) => {
      const n = normalizeHeader(h);
      return AMOUNT_HEADER_RE.test(n) && !AMOUNT_EXCLUDE_RE.test(n) && amountScore(h) >= 0.8;
    });
    if (cand.length) out.Montant = cand[0];
  }

  // Description
  const used = new Set(Object.values(out));
  const descScore = (col: string) => {
    const vals = nonEmpty(colValues(rows, col));
    if (!vals.length) return 0;
    return vals.filter((v) => typeof v === "string" && /[A-Za-zÀ-ÿ]{2}/.test(v) && parseDate(v) == null).length / vals.length;
  };
  for (const re of DESC_PRIORITY) {
    const h = headers.find((c) => !used.has(c) && re.test(normalizeHeader(c)) && descScore(c) >= 0.6);
    if (h) {
      out.Description = h;
      break;
    }
  }

  // Devise
  const cur = headers.find((h) => {
    if (!CURRENCY_HEADER_RE.test(normalizeHeader(h))) return false;
    const vals = nonEmpty(colValues(rows, h));
    return vals.length > 0 && vals.filter((v) => /^[A-Za-z]{3}$/.test(String(v).trim())).length / vals.length >= 0.8;
  });
  if (cur) out.Devise = cur;

  return out;
}

// ─────────────────────────── Réglages de lecture ───────────────────────────

export interface ReadOptions {
  dateOrder: "auto" | DateOrder;
  decimal: "auto" | DecimalSep;
  expenseSign: "auto" | ExpenseSign;
}

export const DEFAULT_READ_OPTIONS: ReadOptions = { dateOrder: "auto", decimal: "auto", expenseSign: "auto" };

/** Ordre des dates quand le fichier est ambigu : celui du pays du navigateur. */
export function localeDateOrder(): DateOrder {
  const lang = typeof navigator !== "undefined" ? navigator.language || "" : "";
  return /^en-(US|CA|PH)\b/i.test(lang) || lang === "en" ? "MDY" : "DMY";
}

export interface Reading {
  order: DateOrder;
  /** les dates du fichier peuvent se lire JJ/MM ou MM/JJ et rien ne permet de trancher */
  ambiguous: boolean;
  decimal: DecimalSep;
  expenseSign: ExpenseSign;
  /** il y a des montants des deux signes : le fichier mélange dépenses et rentrées */
  mixedSigns: boolean;
  sampleDate: string | null;
}

/** Résout comment lire les colonnes date et montant choisies (détection + choix de l'utilisateur). */
export function resolveReading(
  rows: Row[],
  dateCol: string | undefined,
  amountCol: string | undefined,
  opts: ReadOptions,
  hintOrder?: DateOrder
): Reading {
  const dates = dateCol ? rows.map((r) => r[dateCol]) : [];
  const det = detectDateOrder(dates, hintOrder ?? localeDateOrder());
  const order = opts.dateOrder === "auto" ? det.order : opts.dateOrder;
  const amountsRaw = amountCol ? rows.map((r) => r[amountCol]) : [];
  const decimal: DecimalSep = opts.decimal === "auto" ? detectDecimal(amountsRaw) ?? "." : opts.decimal;
  const parsed = amountsRaw.map((v) => parseAmount(v, decimal));
  // La colonne « crédit − débit » fabriquée par addNetAmountColumn a un sens connu : sortie = négatif
  const expenseSign =
    opts.expenseSign !== "auto" ? opts.expenseSign : amountCol === NET_AMOUNT_COLUMN ? "negative" : inferExpenseSign(parsed);
  const mixedSigns = parsed.some((a) => a != null && a < 0) && parsed.some((a) => a != null && a > 0);
  const sample = dates.find((v) => typeof v === "string" && /^\d{1,2}[\s/.\-]\d{1,2}[\s/.\-]\d{2,4}/.test(v.trim()));
  return {
    order,
    ambiguous: opts.dateOrder === "auto" && det.ambiguous,
    decimal,
    expenseSign,
    mixedSigns,
    sampleDate: typeof sample === "string" ? sample.trim() : null,
  };
}

// ─────────────────────────── Remboursements et annulations ───────────────────────────

export interface SignedLine {
  /** AAAA-MM-JJ */
  date: string;
  /** montant signé tel que lu dans le fichier */
  amount: number;
  description: string;
}

const REVERSAL_RE =
  /\b(reversa|reversal|reversed|reverse|refund|refunded|remboursement|annulation|annule|storno|stornierung|reembolso|devolucion|rimborso|cancel|cancelled|chargeback|retour)\b/;
const GENERIC_WORDS = new Set([
  "carte", "card", "paiement", "payment", "virement", "transfer", "compte", "account", "retrait", "retiro", "cobro",
  "comision", "commission", "fees", "frais", "from", "para", "pour", "date", "purchase", "achat", "debit", "credit",
]);

function textTokens(description: string) {
  const norm = normalizeHeader(description);
  const words = norm.split(" ").filter(Boolean);
  const refs = new Set(words.filter((w) => /^\d{4,}$/.test(w)));
  const names = new Set(words.filter((w) => /^[a-z]{5,}$/.test(w) && !GENERIC_WORDS.has(w) && !REVERSAL_RE.test(w)));
  return { refs, names, reversal: REVERSAL_RE.test(norm) };
}

const dayNumber = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 86400000;

/**
 * Dépenses annulées par un remboursement : un crédit de même montant, daté de 0 à 45 jours après la dépense,
 * qui partage soit un numéro de référence, soit un nom de commerçant, soit un mot d'annulation (reversa, refund…).
 * Renvoie les indices des dépenses annulées ; les crédits correspondants sont dans `usedCredits`.
 */
export function findCancelledExpenses(lines: SignedLine[], expenseSign: ExpenseSign): { cancelled: Set<number>; usedCredits: Set<number> } {
  const isExpense = (a: number) => (expenseSign === "negative" ? a < 0 : a > 0);
  const tokens = lines.map((l) => textTokens(l.description));
  const cancelled = new Set<number>();
  const usedCredits = new Set<number>();

  const credits = lines.map((l, i) => i).filter((i) => lines[i].amount !== 0 && !isExpense(lines[i].amount));
  credits.sort((a, b) => lines[a].date.localeCompare(lines[b].date));

  for (const c of credits) {
    const credit = lines[c];
    const cTok = tokens[c];
    let best = -1;
    let bestScore = 0;
    let bestGap = Infinity;
    for (let d = 0; d < lines.length; d++) {
      if (cancelled.has(d) || d === c) continue;
      const debit = lines[d];
      if (debit.amount === 0 || !isExpense(debit.amount)) continue;
      if (Math.abs(Math.abs(debit.amount) - Math.abs(credit.amount)) > 0.005) continue;
      const gap = dayNumber(credit.date) - dayNumber(debit.date);
      if (!(gap >= -1 && gap <= 45)) continue;
      const dTok = tokens[d];
      const sharedRef = [...cTok.refs].some((r) => dTok.refs.has(r));
      const sharedName = [...cTok.names].some((n) => dTok.names.has(n));
      let score = 0;
      if (sharedRef) score += 3;
      if (sharedName) score += 2;
      if (cTok.reversal) score += 1;
      if (score === 0 || (score === 1 && !sharedRef && !sharedName && gap > 31)) continue;
      if (score > bestScore || (score === bestScore && Math.abs(gap) < bestGap)) {
        best = d;
        bestScore = score;
        bestGap = Math.abs(gap);
      }
    }
    if (best >= 0) {
      cancelled.add(best);
      usedCredits.add(c);
    }
  }
  return { cancelled, usedCredits };
}
