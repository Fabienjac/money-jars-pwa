// netlify/functions/_lib/tabular.js
// Lecture tolérante de fichiers bancaires : CSV (encodage / séparateur / lignes d'intro), feuilles Excel, OFX/QFX, QIF.
// Pas un handler Netlify (dossier _lib) : importé par analyzeFile.js.
const Papa = require("papaparse");

/** Décode un buffer : BOM UTF-8/16, UTF-8 strict, sinon Windows-1252 (exports de banques européennes). */
function decodeText(buffer, hintCharset) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer.subarray(2));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer.subarray(2));
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buffer.subarray(3));
  }
  if (!/^(utf-?8)$/i.test(hintCharset || "")) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      /* pas de l'UTF-8 valide */
    }
  }
  return new TextDecoder("windows-1252").decode(buffer);
}

const isBlank = (v) => v == null || String(v).trim() === "";
const looksNumeric = (v) => typeof v === "number" || /^[-+(]?[\d\s.,'’$€£¥]+[)]?$/.test(String(v).trim());
const looksDate = (v) => /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(String(v).trim());

/** Choisit le séparateur CSV en testant les candidats sur les premières lignes. */
function detectDelimiter(text) {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  for (const delimiter of candidates) {
    const parsed = Papa.parse(text, { delimiter, preview: 60, skipEmptyLines: true });
    const lengths = parsed.data.map((r) => r.length).filter((n) => n >= 2);
    if (!lengths.length) continue;
    const counts = {};
    for (const n of lengths) counts[n] = (counts[n] || 0) + 1;
    const [modalLen, modalCount] = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = modalCount * (Number(modalLen) >= 3 ? 1 : 0.5);
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
function tableFromMatrix(matrix) {
  const lines = matrix
    .map((r) => r.map((c) => (typeof c === "string" ? c.replace(/^﻿/, "").trim() : c)))
    .filter((r) => r.some((c) => !isBlank(c)));
  if (!lines.length) return { headers: [], rows: [] };

  const filled = (r) => r.filter((c) => !isBlank(c)).length;
  // L'en-tête est la première ligne « large » (≥ 75 % de la plus large) faite de libellés, suivie de données.
  const maxFilled = Math.max(...lines.slice(0, 80).map(filled));
  const findHeader = (minFilled) => {
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
  const seen = {};
  const headers = [];
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

  const rows = [];
  for (const r of lines.slice(headerIdx + 1)) {
    if (headers.length >= 3 && filled(r) <= 1) continue; // mention légale, ligne isolée…
    if (/^(total|totaux|subtotal|sous-total|summe|gesamt|totale|totales)\b/i.test(String(r[0] ?? "").trim())) continue;
    const obj = {};
    headers.forEach((h, j) => {
      obj[h] = r[j] == null ? "" : r[j];
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function parseCsvText(text) {
  const delimiter = detectDelimiter(text);
  const parsed = Papa.parse(text, { delimiter, skipEmptyLines: true });
  return { ...tableFromMatrix(parsed.data), delimiter };
}

const pad = (n) => String(n).padStart(2, "0");
function excelDateToISO(d) {
  const x = new Date(d.getTime() + 12 * 3600 * 1000); // absorbe les décalages de fuseau
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** Feuille Excel (matrice brute avec Date) → table. Les dates deviennent AAAA-MM-JJ. */
function tableFromSheetMatrix(matrix) {
  const clean = matrix.map((r) =>
    r.map((c) => (c instanceof Date && !isNaN(c.getTime()) ? excelDateToISO(c) : c))
  );
  return tableFromMatrix(clean);
}

// ───────────────────────────── OFX / QFX ─────────────────────────────

function ofxTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
}

function normalizeOfxAmount(raw) {
  let s = String(raw || "").replace(/\s/g, "");
  if (!s) return "";
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  return s;
}

function ofxDate(raw) {
  const m = String(raw || "").match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

function parseOFX(text) {
  const segments = [];
  const startRe = /<(STMTRS|CCSTMTRS)>/gi;
  const starts = [];
  let m;
  while ((m = startRe.exec(text))) starts.push(m.index);
  if (starts.length === 0) segments.push(text);
  else starts.forEach((s, i) => segments.push(text.slice(s, starts[i + 1] ?? text.length)));

  const globalCur = ofxTag(text, "CURDEF");
  const rows = [];
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

function cleanQifDate(raw) {
  let s = String(raw || "").replace(/\s+/g, "");
  s = s.replace(/'(\d{2})$/, (_m, yy) => `/${Number(yy) <= 69 ? "20" : "19"}${yy}`); // 3/15'26
  s = s.replace(/'(\d{4})$/, "/$1");
  return s;
}

function parseQIF(text) {
  const rows = [];
  let skipping = false;
  let rec = {};
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
    const value = line.slice(1);
    if (rec[code] == null) rec[code] = value;
  }
  flush();
  const headers = ["Date", "Description", "Amount", "Memo", "Category", "Reference"];
  return { headers, rows };
}

module.exports = {
  decodeText,
  detectDelimiter,
  tableFromMatrix,
  tableFromSheetMatrix,
  parseCsvText,
  parseOFX,
  parseQIF,
};
