// src/pdfStatement.ts
// Reconstruit le tableau de transactions d'un relevé PDF à partir des mots et de leurs positions (x, y).
// Entièrement local : rien n'est envoyé nulle part. Aucune dépendance (testable sous Node).
//
// Principe : lignes (même y) → cellules (mots proches) → ligne d'en-tête reconnue (Date, Description, Débit,
// Crédit, Solde… en plusieurs langues) → chaque cellule est rangée dans la colonne dont l'en-tête est le plus
// proche en x → les lignes sans date sont des suites de description de la transaction précédente.

import { normalizeHeader, parseAmount, parseDate, type Row } from "./importNormalize";

export interface PdfItem {
  str: string;
  x: number;
  y: number;
  w: number;
}
export type PdfPage = PdfItem[];

export interface PdfTable {
  headers: string[];
  rows: Row[];
  /** true si aucun en-tête n'a été reconnu : colonnes devinées, à vérifier */
  guessed: boolean;
  /** false si le texte du PDF est inexploitable (PDF imprimé, copié ou dont les polices sont brouillées) */
  readable: boolean;
}

interface Cell {
  text: string;
  x0: number;
  x1: number;
}
interface Line {
  y: number;
  cells: Cell[];
}

type ColKind = "date" | "valuedate" | "text" | "reference" | "amount" | "balance" | "ignore";
interface Column {
  label: string;
  kind: ColKind;
  x0: number;
  x1: number;
}

// ─────────────────────────────── Lignes et cellules ───────────────────────────────

export function buildLines(items: PdfItem[]): Line[] {
  const clean = items.filter((i) => i.str && i.str.trim() !== "");
  clean.sort((a, b) => b.y - a.y || a.x - b.x);
  const raw: { y: number; items: PdfItem[] }[] = [];
  for (const it of clean) {
    const last = raw[raw.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2.5) last.items.push(it);
    else raw.push({ y: it.y, items: [it] });
  }
  return raw.map((l) => {
    const sorted = [...l.items].sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const it of sorted) {
      const last = cells[cells.length - 1];
      const text = it.str.replace(/\s+/g, " ").trim();
      if (last && it.x - last.x1 < 4) {
        last.text = `${last.text} ${text}`;
        last.x1 = Math.max(last.x1, it.x + it.w);
      } else {
        cells.push({ text, x0: it.x, x1: it.x + it.w });
      }
    }
    return { y: l.y, cells };
  });
}

// ─────────────────────────────── Reconnaissance du contenu ───────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = { "€": "EUR", "£": "GBP", $: "USD", "¥": "JPY", "₣": "CHF" };

/** Une cellule est un montant : décimales, signe, symbole ou code devise (pas un simple numéro de référence). */
export function isAmountText(text: string): boolean {
  let s = text.trim();
  if (!s) return false;
  const hasCurrency = /[€£$¥]|\b[A-Z]{3}\b/.test(s);
  s = s.replace(/\b[A-Z]{3}\b/g, "").replace(/[€£$¥]/g, "").replace(/\b(CR|DR)\b/gi, "").trim();
  const signed = /^[-+−–]|[-−–]$|^\(.*\)$/.test(s);
  s = s.replace(/^[-+−–(]+|[-−–)]+$/g, "").trim();
  if (!/^\d{1,3}([\s  .,'’]\d{3})*([.,]\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(s)) return false;
  const hasDecimals = /[.,]\d{1,2}$/.test(s);
  return hasDecimals || hasCurrency || signed;
}

/** Devise explicite d'une cellule montant (code ISO ou symbole). */
export function currencyOf(text: string): string | null {
  const code = text.match(/\b([A-Z]{3})\b/);
  if (code && !/^(CR|DR)$/.test(code[1])) return code[1];
  const sym = text.match(/[€£$¥]/);
  return sym ? CURRENCY_SYMBOLS[sym[0]] ?? null : null;
}

/** Date au début d'un texte (« 13 abr. 2026 », « Oct 16, 2026 », « 01.10.2026 »…) ; renvoie la date et le reste. */
export function splitDatePrefix(text: string): { date: string; rest: string } | null {
  const t = text.trim();
  const patterns = [
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/,
    /^\d{1,2}[/.\-]\d{1,2}[/.\-](?:\d{4}|\d{2})(?!\d)/,
    /^\d{1,2}(?:st|nd|rd|th|er)?[\s\-/.,]+[A-Za-zÀ-ÿ]+\.?[\s\-/.,]+\d{4}(?!\d)/,
    /^[A-Za-zÀ-ÿ]+\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}(?!\d)/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m && parseDate(m[0], "DMY") != null) return { date: m[0], rest: t.slice(m[0].length).trim() };
  }
  return null;
}

// ─────────────────────────────── En-têtes ───────────────────────────────

const HEADER_LABELS: Array<{ re: RegExp; kind: ColKind }> = [
  // les plus spécifiques d'abord
  { re: /^(date valeur|value date|valuta|valor|fecha valor|wertstellung|date de valeur)$/, kind: "valuedate" },
  { re: /^(date|data|fecha|datum|dato|booking date|posting date|buchungstag|buchung|transaction date|date operation|date d operation|fecha operacion)$/, kind: "date" },
  { re: /^(solde|saldo|balance|soldo|solde fin|running balance|solde apres operation)$/, kind: "balance" },
  {
    re: /^(debit|debits|credit|credits|montant|amount|amounts|importe|importo|betrag|bedrag|retiro|retiros|deposito|depositos|withdrawal|withdrawals|deposit|deposits|paid in|paid out|money in|money out|entree d argent|sortie d argent|argent entrant|argent sortant|entrant|sortant|entree|entrees|sortie|sorties|soll|haben|cargo|abono|transaction amount|montant debit|montant credit|debit amount|credit amount|amount debit|amount credit|charges|payments)$/,
    kind: "amount",
  },
  { re: /^(frais|fee|fees|gebuhren|comisiones|impot retenu|autres taxes|taxes|tax|impots)$/, kind: "ignore" },
  { re: /^(reference|ref|numero|no|n)$/, kind: "reference" },
  {
    re: /^(description|descripcion|descrizione|detalle|detail|details|libelle|information|informations|concepto|beschreibung|verwendungszweck|narrative|motif|type|operation|transaction|transactions|payee|merchant|beneficiaire|nom|name|memo|categorie|category|categoria)$/,
    kind: "text",
  },
];

const HEADER_PHRASES = [
  "date valeur", "value date", "fecha valor", "date de valeur", "booking date", "posting date", "transaction date",
  "date operation", "date d operation", "fecha operacion", "transaction amount", "montant debit", "montant credit",
  "debit amount", "credit amount", "amount debit", "amount credit", "entree d argent", "sortie d argent",
  "paid in", "paid out", "money in", "money out", "running balance",
];

function classifyLabel(norm: string): ColKind | null {
  for (const { re, kind } of HEADER_LABELS) if (re.test(norm)) return kind;
  return null;
}

/** Sépare une cellule d'en-tête qui contient plusieurs libellés (« ENTRÉE D'ARGENT SORTIE D'ARGENT »). */
function splitHeaderCell(cell: Cell): Column[] {
  const words = cell.text.split(/\s+/);
  const norm = words.map((w) => normalizeHeader(w));
  const total = cell.text.length || 1;
  const out: Column[] = [];

  const offsets: number[] = [];
  let pos = 0;
  for (const w of words) {
    offsets.push(pos);
    pos += w.length + 1;
  }
  const toX = (charPos: number) => cell.x0 + (charPos / total) * (cell.x1 - cell.x0);

  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let len = Math.min(words.length - i, 4); len >= 1; len--) {
      const phrase = norm.slice(i, i + len).join(" ").trim();
      if (!phrase) continue;
      const kind = classifyLabel(phrase) ?? (len > 1 && HEADER_PHRASES.includes(phrase) ? classifyLabel(phrase) : null);
      if (kind) {
        const start = offsets[i];
        const end = offsets[i + len - 1] + words[i + len - 1].length;
        out.push({ label: words.slice(i, i + len).join(" "), kind, x0: toX(start), x1: toX(end) });
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return out;
}

/** Colonnes d'une ligne d'en-tête candidate, ou null si ce n'en est pas une. */
export function detectHeader(line: Line): Column[] | null {
  const cols: Column[] = [];
  for (const cell of line.cells) cols.push(...splitHeaderCell(cell));
  if (cols.length < 3) return null;
  const hasDate = cols.some((c) => c.kind === "date");
  const hasAmount = cols.some((c) => c.kind === "amount");
  if (!hasDate || !hasAmount) return null;
  // les libellés reconnus doivent représenter l'essentiel de la ligne (pas une phrase qui contient « date »)
  const recognizedChars = cols.reduce((n, c) => n + c.label.length, 0);
  const lineChars = line.cells.reduce((n, c) => n + c.text.length, 0);
  if (recognizedChars < lineChars * 0.6) return null;
  return cols.sort((a, b) => a.x0 - b.x0);
}

// ─────────────────────────────── Rattachement des cellules aux colonnes ───────────────────────────────

function distance(cell: Cell, col: Column): number {
  const overlap = Math.min(cell.x1, col.x1) - Math.max(cell.x0, col.x0);
  if (overlap > 0) return -overlap; // recouvrement : le plus grand gagne
  const cc = (cell.x0 + cell.x1) / 2;
  const hc = (col.x0 + col.x1) / 2;
  return Math.min(Math.abs(cell.x0 - col.x0), Math.abs(cell.x1 - col.x1), Math.abs(cc - hc));
}

function nearest(cell: Cell, cols: Column[]): Column | null {
  let best: Column | null = null;
  let bestD = Infinity;
  for (const c of cols) {
    const d = distance(cell, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// ─────────────────────────────── Extraction ───────────────────────────────

interface RawRow {
  date: string;
  desc: string[];
  reference: string[];
  amounts: Map<string, string>; // libellé de colonne → texte
  currency: string | null;
  hasAmount: boolean;
}

const uniqueLabel = (label: string, used: Set<string>) => {
  let name = label.replace(/\s+/g, " ").trim();
  if (used.has(name)) {
    let n = 2;
    while (used.has(`${name} (${n})`)) n++;
    name = `${name} (${n})`;
  }
  used.add(name);
  return name;
};

const COMMON_WORDS =
  /\b(date|fecha|datum|data|solde|saldo|balance|montant|amount|importe|betrag|compte|cuenta|account|konto|iban|total|description|libelle|detalle|debit|credit|transaction|relev|statement|extracto|virement|paiement|payment)/i;

/** Le texte extrait ressemble-t-il à du texte ? (les PDF imprimés ou à polices brouillées donnent des suites de caractères sans sens) */
export function looksReadable(pages: PdfPage[]): boolean {
  const text = pages.map((p) => p.map((i) => i.str).join(" ")).join(" ");
  if (text.trim().length < 20) return true; // PDF vide ou scanné : autre cas, déjà géré par « rien trouvé »
  return COMMON_WORDS.test(text);
}

export function extractStatementTable(pages: PdfPage[]): PdfTable {
  const table = extractLayout(pages);
  return table.rows.length === 0 ? { ...table, readable: looksReadable(pages) } : table;
}

function extractLayout(pages: PdfPage[]): PdfTable {
  const linesByPage = pages.map(buildLines);

  // 1) meilleure ligne d'en-tête du document
  let columns: Column[] | null = null;
  for (const lines of linesByPage) {
    for (const line of lines) {
      const cols = detectHeader(line);
      if (cols && (!columns || cols.length > columns.length)) columns = cols;
    }
  }
  if (!columns) return extractWithoutHeader(linesByPage);

  const cols = columns;
  const dateCol = cols.find((c) => c.kind === "date")!;
  const amountCols = cols.filter((c) => c.kind === "amount" || c.kind === "balance");
  const textCols = cols.filter((c) => c.kind === "text" || c.kind === "reference");
  const nonAmountCols = cols.filter((c) => c.kind !== "amount" && c.kind !== "balance");
  const descStart = Math.min(...textCols.map((c) => c.x0), dateCol.x1);
  const descEnd = Math.max(...textCols.map((c) => c.x1), descStart);
  const firstAmountX = Math.min(...amountCols.map((c) => c.x0));

  const rows: RawRow[] = [];
  for (const lines of linesByPage) {
    let prev: RawRow | null = null;
    let prevY = 0;
    for (const line of lines) {
      if (detectHeader(line)) {
        prev = null;
        continue;
      }
      const first = line.cells[0];
      const dated = first ? splitDatePrefix(first.text) : null;
      const nearDateCol = first ? Math.abs(first.x0 - dateCol.x0) <= Math.max(25, (dateCol.x1 - dateCol.x0) * 0.8) : false;

      if (dated && nearDateCol) {
        const row: RawRow = { date: dated.date, desc: [], reference: [], amounts: new Map(), currency: null, hasAmount: false };
        const cells = line.cells.slice(1);
        if (dated.rest) cells.unshift({ text: dated.rest, x0: first.x0 + (first.x1 - first.x0) * 0.5, x1: first.x1 });
        for (const cell of cells) assignCell(row, cell, cols, amountCols, nonAmountCols);
        rows.push(row);
        prev = row;
        prevY = line.y;
        continue;
      }

      // suite de description : cellules uniquement dans la zone texte, juste sous la ligne précédente
      if (prev && prevY - line.y <= 20 && line.cells.every((c) => !isAmountText(c.text) && c.x0 >= descStart - 6 && c.x0 < firstAmountX)) {
        void descEnd;
        for (const cell of line.cells) prev.desc.push(cell.text);
        prevY = line.y;
        continue;
      }
      prev = null;
    }
  }

  return buildTable(rows, cols, false);
}

function assignCell(row: RawRow, cell: Cell, cols: Column[], amountCols: Column[], nonAmountCols: Column[]) {
  if (amountCols.length && isAmountText(cell.text)) {
    // colonnes numériques : montants, solde, et colonnes ignorées (frais, taxes…) pour ne pas leur voler leurs valeurs
    const numericCols = cols.filter((c) => c.kind === "amount" || c.kind === "balance" || c.kind === "ignore");
    const col = nearest(cell, numericCols);
    if (!col || distance(cell, col) > 30) return; // sous aucun en-tête connu : on ne devine pas
    if (col.kind === "ignore") return;
    row.amounts.set(col.label, cell.text);
    if (col.kind === "amount") {
      row.hasAmount = true;
      row.currency = row.currency ?? currencyOf(cell.text);
    }
    return;
  }
  const col = nearest(cell, nonAmountCols.length ? nonAmountCols : cols);
  if (!col || col.kind === "valuedate" || col.kind === "ignore") return;
  if (col.kind === "reference") row.reference.push(cell.text);
  else row.desc.push(cell.text);
}

function buildTable(rawRows: RawRow[], cols: Column[], guessed: boolean): PdfTable {
  const kept = rawRows.filter((r) => r.hasAmount);
  const used = new Set<string>(["Date", "Description"]);
  const amountLabels = cols.filter((c) => c.kind === "amount" || c.kind === "balance").map((c) => c.label);
  const labelNames = new Map<string, string>();
  // une seule colonne de montant (ex. « entrant / sortant ») : on l'appelle simplement « Amount »
  const lone = cols.filter((c) => c.kind === "amount");
  for (const l of amountLabels) {
    labelNames.set(l, lone.length === 1 && lone[0].label === l ? uniqueLabel("Amount", used) : uniqueLabel(l, used));
  }
  const hasReference = kept.some((r) => r.reference.length > 0);
  const refName = hasReference ? uniqueLabel("Reference", used) : null;
  const hasCurrency = kept.some((r) => r.currency);
  const curName = hasCurrency ? uniqueLabel("Currency", used) : null;

  const headers = ["Date", "Description", ...amountLabels.map((l) => labelNames.get(l)!)];
  if (refName) headers.push(refName);
  if (curName) headers.push(curName);

  const rows: Row[] = kept.map((r) => {
    const row: Row = { Date: r.date, Description: r.desc.join(" ").replace(/\s+/g, " ").trim() };
    for (const l of amountLabels) row[labelNames.get(l)!] = r.amounts.get(l) ?? "";
    if (refName) row[refName] = r.reference.join(" ");
    if (curName) row[curName] = r.currency ?? "";
    return row;
  });
  return { headers, rows, guessed, readable: true };
}

/** Pas d'en-tête reconnu : on prend les lignes qui commencent par une date et finissent par des montants. */
function extractWithoutHeader(linesByPage: Line[][]): PdfTable {
  const rows: RawRow[] = [];
  const fake: Column[] = [
    { label: "Amount", kind: "amount", x0: 0, x1: 0 },
    { label: "Balance", kind: "balance", x0: 0, x1: 0 },
  ];
  for (const lines of linesByPage) {
    for (const line of lines) {
      const first = line.cells[0];
      const dated = first ? splitDatePrefix(first.text) : null;
      if (!dated) continue;
      const row: RawRow = { date: dated.date, desc: [], reference: [], amounts: new Map(), currency: null, hasAmount: false };
      const cells = line.cells.slice(1);
      if (dated.rest) cells.unshift({ text: dated.rest, x0: first.x0, x1: first.x1 });
      const amountCells = cells.filter((c) => isAmountText(c.text));
      cells.filter((c) => !isAmountText(c.text)).forEach((c) => row.desc.push(c.text));
      if (!amountCells.length) continue;
      row.amounts.set("Amount", amountCells[0].text);
      if (amountCells[1]) row.amounts.set("Balance", amountCells[1].text);
      row.currency = currencyOf(amountCells[0].text);
      row.hasAmount = true;
      rows.push(row);
    }
  }
  const useBalance = rows.some((r) => r.amounts.has("Balance"));
  return buildTable(rows, useBalance ? fake : [fake[0]], true);
}
