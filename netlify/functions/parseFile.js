// netlify/functions/parseFile.js - Version COMPLETE avec devises + Revolut
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
    console.log("📥 Received request");
    
    // Parser le multipart avec busboy
    const { fileBuffer, format } = await parseMultipartWithBusboy(event);
    
    if (!fileBuffer || !format) {
      console.error("❌ Missing file or format");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing file or format" }),
      };
    }

    console.log(`📄 File size: ${fileBuffer.length} bytes`);
    console.log(`📋 Format: ${format}`);

    let transactions = [];

    // Parser selon le format
    switch (format) {
      case "pdf":
        console.log("🔍 Parsing PDF...");
        transactions = await parsePDFFile(fileBuffer);
        break;
      case "csv":
        console.log("🔍 Parsing CSV...");
        transactions = parseCSVFile(fileBuffer);
        break;
      case "xlsx":
        console.log("🔍 Parsing XLSX...");
        transactions = parseXLSXFile(fileBuffer);
        break;
      default:
        throw new Error(`Format non supporté: ${format}`);
    }

    console.log(`✅ Parsed ${transactions.length} transactions`);

    // Convertir les devises en EUR
    console.log("💱 Converting currencies to EUR...");
    const transactionsWithConversion = await convertCurrenciesToEUR(transactions);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        format,
        transactions: transactionsWithConversion,
        count: transactionsWithConversion.length,
      }),
    };
  } catch (error) {
    console.error("❌ Error parsing file:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to parse file",
        message: error.message,
        stack: error.stack,
      }),
    };
  }
};

/**
 * Parse multipart/form-data avec busboy
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

    // Netlify envoie le body en base64 pour les fonctions
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body, "utf-8");

    busboy.write(bodyBuffer);
    busboy.end();
  });
}

/**
 * Convertit toutes les transactions en EUR avec taux historiques
 */
async function convertCurrenciesToEUR(transactions) {
  const converted = [];

  for (const transaction of transactions) {
    if (transaction.currency === "EUR") {
      // Déjà en EUR
      converted.push({
        ...transaction,
        originalAmount: transaction.amount,
        originalCurrency: "EUR",
        conversionRate: 1,
        conversionNote: null,
      });
    } else {
      // Conversion nécessaire
      try {
        const rate = await getHistoricalRate(
          transaction.currency,
          "EUR",
          transaction.date
        );

        const convertedAmount = transaction.amount * rate;

        console.log(
          `💱 ${transaction.amount} ${transaction.currency} → ${convertedAmount.toFixed(2)} EUR (rate: ${rate})`
        );

        converted.push({
          ...transaction,
          amount: parseFloat(convertedAmount.toFixed(2)),
          currency: "EUR",
          originalAmount: transaction.amount,
          originalCurrency: transaction.currency,
          conversionRate: rate,
          conversionNote: `Converti de ${transaction.amount} ${transaction.currency} au taux de ${rate.toFixed(4)}`,
        });
      } catch (error) {
        console.error(
          `❌ Failed to convert ${transaction.currency} for date ${transaction.date}:`,
          error.message
        );

        // En cas d'erreur, on garde le montant original avec un warning
        converted.push({
          ...transaction,
          originalAmount: transaction.amount,
          originalCurrency: transaction.currency,
          conversionRate: null,
          conversionNote: `⚠️ Conversion échouée - Montant en ${transaction.currency}`,
        });
      }
    }
  }

  return converted;
}

/**
 * Récupère le taux de change historique via frankfurter.app
 */
async function getHistoricalRate(fromCurrency, toCurrency, date) {
  const url = `https://api.frankfurter.app/${date}?from=${fromCurrency}&to=${toCurrency}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const data = await response.json();

  if (!data.rates || !data.rates[toCurrency]) {
    throw new Error(`No rate found for ${fromCurrency} → ${toCurrency}`);
  }

  return data.rates[toCurrency];
}

/**
 * Parse un fichier PDF
 */
async function parsePDFFile(buffer) {
  const parsed = await pdfParse(buffer);
  const text = parsed.text;

  console.log(`📝 Extracted text length: ${text.length}`);
  console.log(`📝 First 200 chars: ${text.substring(0, 200)}`);

  // Détecter le type de banque
  if (text.includes("RedotPay") || text.includes("REDOTPAY")) {
    console.log("🏦 Detected: RedotPay");
    return parseRedotPayTransactions(text);
  } else if (text.includes("N26") || text.includes("n26")) {
    console.log("🏦 Detected: N26");
    return parseN26Transactions(text);
  } else {
    console.log("🏦 Detected: Generic PDF (using N26 parser)");
    return parseGenericPDFTransactions(text);
  }
}

/**
 * Parse CSV avec support Revolut
 */
function parseCSVFile(buffer) {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  const transactions = [];

  // Détecter si c'est un CSV Revolut
  const isRevolut = parsed.meta.fields?.some(
    field => field === "Produit" || field === "Type" || field === "État"
  );

  for (const row of parsed.data) {
    // Support Revolut + formats standard
    const date =
      row.Date ||
      row.date ||
      row.DATE ||
      row["Date de début"] ||
      row["Date de fin"] ||
      "";
    
    const description =
      row.Description ||
      row.description ||
      row.Libellé ||
      "";
    
    const amountStr =
      row.Montant ||
      row.montant ||
      row.Amount ||
      row.amount ||
      "";
    
    // Pour Revolut, toujours utiliser "Revolut" comme compte
    const account = isRevolut 
      ? "Revolut"
      : (row.Compte || row.Account || row.Produit || "");

    if (!date || !amountStr) continue;

    let amount = parseFloat(
      amountStr.toString().replace(",", ".").replace(/[^\d.-]/g, "")
    );
    if (isNaN(amount)) continue;
    amount = Math.abs(amount);

    // Parser la date avec support timestamp Revolut
    let dateISO = "";
    if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateISO = date;
    } else if (date.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/)) {
      // Timestamp Revolut
      dateISO = date.split(" ")[0];
    } else if (date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [day, month, year] = date.split("/");
      dateISO = `${year}-${month}-${day}`;
    }

    if (!dateISO || !description) continue;

    transactions.push({
      date: dateISO,
      description: description.trim(),
      amount,
      currency: "EUR",
      suggestedJar: suggestJar(description),
      suggestedAccount: account || "Imported",
    });
  }

  return transactions;
}

/**
 * Parse XLSX
 */
function parseXLSXFile(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const transactions = [];

  for (const row of rows) {
    const date = row.Date || row.date || "";
    const description = row.Description || row.description || row.Libellé || "";
    const amountValue = row.Montant || row.montant || row.Amount || "";
    const account = row.Compte || row.Account || "";

    if (!date || !amountValue) continue;

    let amount = typeof amountValue === "number" ? amountValue : parseFloat(
      amountValue.toString().replace(",", ".").replace(/[^\d.-]/g, "")
    );
    if (isNaN(amount)) continue;
    amount = Math.abs(amount);

    let dateISO = "";
    if (typeof date === "number") {
      const d = XLSX.SSF.parse_date_code(date);
      dateISO = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    } else {
      const dateStr = date.toString();
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        dateISO = dateStr;
      } else if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = dateStr.split("/");
        dateISO = `${year}-${month}-${day}`;
      }
    }

    if (!dateISO || !description) continue;

    transactions.push({
      date: dateISO,
      description: description.toString().trim(),
      amount,
      currency: "EUR",
      suggestedJar: suggestJar(description.toString()),
      suggestedAccount: account.toString() || "Imported",
    });
  }

  return transactions;
}

/**
 * Parse RedotPay transactions
 */
function parseRedotPayTransactions(text) {
  const transactions = [];
  const lines = text.split("\n");

  console.log(`🔍 RedotPay: Parsing ${lines.length} lines`);

  const dateRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/;
  const amountRegex = /(-?\d{1,3}(?:[,]\d{3})*(?:\.\d{2}))\s+(EUR|USD|AUD|GBP|CAD|CHF)/;

  let dateMatches = 0;
  let amountMatches = 0;
  let validTransactions = 0;

  for (const line of lines) {
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;
    
    dateMatches++;

    const month = dateMatch[1];
    const day = dateMatch[2].padStart(2, "0");
    const year = dateMatch[3];

    const monthMap = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04",
      May: "05", Jun: "06", Jul: "07", Aug: "08",
      Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };
    const monthNum = monthMap[month];
    const dateISO = `${year}-${monthNum}-${day}`;

    const amountMatch = line.match(amountRegex);
    if (!amountMatch) {
      console.log(`⚠️ Date found but no amount on line: ${line.substring(0, 100)}`);
      continue;
    }
    
    amountMatches++;

    const amount = Math.abs(parseFloat(amountMatch[1].replace(",", "")));
    const currency = amountMatch[2];

    const description = line
      .replace(dateMatch[0], "")
      .replace(amountMatch[0], "")
      .trim()
      .replace(/\s+/g, " ");

    if (amount > 0 && description) {
      validTransactions++;
      transactions.push({
        date: dateISO,
        description,
        amount,
        currency,
        suggestedJar: suggestJar(description),
        suggestedAccount: "RedotPay",
      });
    } else {
      console.log(`⚠️ Invalid transaction: amount=${amount}, description="${description}"`);
    }
  }

  console.log(`📊 RedotPay stats: ${dateMatches} dates found, ${amountMatches} amounts found, ${validTransactions} valid transactions`);

  return transactions;
}

/**
 * Parse N26 PDF
 */
function parseN26Transactions(text) {
  const transactions = [];
  const lines = text.split("\n");

  const dateRegex = /(\d{2})[.\/](\d{2})[.\/](\d{4})/;
  const amountRegex = /(-?\d+[.,]\d{2})\s*€?/;

  for (const line of lines) {
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;

    const day = dateMatch[1];
    const month = dateMatch[2];
    const year = dateMatch[3];
    const dateISO = `${year}-${month}-${day}`;

    const amountMatch = line.match(amountRegex);
    if (!amountMatch) continue;

    const amount = Math.abs(parseFloat(amountMatch[1].replace(",", ".")));

    const description = line
      .replace(dateMatch[0], "")
      .replace(amountMatch[0], "")
      .trim()
      .replace(/\s+/g, " ");

    if (amount > 0 && description) {
      transactions.push({
        date: dateISO,
        description,
        amount,
        currency: "EUR",
        suggestedJar: suggestJar(description),
        suggestedAccount: "N26",
      });
    }
  }

  return transactions;
}

/**
 * Parse générique
 */
function parseGenericPDFTransactions(text) {
  return parseN26Transactions(text);
}

/**
 * Suggère une jarre
 */
function suggestJar(description) {
  const desc = description.toLowerCase();

  const rules = {
    NEC: [
      "pharmacie", "gal", "intermarche", "semello", "cevennalgues",
      "phytonut", "nutreine", "garcon", "carrefour", "lidl", "free",
      "biovie", "zencleanz",
    ],
    PLAY: [
      "airbnb", "booking", "hotel", "trip", "kiwi", "yanssie",
      "restaurant", "cinema", "netflix", "ryanair", "air france",
      "sncf", "vinci", "rompetrol", "canal",
    ],
    EDUC: ["success resources", "formation", "udemy"],
    GIFT: ["gofundme", "don", "charity", "soul travel"],
  };

  for (const [jar, keywords] of Object.entries(rules)) {
    if (keywords.some((keyword) => desc.includes(keyword))) {
      return jar;
    }
  }

  return "NEC";
}
