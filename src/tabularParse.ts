// src/tabularParse.ts
// Lecture locale (dans le navigateur) des fichiers bancaires : CSV (encodage / séparateur / lignes d'intro),
// feuilles Excel, OFX/QFX, QIF. Rien n'est envoyé à un serveur.
import Papa from "papaparse";
import type { Row } from "./importNormalize";

export type TabularFormat = "csv" | "xlsx" | "ofx" | "qif";
export interface Table {
  headers: string[];
  rows: Row[];
  /** indices de lecture propres au format (ex. QIF → dates MM/JJ) */
  hints: { dateOrder?: "DMY" | "MDY" | "YMD" };
}

type Cell = string | number | null | undefined;

/** Décode un fichier : BOM UTF-8/16, UTF-8 strict, sinon Windows-1252 (exports de banques européennes). */
export function decodeText(buffer: Uint8Array, hintCharset = ""): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return new TextDecoder("utf-16le").decode(buffer.subarray(2));
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return new TextDecoder("utf-16be").decode(buffer.subarray(2));
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buffer.subarray(3));
  }
  if (!/^utf-?8$/i.test(hintCharset)) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      /* pas de l'UTF-8 valide */
    }
  }
  return new TextDecoder("windows-1252").decode(buffer);
}

const isBlank = (v: unknown) => v == null || String(v).trim() === "";
const looksNumeric = (v: unknown) => typeof v === "number" || /^[-+(]?[\d\s.,'’$€£¥]+[)]?$/.test(String(v).trim());
const looksDate = (v: unknown) => /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(String(v).trim());

/** Choisit le séparateur CSV en testant les candidats sur les premières lignes. */
export function detectDelimiter(text: string): string {
  let best = ",";
  let bestScore = -1;
  for (const delimiter of [",", ";", "\t", "|"]) {
    const parsed = Papa.parse<string[]>(text, { delimiter, preview: 60, skipEmptyLines: true });
    const lengths = parsed.data.map((r) => r.length).filter((n) => n >= 2);
    if (!lengths.length) continue;
    const counts: Record<number, number> = {};
    for (const n of lengths) counts[n] = (counts[n] || 0) + 1;
    const [modalLen, modalCount] = Object.entries(counts)
      .map(([len, count]) => [Number(len), count] as const)
      .sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = modalCount * (modalLen >= 3 ? 1 : 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/**
 * Transforme une matrice de cellules en { headers, rows } :
 * saute les lignes d'introduction et de pied de page, nomme les colonnes vides ou en double.
 */
export function tableFromMatrix(matrix: Cell[][]): { headers: string[]; rows: Row[] } {
  const lines = matrix
    .map((r) => r.map((c) => (typeof c === "string" ? c.replace(/^﻿/, "").trim() : c)))
    .filter((r) => r.some((c) => !isBlank(c)));
  if (!lines.length) return { headers: [], rows: [] };

  const filled = (r: Cell[]) => r.filter((c) => !isBlank(c)).length;

  // L'en-tête est la première ligne « large » (≥ 75 % de la plus large) faite de libellés, suivie de données.
  const maxFilled = Math.max(...lines.slice(0, 80).map(filled));
  const findHeader = (minFilled: number) => {
    for (let i = 0; i < Math.min(lines.length - 1, 60); i++) {
      const row = lines[i];
      const n = filled(row);
      if (n < minFilled) continue;
      const numeric = row.filter((c) => !isBlank(c) && (looksNumeric(c) || looksDate(c))).length;
      if (numeric > 1) continue;
      if (filled(lines[i + 1]) >= Math.max(2, Math.floor(n * 0.5))) return i;
    }
    return -1;
  };
  let headerIdx = findHeader(Math.max(2, Math.ceil(maxFilled * 0.75)));
  if (headerIdx < 0) headerIdx = findHeader(2);
  if (headerIdx < 0) headerIdx = 0;

  const headerRow = lines[headerIdx];
  let width = headerRow.length;
  while (width > 0 && isBlank(headerRow[width - 1])) width--;
  const seen: Record<string, number> = {};
  const headers: string[] = [];
  for (let j = 0; j < width; j++) {
    let name = isBlank(headerRow[j]) ? `Column ${j + 1}` : String(headerRow[j]).trim();
    if (seen[name]) {
      seen[name]++;
      name = `${name} (${seen[name]})`;
    } else {
      seen[name] = 1;
    }
    headers.push(name);
  }

  const rows: Row[] = [];
  for (const r of lines.slice(headerIdx + 1)) {
    if (headers.length >= 3 && filled(r) <= 1) continue; // mention légale, ligne isolée…
    if (/^(total|totaux|subtotal|sous-total|summe|gesamt|totale|totales)\b/i.test(String(r[0] ?? "").trim())) continue;
    const obj: Row = {};
    headers.forEach((h, j) => {
      obj[h] = r[j] == null ? "" : r[j];
    });
    rows.push(obj);
  }
  return { headers, rows };
}

export function parseCsvText(text: string) {
  const delimiter = detectDelimiter(text);
  const parsed = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true });
  return { ...tableFromMatrix(parsed.data), delimiter };
}

const pad = (n: number) => String(n).padStart(2, "0");
function dateToISO(d: Date): string {
  const x = new Date(d.getTime() + 12 * 3600 * 1000); // absorbe les décalages de fuseau
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** Feuille Excel (matrice brute avec Date) → table. Les dates deviennent AAAA-MM-JJ. */
export function tableFromSheetMatrix(matrix: Cell[][] | (Cell | Date)[][]) {
  const clean = (matrix as (Cell | Date)[][]).map((r) =>
    r.map((c) => (c instanceof Date && !isNaN(c.getTime()) ? dateToISO(c) : (c as Cell)))
  );
  return tableFromMatrix(clean);
}

// ───────────────────────────── OFX / QFX ─────────────────────────────

function ofxTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
}

function normalizeOfxAmount(raw: string): string {
  let s = String(raw || "").replace(/\s/g, "");
  if (!s) return "";
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  return s;
}

function ofxDate(raw: string): string {
  const m = String(raw || "").match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

export function parseOFX(text: string) {
  const starts: number[] = [];
  const startRe = /<(STMTRS|CCSTMTRS)>/gi;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(text))) starts.push(m.index);
  const segments = starts.length === 0 ? [text] : starts.map((s, i) => text.slice(s, starts[i + 1] ?? text.length));

  const globalCur = ofxTag(text, "CURDEF");
  const rows: Row[] = [];
  for (const seg of segments) {
    const currency = ofxTag(seg, "CURDEF") || globalCur;
    const acct = ofxTag(seg, "ACCTID");
    const account = acct ? `••${acct.slice(-4)}` : "";
    const blocks = seg.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/STMTRS>|<\/CCSTMTRS>|$)/gi) || [];
    for (const b of blocks) {
      const name = ofxTag(b, "NAME") || ofxTag(b, "PAYEE");
      const memo = ofxTag(b, "MEMO");
      rows.push({
        Date: ofxDate(ofxTag(b, "DTPOSTED") || ofxTag(b, "DTUSER")),
        Description: name || memo,
        Amount: normalizeOfxAmount(ofxTag(b, "TRNAMT")),
        Currency: ofxTag(b, "CURSYM") || currency,
        Memo: name && memo && memo !== name ? memo : "",
        Type: ofxTag(b, "TRNTYPE"),
        Reference: ofxTag(b, "FITID"),
        Account: account,
      });
    }
  }
  const headers = ["Date", "Description", "Amount", "Currency", "Memo", "Type", "Reference", "Account"];
  return { headers, rows: rows.filter((r) => r.Date || r.Amount) };
}

// ───────────────────────────── QIF ─────────────────────────────

const QIF_SKIP_TYPES = /^(class|cat|memorized|payee|tag|security|prices|template)$/i;

function cleanQifDate(raw: string | undefined): string {
  let s = String(raw || "").replace(/\s+/g, "");
  s = s.replace(/'(\d{2})$/, (_m, yy: string) => `/${Number(yy) <= 69 ? "20" : "19"}${yy}`); // 3/15'26
  s = s.replace(/'(\d{4})$/, "/$1");
  return s;
}

export function parseQIF(text: string) {
  const rows: Row[] = [];
  let skipping = false;
  let rec: Record<string, string> = {};
  const flush = () => {
    if (rec.T != null || rec.D != null) {
      rows.push({
        Date: cleanQifDate(rec.D),
        Description: rec.P || rec.M || "",
        Amount: String(rec.T ?? rec.U ?? "").trim(),
        Memo: rec.P && rec.M && rec.M !== rec.P ? rec.M : "",
        Category: rec.L || "",
        Reference: rec.N || "",
      });
    }
    rec = {};
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("!")) {
      flush();
      const type = line.match(/^!Type:(.*)$/i);
      skipping = type ? QIF_SKIP_TYPES.test(type[1].trim()) : /^!(Option|Clear|Account)/i.test(line);
      continue;
    }
    if (skipping) continue;
    if (line === "^") {
      flush();
      continue;
    }
    const code = line[0];
    if (rec[code] == null) rec[code] = line.slice(1);
  }
  flush();
  const headers = ["Date", "Description", "Amount", "Memo", "Category", "Reference"];
  return { headers, rows };
}

// ───────────────────────────── Fichier → table ─────────────────────────────

function requireRows(t: { headers: string[]; rows: Row[] }) {
  if (!t.headers.length || !t.rows.length) throw new Error("EMPTY_FILE");
  return t;
}

/** Lit un fichier CSV / XLSX / OFX / QIF dans le navigateur. Lève Error("EMPTY_FILE") s'il n'y a rien à importer. */
export async function readTabularFile(file: File, format: TabularFormat): Promise<Table> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (format === "csv") {
    return { ...requireRows(parseCsvText(decodeText(bytes))), hints: {} };
  }

  if (format === "ofx") {
    const charset = (new TextDecoder("latin1").decode(bytes.subarray(0, 600)).match(/CHARSET:\s*(\w+)/i) || [])[1];
    const text = decodeText(bytes, charset === "1252" ? "windows-1252" : "");
    return { ...requireRows(parseOFX(text)), hints: { dateOrder: "YMD" } };
  }

  if (format === "qif") {
    return { ...requireRows(parseQIF(decodeText(bytes))), hints: { dateOrder: "MDY" } };
  }

  // xlsx : bibliothèque chargée à la demande
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  for (const name of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<(Cell | Date)[]>(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    });
    const table = tableFromSheetMatrix(matrix);
    if (table.headers.length && table.rows.length) return { ...table, hints: {} };
  }
  throw new Error("EMPTY_FILE");
}
