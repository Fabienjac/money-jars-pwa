// netlify/functions/analyzeFile.js
// Analyse la structure d'un fichier et détecte les colonnes
const pdfParse = require("pdf-parse");
const Papa = require("papaparse");
const XLSX = require("xlsx");
const Busboy = require("busboy");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    console.log("📥 Analyzing file structure...");
    
    const { fileBuffer, format } = await parseMultipartWithBusboy(event);
    
    if (!fileBuffer || !format) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing file or format" }),
      };
    }

    console.log(`📄 File size: ${fileBuffer.length} bytes, format: ${format}`);

    let structure;

    switch (format) {
      case "pdf":
        structure = await analyzePDF(fileBuffer);
        break;
      case "csv":
        structure = analyzeCSV(fileBuffer);
        break;
      case "xlsx":
        structure = analyzeXLSX(fileBuffer);
        break;
      default:
        throw new Error(`Format non supporté: ${format}`);
    }

    console.log(`✅ Detected ${structure.headers.length} columns, ${structure.rows.length} rows`);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        format,
        structure,
      }),
    };
  } catch (error) {
    console.error("❌ Error analyzing file:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to analyze file",
        message: error.message,
      }),
    };
  }
};

/**
 * Analyse un CSV
 */
function analyzeCSV(buffer) {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    preview: 100, // Limiter à 100 lignes pour l'analyse
  });

  const headers = parsed.meta.fields || [];
  const rows = parsed.data;

  // Suggérer les mappings automatiquement
  const suggestedMappings = headers.map(header => ({
    sourceColumn: header,
    targetColumn: suggestMapping(header),
    confidence: calculateConfidence(header),
  }));

  return {
    headers,
    rows,
    preview: rows.slice(0, 5),
    suggestedMappings,
    totalRows: rows.length,
  };
}

/**
 * Analyse un XLSX
 */
function analyzeXLSX(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convertir en JSON avec header
  const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  
  if (data.length === 0) {
    throw new Error("Le fichier Excel est vide");
  }

  const headers = Object.keys(data[0]);
  const rows = data;

  const suggestedMappings = headers.map(header => ({
    sourceColumn: header,
    targetColumn: suggestMapping(header),
    confidence: calculateConfidence(header),
  }));

  return {
    headers,
    rows,
    preview: rows.slice(0, 5),
    suggestedMappings,
    totalRows: rows.length,
  };
}

/**
 * Analyse un PDF et tente d'extraire une structure tabulaire
 */
async function analyzePDF(buffer) {
  const parsed = await pdfParse(buffer);
  const text = parsed.text;

  console.log(`📝 PDF text length: ${text.length}`);

  // Essayer de détecter un format tabulaire
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);

  console.log(`📄 Total lines: ${lines.length}`);
  console.log(`📄 First 20 lines:`, lines.slice(0, 20));

  // Tentative 0: format Revolut FR (relevé "DateDescriptionArgent sortantArgent entrantSolde")
  const revolutRows = extractRevolutFrenchTransactions(lines);
  if (revolutRows.length > 0) {
    console.log(`✅ Revolut FR parser: ${revolutRows.length} transactions détectées`);
    return buildPdfStructure(revolutRows);
  }

  // Tentative 1: format compact "DateDescriptionTransaction Amount" (ex: Redotpay)
  const compactRows = extractCompactInlineTransactions(lines);
  if (compactRows.length > 0) {
    console.log(`✅ Compact inline parser: ${compactRows.length} transactions détectées`);
    return buildPdfStructure(compactRows);
  }

  // Patterns de détection (plus tolérants: Revolut, banques FR/EN, etc.)
  const monthMap = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    January: "01", February: "02", March: "03", April: "04", June: "06",
    July: "07", August: "08", September: "09", October: "10", November: "11", December: "12",
  };

  // Exemples: "May 26, 2025", "26 May 2025", "26/05/2025", "2025-05-26"
  const datePatterns = [
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(\d{4})\b/i,
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
    /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/,
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
  ];

  const amountCandidatesPatterns = [
    // EUR -12.34 / USD 12.34 / 12.34 EUR
    /(?:\b([A-Z]{3})\s*(-?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d{1,3})?)\b)|(?:\b(-?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d{1,3})?)\s*([A-Z]{3})\b)/,
    // -€12.34 / € -12.34 / 12.34€ / (£12.34)
    /(?:([-+()]?\s*)([€$£])\s*(\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d{1,3})?))|(?:([-+()]?\s*)(\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d{1,3})?)\s*([€$£]))/,
  ];
  const dataLines = [];
  
  // Stratégie 1 : Chercher les lignes qui ont TOUS les éléments (date, description, montant)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip les lignes d'en-tête connues
    if (line.includes("Date") && line.includes("Description") && line.includes("Transaction Amount")) {
      continue;
    }
    if (line.includes("Document Number") || line.includes("Statement Period") || line.includes("Card Number")) {
      continue;
    }

    const parsedDate = parseDateFromLine(line, datePatterns, monthMap);
    if (!parsedDate) continue;
    const { dateStr, normalizedDate } = parsedDate;

    // Chercher le montant dans cette ligne ou les 4 suivantes
    const searchLines = [line, lines[i + 1] || "", lines[i + 2] || "", lines[i + 3] || "", lines[i + 4] || ""];
    let amountMatch = null;
    let amountParsed = null;
    let descriptionText = "";
    let lineOffset = 0;

    for (let j = 0; j < searchLines.length; j++) {
      const candidateLine = searchLines[j];
      const candidateParsed = parseAmountFromLine(candidateLine, amountCandidatesPatterns);
      if (candidateParsed) {
        amountMatch = candidateParsed.matchedText;
        amountParsed = candidateParsed;
        lineOffset = j;
        break;
      }
    }

    if (!amountParsed || !amountMatch) {
      console.log(`⚠️ No amount found for date ${dateStr}`);
      continue;
    }

    const currency = amountParsed.currency;
    const amountWithSign = amountParsed.amountWithSign;
    const amount = Math.abs(amountWithSign);

    // Extraire la description
    if (lineOffset === 0) {
      // Tout sur la même ligne : Date Description Amount
      descriptionText = line
        .replace(dateStr, "")
        .replace(amountMatch, "")
        .trim()
        .replace(/\s+/g, " ");
    } else if (lineOffset === 1) {
      // Date sur ligne 1, Description+Amount sur ligne 2
      descriptionText = searchLines[1]
        .replace(amountMatch, "")
        .trim()
        .replace(/\s+/g, " ");
      i += 1;
    } else if (lineOffset === 2) {
      // Date / Description / Amount sur 3 lignes
      descriptionText = searchLines[1].trim();
      i += 2;
    }

    // Nettoyer la description
    descriptionText = descriptionText.trim();

    // Filtrer les lignes vides ou invalides
    if (!descriptionText || descriptionText.length < 2) {
      console.log(`⚠️ Invalid description for date ${dateStr}: "${descriptionText}"`);
      continue;
    }

    // Filtrer les descriptions qui ressemblent à des numéros de page
    if (descriptionText.match(/^\d+\/\d+$/)) {
      console.log(`⚠️ Skipping page number: ${descriptionText}`);
      continue;
    }
    if (/^(statement|balance|total|document number|statement period|card number)$/i.test(descriptionText)) {
      continue;
    }

    // ✅ FILTRER uniquement les crédits explicites (ex: +12.34, "credit"/"remboursement")
    if (amountWithSign > 0 && /(^|\s)\+|\bcredit\b|\bcrédit\b|\bremboursement\b/i.test(line)) {
      console.log(`⏭️  Skipping refund (positive amount): ${normalizedDate} | ${descriptionText} | +${amount} ${currency}`);
      continue;
    }

    if (amount > 0) {
      dataLines.push({
        Date: normalizedDate,
        Description: descriptionText,
        Amount: amount,
        Currency: currency,
        OriginalAmount: amountWithSign, // Ajouter le montant original avec signe
      });
      console.log(`✅ Transaction found: ${normalizedDate} | ${descriptionText} | ${amountWithSign} ${currency}`);
    }
  }

  console.log(`📊 PDF: ${dataLines.length} transactions détectées`);

  if (dataLines.length === 0) {
    throw new Error("Aucune transaction détectée dans le PDF. Le format pourrait ne pas être supporté.");
  }

  return buildPdfStructure(dataLines);
}

function parseDateFromLine(line, datePatterns, monthMap) {
  for (const pattern of datePatterns) {
    const match = line.match(pattern);
    if (!match) continue;

    const dateStr = match[0];
    let year;
    let month;
    let day;

    // May 26, 2025
    if (pattern === datePatterns[0]) {
      month = monthMap[capitalize(match[1])] || monthMap[match[1]];
      day = match[2].padStart(2, "0");
      year = match[3];
    }
    // 26 May 2025
    else if (pattern === datePatterns[1]) {
      day = match[1].padStart(2, "0");
      month = monthMap[capitalize(match[2])] || monthMap[match[2]];
      year = match[3];
    }
    // 26/05/2025
    else if (pattern === datePatterns[2]) {
      day = match[1].padStart(2, "0");
      month = match[2].padStart(2, "0");
      year = match[3];
    }
    // 2025-05-26
    else {
      year = match[1];
      month = match[2];
      day = match[3];
    }

    if (!year || !month || !day) continue;
    return {
      dateStr,
      normalizedDate: `${year}-${month}-${day}`,
    };
  }
  return null;
}

function parseAmountFromLine(line, patterns) {
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (!match) continue;

    // Pattern 1: code devise (EUR -12.34 / -12.34 EUR)
    if (pattern === patterns[0]) {
      const currency = match[1] || match[4];
      const amountText = match[2] || match[3];
      const amountWithSign = normalizeSignedAmount(amountText, line);
      if (isNaN(amountWithSign)) continue;
      return { currency, amountWithSign, matchedText: match[0] };
    }

    // Pattern 2: symbole devise
    const symbol = match[2] || match[6];
    const amountText = match[3] || match[5];
    const currency = symbolToCurrency(symbol);
    const amountWithSign = normalizeSignedAmount(amountText, line);
    if (isNaN(amountWithSign)) continue;
    return { currency, amountWithSign, matchedText: match[0] };
  }
  return null;
}

function normalizeSignedAmount(amountText, fullLine) {
  const normalized = String(amountText).replace(/ /g, "").replace(/,/g, ".");
  let value = parseFloat(normalized.replace(/[^\d.-]/g, ""));
  if (isNaN(value)) return NaN;

  // Détection signe sur la ligne complète
  if (/\(\s*[-+€$£]?\s*[\d.,]+\s*\)/.test(fullLine) || /\bdebit\b/i.test(fullLine) || /\bcard payment\b/i.test(fullLine)) {
    value = -Math.abs(value);
  }
  if (/-\s*[€$£]?\s*[\d.,]+/.test(fullLine)) {
    value = -Math.abs(value);
  }

  return value;
}

function symbolToCurrency(symbol) {
  if (symbol === "€") return "EUR";
  if (symbol === "$") return "USD";
  if (symbol === "£") return "GBP";
  return "EUR";
}

function capitalize(value) {
  if (!value || typeof value !== "string") return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function buildPdfStructure(rows) {
  const headers = ["Date", "Description", "Amount", "Currency"];
  const suggestedMappings = [
    { sourceColumn: "Date", targetColumn: "Date", confidence: 1.0 },
    { sourceColumn: "Description", targetColumn: "Description", confidence: 1.0 },
    { sourceColumn: "Amount", targetColumn: "Amount", confidence: 1.0 },
    { sourceColumn: "Currency", targetColumn: "Currency", confidence: 1.0 },
  ];
  return {
    headers,
    rows,
    preview: rows.slice(0, 5),
    suggestedMappings,
    totalRows: rows.length,
  };
}

function extractRevolutFrenchTransactions(lines) {
  const monthMapFr = {
    janvier: "01",
    fevrier: "02",
    février: "02",
    mars: "03",
    avril: "04",
    mai: "05",
    juin: "06",
    juillet: "07",
    aout: "08",
    août: "08",
    septembre: "09",
    octobre: "10",
    novembre: "11",
    decembre: "12",
    décembre: "12",
  };

  const rows = [];
  let inTransactionsSection = false;

  for (const line of lines) {
    if (/^Transactions du compte/i.test(line) || /DateDescriptionArgent sortantArgent entrantSolde/i.test(line)) {
      inTransactionsSection = true;
      continue;
    }
    if (!inTransactionsSection) continue;
    if (/^IBAN$/i.test(line) || /^BIC$/i.test(line)) {
      inTransactionsSection = false;
      continue;
    }
    if (/^À :|^Carte :|^Référence :|^De :/i.test(line)) {
      continue;
    }

    // Exemple: "3 mars 2026Carrefour52,55€3095,30€"
    const m = line.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})(.+)$/);
    if (!m) continue;

    const day = m[1].padStart(2, "0");
    const monthRaw = m[2].toLowerCase();
    const year = m[3];
    const rest = (m[4] || "").trim();
    const month = monthMapFr[monthRaw];
    if (!month || !rest) continue;

    const amountRegex = /(\d{1,3}(?:[ \u00A0]\d{3})*,\d{2})€/g;
    const amountMatches = Array.from(rest.matchAll(amountRegex));
    if (amountMatches.length < 2) continue;

    const firstAmount = amountMatches[0];
    const description = rest.slice(0, firstAmount.index).trim().replace(/\s+/g, " ");
    if (!description) continue;

    const isIncoming = /\bVirement de\b/i.test(description);
    if (isIncoming) {
      // Import "dépenses": on ignore les crédits entrants
      continue;
    }

    const amountText = firstAmount[1].replace(/[ \u00A0]/g, "").replace(",", ".");
    const amount = parseFloat(amountText);
    if (!isFinite(amount) || amount <= 0) continue;

    rows.push({
      Date: `${year}-${month}-${day}`,
      Description: description,
      Amount: amount,
      Currency: "EUR",
      OriginalAmount: -amount,
    });
  }

  return rows;
}

function extractCompactInlineTransactions(lines) {
  const monthMapEn = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const rows = [];

  for (const line of lines) {
    // Exemple: "Mar 22, 2026AMZN Mktp FR-82.90 EUR"
    const m = line.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})(.+?)([-+]?\d{1,3}(?:[ ,]\d{3})*(?:\.\d{1,2})?)\s*([A-Z]{3})$/);
    if (!m) continue;

    const month = monthMapEn[m[1]];
    const day = String(m[2]).padStart(2, "0");
    const year = m[3];
    const rawDescription = (m[4] || "").trim();
    const amountText = m[5];
    const currency = m[6];

    if (!month || !rawDescription || !amountText || !currency) continue;

    const amountWithSign = parseFloat(String(amountText).replace(/ /g, "").replace(/,/g, ""));
    if (!isFinite(amountWithSign)) continue;

    const amount = Math.abs(amountWithSign);
    if (amount <= 0) continue;

    // On nettoie la description; ce format peut coller des segments sans espace.
    const description = rawDescription.replace(/\s+/g, " ").trim();
    if (!description || /^DateDescriptionTransaction Amount$/i.test(description)) continue;

    rows.push({
      Date: `${year}-${month}-${day}`,
      Description: description,
      Amount: amount,
      Currency: currency,
      OriginalAmount: amountWithSign,
    });
  }

  return rows;
}

/**
 * Suggère un mapping automatique
 */
function suggestMapping(sourceColumn) {
  const col = sourceColumn.toLowerCase();

  // Date
  if (col.includes("date") || col.includes("datum") || col === "date de début" || col === "date de fin") {
    return "Date";
  }

  // Description
  if (col.includes("description") || col.includes("libellé") || col.includes("libelle") ||
      col.includes("label") || col.includes("merchant") || col.includes("détails")) {
    return "Description";
  }

  // Montant
  if (col.includes("montant") || col.includes("amount") || col.includes("sum") || 
      col.includes("total") || col.includes("valeur")) {
    return "Amount";
  }

  // Devise
  if (col.includes("devise") || col.includes("currency") || col.includes("ccy")) {
    return "Currency";
  }

  // Compte
  if (col.includes("compte") || col.includes("account") || col.includes("produit") || col.includes("card")) {
    return "AccountColumn";
  }

  // Type
  if (col.includes("type") || col.includes("catégorie") || col.includes("category")) {
    return "Type";
  }

  return "ignore";
}

/**
 * Calcule la confiance du mapping (0-1)
 */
function calculateConfidence(sourceColumn) {
  const col = sourceColumn.toLowerCase();
  
  // Confiance très haute (0.95-1.0)
  if (col === "date" || col === "description" || col === "montant" || col === "amount") {
    return 1.0;
  }

  // Confiance haute (0.8-0.95)
  if (col.includes("date") || col.includes("description") || col.includes("montant") || col.includes("amount")) {
    return 0.9;
  }

  // Confiance moyenne (0.6-0.8)
  if (col.includes("devise") || col.includes("currency") || col.includes("compte") || col.includes("account")) {
    return 0.75;
  }

  // Confiance basse (0-0.6)
  return 0.3;
}

/**
 * Parse multipart avec busboy
 */
function parseMultipartWithBusboy(event) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: {
        "content-type": event.headers["content-type"],
      },
    });

    let fileBuffer = null;
    let format = null;

    busboy.on("file", (fieldname, file, info) => {
      const chunks = [];
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on("field", (fieldname, value) => {
      if (fieldname === "format") {
        format = value;
      }
    });

    busboy.on("finish", () => {
      resolve({ fileBuffer, format });
    });

    busboy.on("error", (error) => {
      reject(error);
    });

    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body, "utf-8");

    busboy.write(bodyBuffer);
    busboy.end();
  });
}
