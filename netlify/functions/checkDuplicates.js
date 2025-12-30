// netlify/functions/checkDuplicates.js v3
// Détection de doublons flexible avec détails de correspondance

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

    console.log(`🔍 Checking ${transactions.length} transactions for duplicates`);

    // Récupérer les transactions existantes depuis Google Sheets
    const existingTransactions = await fetchExistingTransactions();
    
    console.log(`📊 Found ${existingTransactions.length} existing transactions in Google Sheets`);

    // Vérifier chaque transaction avec les 3 niveaux
    const transactionsWithDuplicateCheck = transactions.map(transaction => {
      const duplicateResult = findDuplicateWithDetails(transaction, existingTransactions);
      
      if (duplicateResult) {
        const { duplicate, level, confidence, matchDetails } = duplicateResult;
        
        console.log(`⚠️  Duplicate found (Level ${level}): ${transaction.date} | ${transaction.description} | ${transaction.amount}€ (${confidence}% confidence)`);
        console.log(`   Match details: ${JSON.stringify(matchDetails)}`);
        
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
    
    console.log(`✅ Duplicate check complete: ${duplicateCount} duplicates found (Level 1: ${byLevel.level1}, Level 2: ${byLevel.level2}, Level 3: ${byLevel.level3})`);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        transactions: transactionsWithDuplicateCheck,
        duplicateCount,
        byLevel,
      }),
    };
  } catch (error) {
    console.error("❌ Error checking duplicates:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to check duplicates",
        message: error.message,
      }),
    };
  }
};

/**
 * Récupère les transactions existantes depuis Google Sheets via l'API
 */
async function fetchExistingTransactions() {
  const GSCRIPT_URL = process.env.GSCRIPT_URL;
  const API_KEY = process.env.VITE_API_KEY;

  console.log("🔍 DEBUG - GSCRIPT_URL:", GSCRIPT_URL ? "✅ Défini" : "❌ Non défini");
  console.log("🔍 DEBUG - API_KEY:", API_KEY ? "✅ Défini" : "❌ Non défini");

  if (!GSCRIPT_URL || !API_KEY) {
    console.warn("⚠️  Missing GSCRIPT_URL or API_KEY - skipping duplicate check");
    return [];
  }

  try {
    // Récupérer les 1000 dernières transactions
    const url = `${GSCRIPT_URL}?action=list&type=spending&limit=1000&key=${encodeURIComponent(API_KEY)}`;
    
    console.log("📡 Fetching existing transactions from Google Sheets...");
    console.log("🔍 DEBUG - URL:", url.substring(0, 100) + "...");
    
    const response = await fetch(url, {
      method: "GET",
    });

    console.log("🔍 DEBUG - Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️  Failed to fetch existing transactions: ${response.status}`);
      console.warn(`⚠️  Error response:`, errorText.substring(0, 200));
      return [];
    }

    const data = await response.json();
    const transactions = data.rows || [];
    
    console.log(`✅ Fetched ${transactions.length} existing transactions from Google Sheets`);
    
    // Debug: Afficher quelques exemples
    if (transactions.length > 0) {
      console.log("🔍 DEBUG - Exemple de transaction 1:", JSON.stringify(transactions[0]));
      if (transactions.length > 1) {
        console.log("🔍 DEBUG - Exemple de transaction 2:", JSON.stringify(transactions[1]));
      }
    }
    
    return transactions;
  } catch (error) {
    console.error("❌ Error fetching existing transactions:", error);
    console.error("❌ Error details:", error.message, error.stack);
    return [];
  }
}

/**
 * Trouve un doublon avec détails de correspondance
 * 
 * NIVEAU 1 (Confiance très élevée - 95%+):
 * - Montant identique (±0.01€)
 * - Date proche (±2 jours)
 * - Au moins 2 mots significatifs en commun
 * 
 * NIVEAU 2 (Confiance élevée - 85%+):
 * - Montant identique (±0.01€)
 * - Date proche (±2 jours)
 * - Au moins 1 mot significatif en commun
 * 
 * NIVEAU 3 (Confiance moyenne - 70%+):
 * - Montant proche (±10%)
 * - Date proche (±2 jours)
 * - Au moins 1 mot significatif en commun
 */
function findDuplicateWithDetails(transaction, existingTransactions) {
  const targetDate = parseDate(transaction.date);
  const targetAmount = parseFloat(transaction.amount);
  const targetDescription = normalizeDescription(transaction.description);
  const targetWords = getSignificantWords(targetDescription);

  let bestMatch = null;
  let bestLevel = null;
  let bestConfidence = 0;
  let bestMatchDetails = null;

  for (const existing of existingTransactions) {
    const existingDate = parseDate(existing.date);
    const existingAmount = parseFloat(existing.amount);
    const existingDescription = normalizeDescription(existing.description);
    const existingWords = getSignificantWords(existingDescription);

    // Calculs des correspondances
    const dateDiff = Math.abs(getDaysDifference(targetDate, existingDate));
    const amountDiff = Math.abs(targetAmount - existingAmount);
    const amountDiffPercent = (amountDiff / targetAmount) * 100;
    const commonWords = getCommonWords(targetWords, existingWords);
    const commonWordsCount = commonWords.length;
    const textSimilarity = calculateSimilarity(targetDescription, existingDescription);

    // Créer les détails de correspondance
    const matchDetails = {
      dateMatch: getDateMatchType(dateDiff),
      amountMatch: getAmountMatchType(amountDiff, amountDiffPercent),
      descriptionMatch: getDescriptionMatchType(commonWordsCount, textSimilarity),
      dateDiff,
      amountDiff,
      amountDiffPercent: parseFloat(amountDiffPercent.toFixed(1)),
      commonWords,
      commonWordsCount,
      textSimilarity: parseFloat((textSimilarity * 100).toFixed(0)),
    };

    // NIVEAU 0 : Montant PARFAITEMENT exact + Date TRÈS proche (≤1 jour)
    // Pour les transactions du même marchand avec libellés très différents
    // Ex: "IHR EINKAU* CODE123" vs "schlossapo.de homéopathie"
    // Ex: "TRIP.COM" vs "vol Montpellier Orly pour NWA" (même montant + date proche)
    if (amountDiff <= 0.01 && dateDiff <= 1) {
      const confidence = 88 + Math.min(textSimilarity * 10, 7) + Math.min(commonWordsCount * 2, 5);
      
      if (confidence > bestConfidence && confidence >= 88) {
        bestMatch = existing;
        bestLevel = 2; // Traiter comme niveau 2 (warning orange) pour révision manuelle
        bestConfidence = Math.round(confidence);
        bestMatchDetails = matchDetails;
        
        console.log(`⚠️ Level 0 match (EXACT amount + CLOSE date ≤1d, different descriptions): ${transaction.description} | ${targetAmount}€`);
      }
      // Ne pas continuer, laisser les autres niveaux s'appliquer aussi
    }

    // NIVEAU 1 : Montant exact + Date proche + 2+ mots communs
    if (amountDiff <= 0.01 && dateDiff <= 2 && commonWordsCount >= 2) {
      const confidence = Math.min(95 + commonWordsCount * 2, 100);
      
      if (confidence > bestConfidence) {
        bestMatch = existing;
        bestLevel = 1;
        bestConfidence = confidence;
        bestMatchDetails = matchDetails;
        
        console.log(`🎯 Level 1 match: ${transaction.description} | ${targetAmount}€`);
      }
      continue;
    }

    // ✅ NIVEAU 1.5 : Montant EXACT + Date TRÈS proche (≤1 jour) + au moins 1 mot OU similarité textuelle élevée
    // Pour attraper les cas comme "GARCON FRANCAIS" vs "garconfrançais.com"
    if (amountDiff <= 0.01 && dateDiff <= 1 && (commonWordsCount >= 1 || textSimilarity >= 0.4)) {
      const confidence = 90 + Math.min(textSimilarity * 10, 5) + Math.min(commonWordsCount * 2, 5);
      
      if (confidence > bestConfidence) {
        bestMatch = existing;
        bestLevel = 2; // Traiter comme niveau 2 pour affichage
        bestConfidence = Math.round(confidence);
        bestMatchDetails = matchDetails;
        
        console.log(`🎯 Level 1.5 match (exact amount + close date): ${transaction.description} | ${targetAmount}€`);
      }
      continue;
    }

    // NIVEAU 2 : Montant exact + Date proche + 1+ mot commun
    if (amountDiff <= 0.01 && dateDiff <= 2 && commonWordsCount >= 1) {
      const confidence = 85 + Math.min(commonWordsCount * 3, 10) + Math.min(textSimilarity * 5, 5);
      
      if (confidence > bestConfidence) {
        bestMatch = existing;
        bestLevel = 2;
        bestConfidence = Math.round(confidence);
        bestMatchDetails = matchDetails;
        
        console.log(`⚠️  Level 2 match: ${transaction.description} | ${targetAmount}€`);
      }
      continue;
    }

    // NIVEAU 3 : Montant proche (±10%) + Date proche + 1+ mot commun
    if (amountDiffPercent <= 10 && dateDiff <= 2 && commonWordsCount >= 1) {
      const amountScore = (1 - amountDiffPercent / 10) * 20;
      const dateScore = (1 - dateDiff / 2) * 10;
      const wordsScore = Math.min(commonWordsCount * 10, 20);
      const confidence = Math.round(70 + amountScore + dateScore + wordsScore);
      
      if (confidence > bestConfidence && confidence >= 70) {
        bestMatch = existing;
        bestLevel = 3;
        bestConfidence = confidence;
        bestMatchDetails = matchDetails;
        
        console.log(`⚡ Level 3 match: ${transaction.description} | ${targetAmount}€`);
      }
      continue;
    }
  }

  if (bestMatch) {
    return {
      duplicate: bestMatch,
      level: bestLevel,
      confidence: bestConfidence,
      matchDetails: bestMatchDetails,
    };
  }

  return null;
}

/**
 * Détermine le type de correspondance de date
 */
function getDateMatchType(daysDiff) {
  if (daysDiff === 0) return "exacte";
  if (daysDiff === 1) return "approximative (+/- 1 jour)";
  if (daysDiff === 2) return "approximative (+/- 2 jours)";
  return `éloignée (${daysDiff} jours)`;
}

/**
 * Détermine le type de correspondance de montant
 */
function getAmountMatchType(diff, diffPercent) {
  if (diff <= 0.01) return "exact";
  if (diffPercent <= 1) return "approximatif (+/- 1%)";
  if (diffPercent <= 5) return "approximatif (+/- 5%)";
  if (diffPercent <= 10) return "approximatif (+/- 10%)";
  return `différent (${diffPercent.toFixed(1)}%)`;
}

/**
 * Détermine le type de correspondance de description
 */
function getDescriptionMatchType(commonWordsCount, similarity) {
  if (similarity >= 0.9) return "exacte";
  if (similarity >= 0.7 || commonWordsCount >= 3) return "très similaire";
  if (similarity >= 0.5 || commonWordsCount >= 2) return "similaire";
  if (commonWordsCount >= 1) return "approximative";
  return "différente";
}

/**
 * Génère une note explicative avec détails de correspondance
 */
function getDuplicateNote(level, duplicate, confidence, details) {
  const icon = level === 1 ? "🎯" : level === 2 ? "⚠️" : "⚡";
  const levelText = level === 1 ? "très probable" : level === 2 ? "probable" : "potentiel";
  
  const dateStr = duplicate.date;
  const amountStr = `${duplicate.amount}€`;
  const descStr = duplicate.description.substring(0, 40) + (duplicate.description.length > 40 ? "..." : "");

  const detailsStr = [
    `Date: ${details.dateMatch}`,
    `Montant: ${details.amountMatch}`,
    `Description: ${details.descriptionMatch}`,
  ].join(" • ");

  return `${icon} Doublon ${levelText} (${confidence}%) | ${dateStr} | ${descStr} | ${amountStr}\n${detailsStr}`;
}

/**
 * Parse une date et retourne un objet Date
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + "T00:00:00Z");
  }
  
  // Format DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split("/");
    return new Date(`${year}-${month}-${day}T00:00:00Z`);
  }
  
  // Autre format
  try {
    return new Date(dateStr);
  } catch (e) {
    return null;
  }
}

/**
 * Calcule la différence en jours entre deux dates
 */
function getDaysDifference(date1, date2) {
  if (!date1 || !date2) return 999;
  const diffMs = Math.abs(date1 - date2);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Normalise une description (minuscules, sans accents, sans ponctuation)
 */
function normalizeDescription(description) {
  if (!description) return "";
  
  return description
    .toString()
    .toLowerCase()
    // Retirer les accents
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Enlever les numéros de transaction longs
    .replace(/\d{6,}/g, "")
    // Enlever la ponctuation
    .replace(/[^\w\s]/g, " ")
    // Normaliser les espaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrait les mots significatifs d'une description
 */
function getSignificantWords(description) {
  if (!description) return new Set();

  // Mots à ignorer
  const stopWords = new Set([
    "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux",
    "et", "ou", "mais", "donc", "or", "ni", "car",
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "chez", "sur", "sous", "dans", "par", "pour", "avec", "sans",
  ]);

  const words = description
    .split(/\s+/)
    .filter(word => word.length >= 3)
    .filter(word => !stopWords.has(word))
    .filter(word => !/^\d+$/.test(word));

  return new Set(words);
}

/**
 * Retourne la liste des mots communs entre deux ensembles
 * Inclut aussi une détection partielle pour les mots composés
 */
function getCommonWords(words1, words2) {
  const common = [];
  
  // Vérification exacte
  for (const word of words1) {
    if (words2.has(word)) {
      common.push(word);
    }
  }
  
  // ✅ NOUVELLE: Vérification partielle pour mots composés
  // Ex: "garcon" dans "garconfrancais"
  if (common.length === 0) {
    for (const word1 of words1) {
      for (const word2 of words2) {
        // Si un mot est contenu dans l'autre (et suffisamment long)
        if (word1.length >= 4 && word2.includes(word1)) {
          common.push(word1);
        } else if (word2.length >= 4 && word1.includes(word2)) {
          common.push(word2);
        }
      }
    }
  }
  
  return common;
}

/**
 * Calcule la similarité textuelle (Dice coefficient)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const bigrams1 = getBigrams(str1);
  const bigrams2 = getBigrams(str2);

  if (bigrams1.size === 0 || bigrams2.size === 0) return 0;

  let intersection = 0;
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) {
      intersection++;
    }
  }

  return (2.0 * intersection) / (bigrams1.size + bigrams2.size);
}

/**
 * Génère les bigrammes d'une chaîne
 */
function getBigrams(str) {
  const bigrams = new Set();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.substring(i, i + 2));
  }
  return bigrams;
}
