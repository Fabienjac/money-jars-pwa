// netlify/functions/parseFile.js - Avec conversion automatique des devises
const pdfParse = require("pdf-parse");

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

    // Décoder le body
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body, "binary");

    // Parser le multipart
    const { fileBuffer, format } = extractFileFromMultipart(bodyBuffer, event.headers["content-type"]);

    if (!fileBuffer) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No file found" }),
      };
    }

    console.log("📄 File buffer size:", fileBuffer.length);

    // Parser le PDF
    if (format !== "pdf") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Only PDF format supported for now" }),
      };
    }

    console.log("🔍 Parsing PDF...");
    const pdfData = await pdfParse(fileBuffer);
    const text = pdfData.text;
    
    console.log("📝 Extracted text length:", text.length);

    // Parser RedotPay
    const transactions = parseRedotPayTransactions(text);
    
    console.log("✅ Parsed transactions:", transactions.length);

    // Convertir toutes les devises en EUR
    console.log("💱 Converting currencies to EUR...");
    const transactionsWithConversion = await convertCurrenciesToEUR(transactions);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        format,
        transactions: transactionsWithConversion,
        count: transactionsWithConversion.length,
      }),
    };
  } catch (error) {
    console.error("❌ Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to parse file",
        message: error.message,
        stack: error.stack,
      }),
    };
  }
};

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
          conversionNote: `Converti de ${transaction.originalAmount} ${transaction.currency} au taux de ${rate.toFixed(4)}`,
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
 * Récupère le taux de change historique via frankfurter.app (gratuit, open source)
 */
async function getHistoricalRate(fromCurrency, toCurrency, date) {
  // API gratuite et fiable : https://www.frankfurter.app/
  const url = `https://api.frankfurter.app/${date}?from=${fromCurrency}&to=${toCurrency}`;

  console.log(`📡 Fetching rate from ${url}`);

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
 * Extrait le fichier du multipart
 */
function extractFileFromMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(.+)/);
  if (!boundaryMatch) {
    return { fileBuffer: null, format: null };
  }

  const boundary = boundaryMatch[1].trim();
  const bufferStr = buffer.toString("binary");

  const parts = bufferStr.split(`--${boundary}`);
  
  let fileBuffer = null;
  let format = null;

  for (const part of parts) {
    if (part.includes('name="format"')) {
      const formatMatch = part.match(/\r\n\r\n(.+?)\r\n/);
      if (formatMatch) {
        format = formatMatch[1].trim();
      }
    }

    if (part.includes('name="file"') && part.includes("filename=")) {
      const headerEnd = part.indexOf("\r\n\r\n");
      if (headerEnd === -1) continue;

      const dataStart = headerEnd + 4;
      const dataEnd = part.lastIndexOf("\r\n");
      
      if (dataStart < dataEnd) {
        const fileData = part.substring(dataStart, dataEnd);
        fileBuffer = Buffer.from(fileData, "binary");
      }
    }
  }

  return { fileBuffer, format };
}

/**
 * Parse RedotPay transactions
 */
function parseRedotPayTransactions(text) {
  const transactions = [];
  const lines = text.split("\n");

  const dateRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/;
  const amountRegex = /(-?\d{1,3}(?:[,]\d{3})*(?:\.\d{2}))\s+(EUR|USD|AUD|GBP|CAD|CHF|JPY|CNY)/;

  for (const line of lines) {
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;

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
    if (!amountMatch) continue;

    const amount = Math.abs(parseFloat(amountMatch[1].replace(",", "")));
    const currency = amountMatch[2];

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
        currency,
        suggestedJar: suggestJar(description),
        suggestedAccount: "RedotPay",
      });
    }
  }

  return transactions;
}

/**
 * Suggère une jarre
 */
function suggestJar(description) {
  const desc = description.toLowerCase();

  const rules = {
    NEC: [
      "pharmacie", "gal", "intermarche", "semello", "cevennalgues",
      "phytonut", "nutreine", "garcon", "carrefour", "lidl",
    ],
    PLAY: [
      "airbnb", "booking", "hotel", "trip", "kiwi", "yanssie",
      "restaurant", "cinema", "netflix",
    ],
    EDUC: ["success resources", "formation", "udemy"],
    GIFT: ["gofundme", "don", "charity"],
  };

  for (const [jar, keywords] of Object.entries(rules)) {
    if (keywords.some((keyword) => desc.includes(keyword))) {
      return jar;
    }
  }

  return "NEC";
}
