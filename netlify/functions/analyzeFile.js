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

  // Patterns de détection
  const datePattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/;
  const amountWithCurrencyPattern = /(-?\d{1,3}(?:[,]\d{3})*(?:\.\d{2}))\s+(EUR|USD|AUD|GBP|CAD|CHF|THB|CNY|JPY)/;

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

    const dateMatch = line.match(datePattern);
    if (!dateMatch) continue;

    const dateStr = dateMatch[0];

    // Normaliser la date
    const [month, day, year] = dateMatch.slice(1);
    const monthMap = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };
    const normalizedDate = `${year}-${monthMap[month]}-${day.padStart(2, "0")}`;

    // Chercher le montant dans cette ligne ou les 2 suivantes
    const searchLines = [line, lines[i + 1] || "", lines[i + 2] || ""];
    let amountMatch = null;
    let descriptionText = "";
    let lineOffset = 0;

    for (let j = 0; j < searchLines.length; j++) {
      amountMatch = searchLines[j].match(amountWithCurrencyPattern);
      if (amountMatch) {
        lineOffset = j;
        break;
      }
    }

    if (!amountMatch) {
      console.log(`⚠️ No amount found for date ${dateStr}`);
      continue;
    }

    const amountText = amountMatch[1];
    const currency = amountMatch[2];
    const amount = Math.abs(parseFloat(amountText.replace(",", "")));

    // Extraire la description
    if (lineOffset === 0) {
      // Tout sur la même ligne : Date Description Amount
      descriptionText = line
        .replace(dateStr, "")
        .replace(amountMatch[0], "")
        .trim()
        .replace(/\s+/g, " ");
    } else if (lineOffset === 1) {
      // Date sur ligne 1, Description+Amount sur ligne 2
      descriptionText = searchLines[1]
        .replace(amountMatch[0], "")
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

    if (amount > 0) {
      dataLines.push({
        Date: normalizedDate,
        Description: descriptionText,
        Amount: amount,
        Currency: currency,
      });
      console.log(`✅ Transaction found: ${normalizedDate} | ${descriptionText} | ${amount} ${currency}`);
    }
  }

  console.log(`📊 PDF: ${dataLines.length} transactions détectées`);

  if (dataLines.length === 0) {
    throw new Error("Aucune transaction détectée dans le PDF. Le format pourrait ne pas être supporté.");
  }

  // Construire la structure
  const headers = ["Date", "Description", "Amount", "Currency"];
  const rows = dataLines;

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
