// netlify/functions/checkDuplicates.js v4
// Détection de doublons flexible — source de vérité : Supabase (transactions_spending)

const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { transactions = [] } = body;

    // Extraire le JWT depuis l'en-tête Authorization
    const authHeader = event.headers["authorization"] || event.headers["Authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const userId = token ? getUserIdFromJWT(token) : null;

    console.log(`🔍 Checking ${transactions.length} transactions for duplicates (userId: ${userId ? "✅" : "❌ absent"})`);

    if (!userId) {
      console.warn("⚠️ No userId — skipping duplicate check");
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: true, transactions, duplicateCount: 0, byLevel: { level1: 0, level2: 0, level3: 0 } }),
      };
    }

    const existingTransactions = await fetchExistingTransactions(userId, transactions);
    console.log(`📊 Found ${existingTransactions.length} existing transactions in Supabase`);

    const transactionsWithDuplicateCheck = transactions.map(transaction => {
      const duplicateResult = findDuplicateWithDetails(transaction, existingTransactions);

      if (duplicateResult) {
        const { duplicate, level, confidence, matchDetails } = duplicateResult;
        console.log(`⚠️  Duplicate found (Level ${level}): ${transaction.date} | ${transaction.description} | ${transaction.amount}€ (${confidence}%)`);

        return {
          ...transaction,
          isDuplicate: true,
          duplicateLevel: level,
          duplicateConfidence: confidence,
          matchDetails,
          duplicateNote: getDuplicateNote(level, duplicate, confidence, matchDetails),
          matchedTransaction: duplicate,
        };
      }

      return {
        ...transaction,
        isDuplicate: false,
        duplicateLevel: null,
        duplicateConfidence: null,
        matchDetails: null,
        duplicateNote: null,
      };
    });

    const duplicateCount = transactionsWithDuplicateCheck.filter(t => t.isDuplicate).length;
    const byLevel = {
      level1: transactionsWithDuplicateCheck.filter(t => t.duplicateLevel === 1).length,
      level2: transactionsWithDuplicateCheck.filter(t => t.duplicateLevel === 2).length,
      level3: transactionsWithDuplicateCheck.filter(t => t.duplicateLevel === 3).length,
    };

    console.log(`✅ Duplicate check complete: ${duplicateCount} duplicates (L1: ${byLevel.level1}, L2: ${byLevel.level2}, L3: ${byLevel.level3})`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, transactions: transactionsWithDuplicateCheck, duplicateCount, byLevel }),
    };
  } catch (error) {
    console.error("❌ Error checking duplicates:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to check duplicates", message: error.message }),
    };
  }
};

/**
 * Extrait le user_id depuis un JWT Supabase (décodage base64, sans vérification de signature)
 */
function getUserIdFromJWT(token) {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded.sub || null;
  } catch {
    try {
      // Fallback base64 standard
      const payload = token.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
      return decoded.sub || null;
    } catch {
      return null;
    }
  }
}

/**
 * Récupère les transactions existantes depuis Supabase pour la plage de dates du fichier importé.
 * Utilise la service role key pour bypasser RLS, filtre par user_id.
 */
async function fetchExistingTransactions(userId, importedTransactions) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping duplicate check");
    return [];
  }

  // Calculer la plage de dates des transactions importées (avec ±14 jours de buffer)
  const dates = importedTransactions
    .map(t => parseDate(t.date))
    .filter(Boolean);

  let fromDate = null;
  let toDate = null;

  if (dates.length > 0) {
    const minTime = Math.min(...dates.map(d => d.getTime()));
    const maxTime = Math.max(...dates.map(d => d.getTime()));
    const buffer = 14 * 24 * 60 * 60 * 1000; // 14 jours
    fromDate = new Date(minTime - buffer).toISOString().split("T")[0];
    toDate   = new Date(maxTime + buffer).toISOString().split("T")[0];
    console.log(`📅 Date range: ${fromDate} → ${toDate} (±14j buffer)`);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let query = supabase
    .from("transactions_spending")
    .select("date, amount, description, jar")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(2000);

  if (fromDate) query = query.gte("date", fromDate);
  if (toDate)   query = query.lte("date", toDate);

  const { data, error } = await query;

  if (error) {
    console.error("❌ Supabase error fetching transactions:", error.message);
    return [];
  }

  console.log(`✅ Fetched ${(data || []).length} existing transactions from Supabase`);
  return data || [];
}

/**
 * Trouve un doublon avec détails de correspondance
 *
 * NIVEAU 1 (≥95%) : Montant exact (±0.01€) + Date proche (±2j) + 2+ mots communs
 * NIVEAU 2 (≥85%) : Montant exact + Date proche (±2j) + 1+ mot commun (ou date ±1j)
 * NIVEAU 3 (≥70%) : Montant proche (±10%) + Date proche (±2j) + 1+ mot commun
 */
function findDuplicateWithDetails(transaction, existingTransactions) {
  const targetDate   = parseDate(transaction.date);
  const targetAmount = parseFloat(transaction.amount);
  const targetDesc   = normalizeDescription(transaction.description);
  const targetWords  = getSignificantWords(targetDesc);

  let bestMatch = null;
  let bestLevel = null;
  let bestConfidence = 0;
  let bestMatchDetails = null;

  for (const existing of existingTransactions) {
    const existingDate   = parseDate(existing.date);
    const existingAmount = parseFloat(existing.amount);
    const existingDesc   = normalizeDescription(existing.description);
    const existingWords  = getSignificantWords(existingDesc);

    const dateDiff         = Math.abs(getDaysDifference(targetDate, existingDate));
    const amountDiff       = Math.abs(targetAmount - existingAmount);
    const amountDiffPct    = targetAmount > 0 ? (amountDiff / targetAmount) * 100 : 999;
    const commonWords      = getCommonWords(targetWords, existingWords);
    const commonWordsCount = commonWords.length;
    const textSimilarity   = calculateSimilarity(targetDesc, existingDesc);

    const matchDetails = {
      dateMatch:        getDateMatchType(dateDiff),
      amountMatch:      getAmountMatchType(amountDiff, amountDiffPct),
      descriptionMatch: getDescriptionMatchType(commonWordsCount, textSimilarity),
      dateDiff,
      amountDiff,
      amountDiffPercent:   parseFloat(amountDiffPct.toFixed(1)),
      commonWords,
      commonWordsCount,
      textSimilarity:      parseFloat((textSimilarity * 100).toFixed(0)),
    };

    // Niveau 0 : montant PARFAITEMENT exact + date ≤1j (descriptions très différentes)
    if (amountDiff <= 0.01 && dateDiff <= 1) {
      const confidence = Math.round(88 + Math.min(textSimilarity * 10, 7) + Math.min(commonWordsCount * 2, 5));
      if (confidence > bestConfidence && confidence >= 88) {
        bestMatch = existing; bestLevel = 2; bestConfidence = confidence; bestMatchDetails = matchDetails;
      }
    }

    // Niveau 1 : montant exact + date ≤2j + 2+ mots communs
    if (amountDiff <= 0.01 && dateDiff <= 2 && commonWordsCount >= 2) {
      const confidence = Math.min(95 + commonWordsCount * 2, 100);
      if (confidence > bestConfidence) {
        bestMatch = existing; bestLevel = 1; bestConfidence = confidence; bestMatchDetails = matchDetails;
      }
      continue;
    }

    // Niveau 1.5 : montant exact + date ≤1j + 1 mot OU similarité ≥40%
    if (amountDiff <= 0.01 && dateDiff <= 1 && (commonWordsCount >= 1 || textSimilarity >= 0.4)) {
      const confidence = Math.round(90 + Math.min(textSimilarity * 10, 5) + Math.min(commonWordsCount * 2, 5));
      if (confidence > bestConfidence) {
        bestMatch = existing; bestLevel = 2; bestConfidence = confidence; bestMatchDetails = matchDetails;
      }
      continue;
    }

    // Niveau 2 : montant exact + date ≤2j + 1+ mot commun
    if (amountDiff <= 0.01 && dateDiff <= 2 && commonWordsCount >= 1) {
      const confidence = Math.round(85 + Math.min(commonWordsCount * 3, 10) + Math.min(textSimilarity * 5, 5));
      if (confidence > bestConfidence) {
        bestMatch = existing; bestLevel = 2; bestConfidence = confidence; bestMatchDetails = matchDetails;
      }
      continue;
    }

    // Niveau 3 : montant ±10% + date ≤2j + 1+ mot commun
    if (amountDiffPct <= 10 && dateDiff <= 2 && commonWordsCount >= 1) {
      const confidence = Math.round(70 + (1 - amountDiffPct / 10) * 20 + (1 - dateDiff / 2) * 10 + Math.min(commonWordsCount * 10, 20));
      if (confidence > bestConfidence && confidence >= 70) {
        bestMatch = existing; bestLevel = 3; bestConfidence = confidence; bestMatchDetails = matchDetails;
      }
      continue;
    }
  }

  return bestMatch ? { duplicate: bestMatch, level: bestLevel, confidence: bestConfidence, matchDetails: bestMatchDetails } : null;
}

function getDuplicateNote(level, duplicate, confidence, details) {
  const icon      = level === 1 ? "🎯" : level === 2 ? "⚠️" : "⚡";
  const levelText = level === 1 ? "très probable" : level === 2 ? "probable" : "potentiel";
  const descStr   = (duplicate.description || "").substring(0, 40) + ((duplicate.description || "").length > 40 ? "..." : "");
  const detailsStr = [`Date: ${details.dateMatch}`, `Montant: ${details.amountMatch}`, `Description: ${details.descriptionMatch}`].join(" • ");
  return `${icon} Doublon ${levelText} (${confidence}%) | ${duplicate.date} | ${descStr} | ${duplicate.amount}€\n${detailsStr}`;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(dateStr + "T00:00:00Z");
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split("/");
    return new Date(`${y}-${m}-${d}T00:00:00Z`);
  }
  try { return new Date(dateStr); } catch { return null; }
}

function getDaysDifference(d1, d2) {
  if (!d1 || !d2) return 999;
  return Math.floor(Math.abs(d1 - d2) / (1000 * 60 * 60 * 24));
}

function normalizeDescription(description) {
  if (!description) return "";
  return description.toString().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\d{6,}/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSignificantWords(description) {
  if (!description) return new Set();
  const stopWords = new Set([
    "le","la","les","un","une","des","de","du","au","aux","et","ou","mais","donc","or","ni","car",
    "a","an","the","and","but","in","on","at","to","for",
    "chez","sur","sous","dans","par","pour","avec","sans",
  ]);
  return new Set(
    description.split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.has(w) && !/^\d+$/.test(w))
  );
}

function getCommonWords(words1, words2) {
  const common = [];
  for (const w of words1) { if (words2.has(w)) common.push(w); }
  if (common.length === 0) {
    for (const w1 of words1) {
      for (const w2 of words2) {
        if (w1.length >= 4 && w2.includes(w1)) { common.push(w1); break; }
        else if (w2.length >= 4 && w1.includes(w2)) { common.push(w2); break; }
      }
    }
  }
  return common;
}

function calculateSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);
  if (b1.size === 0 || b2.size === 0) return 0;
  let intersection = 0;
  for (const b of b1) { if (b2.has(b)) intersection++; }
  return (2.0 * intersection) / (b1.size + b2.size);
}

function getBigrams(str) {
  const bigrams = new Set();
  for (let i = 0; i < str.length - 1; i++) bigrams.add(str.substring(i, i + 2));
  return bigrams;
}

function getDateMatchType(d) {
  if (d === 0) return "exacte";
  if (d === 1) return "approx (+/- 1j)";
  if (d === 2) return "approx (+/- 2j)";
  return `éloignée (${d}j)`;
}

function getAmountMatchType(diff, pct) {
  if (diff <= 0.01) return "exact";
  if (pct <= 1)  return "approx (+/- 1%)";
  if (pct <= 5)  return "approx (+/- 5%)";
  if (pct <= 10) return "approx (+/- 10%)";
  return `différent (${pct.toFixed(1)}%)`;
}

function getDescriptionMatchType(n, sim) {
  if (sim >= 0.9) return "exacte";
  if (sim >= 0.7 || n >= 3) return "très similaire";
  if (sim >= 0.5 || n >= 2) return "similaire";
  if (n >= 1) return "approximative";
  return "différente";
}
