// test-redotpay-parser.js - Script de test local
// Usage: node test-redotpay-parser.js

const sampleRedotPayText = `
RedotPay
Document Number: 20251215-9866
Statement Period: Nov 01, 2025 - Nov 30, 2025

Date               Description              Transaction Amount

Nov 30, 2025      HPY*PHYTONUT            -27.50 EUR

Nov 29, 2025      AIRBNB * HMFTXYHW23     -697.36 EUR

Nov 29, 2025      AIRBNB * HMPE29A88D     -170.48 EUR

Nov 28, 2025      AIRBNB * HMQSF8KWKP     -663.39 EUR

Nov 28, 2025      AIRBNB * HMREBFKCP8     -816.53 EUR

Nov 28, 2025      PHARMACIE GAL 4030799    -73.00 EUR

Nov 27, 2025      PHARMACIE GAL 4038687    -73.00 EUR

Nov 24, 2025      CEVENNALGUES             -80.35 EUR

Nov 24, 2025      SEMELLO                  -59.95 EUR

Nov 24, 2025      GARCON FRANCAIS 2430825  -136.00 EUR

Nov 21, 2025      INTERMARCHE              -9.00 EUR

Nov 20, 2025      NUTREINE SAS             -299.00 EUR

Nov 16, 2025      SUCCESS RESOURCES        -2,000.00 EUR

Nov 13, 2025      TRIP.COM                 -167.66 EUR

Nov 13, 2025      Kiwi.com                 -591.40 EUR

Nov 07, 2025      Booking.com Hotel        -270.56 EUR

Nov 06, 2025      Yanssie HK Limited       -1,043.40 USD

Nov 02, 2025      GFM*GoFundMe Help Build a -81.65 AUD
`;

/**
 * Parse les transactions RedotPay
 */
function parseRedotPayTransactions(text) {
  const transactions = [];
  const lines = text.split("\n");
  
  const dateRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/;
  const amountRegex = /(-?\d{1,3}(?:[,]\d{3})*(?:\.\d{2}))\s+(EUR|USD|AUD|GBP)/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
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
    
    const amountStr = amountMatch[1].replace(",", "");
    const amount = Math.abs(parseFloat(amountStr));
    const currency = amountMatch[2];
    
    let description = line
      .replace(dateMatch[0], "")
      .replace(amountMatch[0], "")
      .trim()
      .replace(/\s+/g, " ");
    
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
 * Suggère une jarre
 */
function suggestJar(description) {
  const desc = description.toLowerCase();
  
  const necKeywords = [
    "pharmacie", "gal", "supermarché", "carrefour", "lidl", "aldi",
    "courses", "loyer", "électricité", "edf", "eau", "gaz",
    "internet", "téléphone", "transport", "essence", "total",
    "intermarche", "garcon", "semello", "cevennalgues", "phytonut",
    "nutreine"
  ];
  
  const playKeywords = [
    "restaurant", "cinéma", "netflix", "spotify", "bar", "café",
    "jeu", "steam", "airbnb", "booking", "hotel", "trip", "kiwi",
    "yanssie"
  ];
  
  const educKeywords = [
    "livre", "formation", "cours", "udemy", "coursera",
    "école", "université", "success resources"
  ];
  
  const giftKeywords = [
    "don", "charity", "cadeau", "association", "gofundme"
  ];
  
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
  
  return "NEC";
}

// === TEST ===
console.log("🧪 Test du parser RedotPay\n");
console.log("=" .repeat(80));

const transactions = parseRedotPayTransactions(sampleRedotPayText);

console.log(`\n✅ ${transactions.length} transactions détectées\n`);

transactions.forEach((t, i) => {
  console.log(`${i + 1}. ${t.date} | ${t.description.padEnd(30)} | ${t.amount.toFixed(2).padStart(10)} ${t.currency} → ${t.suggestedJar}`);
});

console.log("\n" + "=".repeat(80));
console.log("\n📊 Répartition par jarre :");

const byJar = {};
transactions.forEach(t => {
  byJar[t.suggestedJar] = (byJar[t.suggestedJar] || 0) + 1;
});

Object.entries(byJar).forEach(([jar, count]) => {
  console.log(`  ${jar}: ${count} transaction(s)`);
});

console.log("\n💰 Total par devise :");
const byCurrency = {};
transactions.forEach(t => {
  byCurrency[t.currency] = (byCurrency[t.currency] || 0) + t.amount;
});

Object.entries(byCurrency).forEach(([currency, total]) => {
  console.log(`  ${currency}: ${total.toFixed(2)}`);
});

console.log("\n✅ Test terminé !");
