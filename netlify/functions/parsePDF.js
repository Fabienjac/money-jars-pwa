// netlify/functions/parsePDF.js - VERSION MULTI-BANQUES
const pdfParse = require("pdf-parse");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const boundary = event.headers["content-type"]?.split("boundary=")[1];
    if (!boundary) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid content-type" }),
      };
    }

    const parts = parseMultipart(event.body, boundary);
    const pdfPart = parts.find((p) => p.name === "pdf");
    
    if (!pdfPart) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No PDF file uploaded" }),
      };
    }

    const pdfBuffer = Buffer.from(pdfPart.data, "binary");
    const data = await pdfParse(pdfBuffer);
    const text = data.text;
    
    // Détecter le type de banque
    const bankType = detectBankType(text);
    
    // Parser selon le type
    let transactions = [];
    switch (bankType) {
      case "redotpay":
        transactions = parseRedotPayTransactions(text);
        break;
      case "n26":
        transactions = parseN26Transactions(text);
        break;
      default:
        transactions = parseGenericTransactions(text);
    }
    
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        bankType,
        transactions,
        rawText: text.substring(0, 500), // Premier 500 caractères pour debug
      }),
    };
  } catch (error) {
    console.error("Error parsing PDF:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to parse PDF",
        message: error.message,
      }),
    };
  }
};

/**
 * Détecte le type de banque depuis le texte
 */
function detectBankType(text) {
  if (text.includes("RedotPay") || text.includes("REDOTPAY")) {
    return "redotpay";
  }
  if (text.includes("N26") || text.includes("n26")) {
    return "n26";
  }
  return "generic";
}

/**
 * Parse les transactions RedotPay
 * Format: "Nov 30, 2025  HPY*PHYTONUT  -27.50 EUR"
 */
function parseRedotPayTransactions(text) {
  const transactions = [];
  const lines = text.split("\n");
  
  // Regex pour le format RedotPay
  // Date: "Nov 30, 2025" ou "Nov 2, 2025"
  const dateRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/;
  
  // Montant: "-697.36 EUR" ou "-1,043.40 USD"
  const amountRegex = /(-?\d{1,3}(?:[,]\d{3})*(?:\.\d{2}))\s+(EUR|USD|AUD|GBP)/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;
    
    const month = dateMatch[1];
    const day = dateMatch[2].padStart(2, "0");
    const year = dateMatch[3];
    
    // Convertir le mois en numéro
    const monthMap = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04",
      May: "05", Jun: "06", Jul: "07", Aug: "08",
      Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };
    const monthNum = monthMap[month];
    const dateISO = `${year}-${monthNum}-${day}`;
    
    // Extraire le montant
    const amountMatch = line.match(amountRegex);
    if (!amountMatch) continue;
    
    const amountStr = amountMatch[1].replace(",", ""); // Enlever les virgules de milliers
    const amount = Math.abs(parseFloat(amountStr));
    const currency = amountMatch[2];
    
    // La description est entre la date et le montant
    let description = line
      .replace(dateMatch[0], "")
      .replace(amountMatch[0], "")
      .trim();
    
    // Nettoyer les espaces multiples
    description = description.replace(/\s+/g, " ");
    
    if (amount > 0 && description) {
      const suggestedJar = suggestJar(description);
      const suggestedAccount = "RedotPay";
      
      transactions.push({
        date: dateISO,
        description,
        amount,
        currency,
        suggestedJar,
        suggestedAccount,
      });
    }
  }
  
  return transactions;
}

/**
 * Parse les transactions N26
 * Format: "31.12.2024  Satoriz  -151.59 EUR"
 */
function parseN26Transactions(text) {
  const transactions = [];
  const lines = text.split("\n");
  
  const dateRegex = /(\d{2})[.\/](\d{2})[.\/](\d{4})/;
  const amountRegex = /(-?\d+[.,]\d{2})\s*€?/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;
    
    const day = dateMatch[1];
    const month = dateMatch[2];
    const year = dateMatch[3];
    const dateISO = `${year}-${month}-${day}`;
    
    const amountMatch = line.match(amountRegex);
    if (!amountMatch) continue;
    
    const amount = Math.abs(parseFloat(amountMatch[1].replace(",", ".")));
    
    let description = line
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
 * Parser générique pour d'autres formats
 */
function parseGenericTransactions(text) {
  const transactions = [];
  const lines = text.split("\n");
  
  // Essayer plusieurs formats de date
  const dateFormats = [
    /(\d{2})[.\/](\d{2})[.\/](\d{4})/, // DD.MM.YYYY
    /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/, // Month DD, YYYY
  ];
  
  const amountRegex = /(-?\d{1,3}(?:[,]\d{3})*(?:\.\d{2}))\s*(EUR|USD|€|\$)?/;
  
  for (const line of lines) {
    for (const dateRegex of dateFormats) {
      const dateMatch = line.match(dateRegex);
      if (!dateMatch) continue;
      
      const amountMatch = line.match(amountRegex);
      if (!amountMatch) continue;
      
      // Parser la date selon le format
      let dateISO;
      if (dateMatch[0].includes("Jan") || dateMatch[0].includes("Feb")) {
        // Format "Nov 30, 2025"
        const monthMap = {
          Jan: "01", Feb: "02", Mar: "03", Apr: "04",
          May: "05", Jun: "06", Jul: "07", Aug: "08",
          Sep: "09", Oct: "10", Nov: "11", Dec: "12",
        };
        const month = monthMap[dateMatch[1]];
        const day = dateMatch[2].padStart(2, "0");
        const year = dateMatch[3];
        dateISO = `${year}-${month}-${day}`;
      } else if (dateMatch[0].includes("-")) {
        // Format "2025-11-30"
        dateISO = dateMatch[0];
      } else {
        // Format "30.11.2025"
        const day = dateMatch[1];
        const month = dateMatch[2];
        const year = dateMatch[3];
        dateISO = `${year}-${month}-${day}`;
      }
      
      const amount = Math.abs(parseFloat(amountMatch[1].replace(",", "")));
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
          currency: amountMatch[2] || "EUR",
          suggestedJar: suggestJar(description),
          suggestedAccount: "Unknown",
        });
      }
      
      break; // Date trouvée, passer à la ligne suivante
    }
  }
  
  return transactions;
}

/**
 * Suggère une jarre basée sur la description
 */
function suggestJar(description) {
  const desc = description.toLowerCase();
  
  // Nécessités (NEC)
  const necKeywords = [
    "pharmacie", "gal", "supermarché", "carrefour", "lidl", "aldi",
    "courses", "loyer", "électricité", "edf", "eau", "gaz",
    "internet", "téléphone", "orange", "free", "transport",
    "essence", "total", "bp", "shell", "intermarche", "garcon",
    "semello", "cevennalgues", "phytonut", "nutreine"
  ];
  
  // Fun / Play (PLAY)
  const playKeywords = [
    "restaurant", "cinéma", "cinema", "netflix", "spotify",
    "bar", "café", "cafe", "jeu", "steam", "playstation",
    "xbox", "disney", "amazon prime"
  ];
  
  // Éducation (EDUC)
  const educKeywords = [
    "livre", "formation", "cours", "udemy", "coursera",
    "école", "ecole", "université", "universite", "success resources"
  ];
  
  // Don (GIFT)
  const giftKeywords = [
    "don", "charity", "cadeau", "association", "gofundme"
  ];
  
  // Voyage / Hébergement (peut être PLAY ou NEC selon)
  const travelKeywords = [
    "airbnb", "booking", "hotel", "trip", "kiwi", "flight",
    "yanssie"
  ];
  
  // Vérifier les mots-clés
  for (const keyword of necKeywords) {
    if (desc.includes(keyword)) return "NEC";
  }
  
  for (const keyword of playKeywords) {
    if (desc.includes(keyword)) return "PLAY";
  }
  
  for (const keyword of educKeywords) {
    if (desc.includes(keyword)) return "EDUC";
  }
  
  for (const keyword of giftKeywords) {
    if (desc.includes(keyword)) return "GIFT";
  }
  
  for (const keyword of travelKeywords) {
    if (desc.includes(keyword)) return "PLAY"; // Voyage = Fun par défaut
  }
  
  // Par défaut: Nécessités
  return "NEC";
}

/**
 * Parse un body multipart/form-data
 */
function parseMultipart(body, boundary) {
  const parts = [];
  const sections = body.split(`--${boundary}`);
  
  for (const section of sections) {
    if (section.includes("Content-Disposition")) {
      const nameMatch = section.match(/name="([^"]+)"/);
      if (!nameMatch) continue;
      
      const name = nameMatch[1];
      const dataStart = section.indexOf("\r\n\r\n") + 4;
      const dataEnd = section.lastIndexOf("\r\n");
      const data = section.substring(dataStart, dataEnd);
      
      parts.push({ name, data });
    }
  }
  
  return parts;
}
