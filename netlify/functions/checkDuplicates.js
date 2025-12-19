// netlify/functions/checkDuplicates.js
// Détection de doublons basée sur MONTANT + DATE (prioritaire)
// La description est secondaire

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { transactions, type = "spending" } = JSON.parse(event.body);

    if (!transactions || !Array.isArray(transactions)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid transactions array" }),
      };
    }

    console.log(`🔍 Vérification de ${transactions.length} ${type === "revenue" ? "revenus" : "transactions"} pour doublons`);

    // Récupérer les transactions existantes depuis Google Sheets (Spendings ou Revenues)
    const existingTransactions = await fetchExistingTransactions(type);

    if (!existingTransactions || existingTransactions.length === 0) {
      console.log("⚠️ Aucune transaction existante, rien à vérifier");
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          transactions: transactions.map(t => ({
            ...t,
            isDuplicate: false,
            duplicateNote: null,
          })),
        }),
      };
    }

    console.log(`📊 ${existingTransactions.length} ${type === "revenue" ? "revenus" : "dépenses"} existant(e)s récupéré(e)s`);

    // Vérifier chaque transaction
    const result = transactions.map((transaction, index) => {
      console.log(`\n🔍 Vérification transaction ${index + 1}: {`,
        `date: '${transaction.date}',`,
        `amount: ${transaction.amount},`,
        `description: '${transaction.description || transaction.suggestedSource}'`,
      `}`);

      const duplicate = findDuplicate(transaction, existingTransactions);

      if (duplicate) {
        console.log(`  ⚠️ DOUBLON CONFIRMÉ:`, duplicate.reason);
        return {
          ...transaction,
          isDuplicate: true,
          duplicateNote: duplicate.note,
          duplicateConfidence: duplicate.confidence,
        };
      } else {
        console.log(`  ✅ Pas de doublon`);
        return {
          ...transaction,
          isDuplicate: false,
          duplicateNote: null,
        };
      }
    });

    const duplicateCount = result.filter(t => t.isDuplicate).length;
    console.log(`\n✅ ${duplicateCount} doublon(s) détecté(s)`);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ transactions: result }),
    };
  } catch (error) {
    console.error("❌ Erreur check duplicates:", error);
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
 * Trouve un doublon selon la stratégie : MONTANT + DATE prioritaire
 */
function findDuplicate(transaction, existingTransactions) {
  const { date, amount, description } = transaction;

  // NIVEAU 1 : Match PARFAIT (montant + date identiques)
  const perfectMatch = existingTransactions.find(existing => {
    return (
      existing.date === date &&
      Math.abs(existing.amount - amount) < 0.01 // Tolérance de 1 centime
    );
  });

  if (perfectMatch) {
    const descSimilarity = calculateSimilarity(description, perfectMatch.description);
    
    return {
      reason: `Même montant (${amount}€) et date (${date})`,
      note: `Déjà enregistré le ${perfectMatch.date}`,
      confidence: "HIGH", // Haute confiance
      existing: perfectMatch,
      similarity: descSimilarity,
    };
  }

  // NIVEAU 2 : Match PROCHE (montant identique + date ±2 jours)
  const closeMatches = existingTransactions.filter(existing => {
    if (Math.abs(existing.amount - amount) > 0.01) return false;

    const existingDate = new Date(existing.date);
    const transactionDate = new Date(date);
    const daysDiff = Math.abs((existingDate - transactionDate) / (1000 * 60 * 60 * 24));

    return daysDiff <= 2; // Dans les 2 jours
  });

  if (closeMatches.length > 0) {
    // Trier par similarité de description
    const sorted = closeMatches
      .map(existing => ({
        existing,
        similarity: calculateSimilarity(description, existing.description),
        daysDiff: Math.abs((new Date(existing.date) - new Date(date)) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => {
        // D'abord par similarité, puis par proximité de date
        if (b.similarity !== a.similarity) {
          return b.similarity - a.similarity;
        }
        return a.daysDiff - b.daysDiff;
      });

    const best = sorted[0];

    // Si similarité > 20% OU date exacte, c'est probablement un doublon
    if (best.similarity > 0.2 || best.daysDiff === 0) {
      return {
        reason: `Même montant (${amount}€) et date proche (±${Math.round(best.daysDiff)}j)`,
        note: `Possiblement déjà enregistré le ${best.existing.date}`,
        confidence: best.daysDiff === 0 ? "HIGH" : "MEDIUM",
        existing: best.existing,
        similarity: best.similarity,
      };
    }
  }

  // NIVEAU 3 : Aucun doublon détecté
  return null;
}

/**
 * Calcule la similarité entre deux descriptions (0 = différent, 1 = identique)
 */
function calculateSimilarity(desc1, desc2) {
  if (!desc1 || !desc2) return 0;

  const normalize = (str) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();

  const s1 = normalize(desc1);
  const s2 = normalize(desc2);

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Vérifier si l'un contient l'autre
  if (s1.includes(s2) || s2.includes(s1)) {
    return Math.min(s2.length, s1.length) / Math.max(s1.length, s2.length);
  }

  // Calcul de similarité par mots communs
  const words1 = s1.split(/\s+/).filter(w => w.length > 2);
  const words2 = s2.split(/\s+/).filter(w => w.length > 2);

  if (words1.length === 0 || words2.length === 0) return 0;

  const commonWords = words1.filter(w => words2.includes(w));
  const similarity = (2 * commonWords.length) / (words1.length + words2.length);

  return similarity;
}

/**
 * Récupère les transactions existantes depuis Google Sheets
 */
async function fetchExistingTransactions(type = "spending") {
  try {
    console.log(`📡 Appel API Google Sheets (${type})...`);

    const baseUrl = process.env.GSCRIPT_URL;
    const apiKey = process.env.VITE_API_KEY;

    console.log("GSCRIPT_URL:", baseUrl ? "✅ Défini" : "❌ Manquant");
    console.log("API_KEY:", apiKey ? "✅ Défini" : "❌ Manquant");

    if (!baseUrl || !apiKey) {
      throw new Error("Missing GSCRIPT_URL or API_KEY");
    }

    // Utiliser l'action "list" pour récupérer les dépenses ou revenus
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "list",
        type: type, // "spending" ou "revenue"
        limit: 100, // Dernières 100 entrées
        key: apiKey,
      }),
    });

    console.log(`📡 Statut réponse: ${response.status}`);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.rows && Array.isArray(data.rows)) {
      console.log(`✅ ${data.rows.length} ${type === "revenue" ? "revenus" : "dépenses"} récupéré(e)s`);
      return data.rows;
    }

    console.warn("⚠️ Format de réponse inattendu:", data);
    return [];
  } catch (error) {
    console.error("❌ Erreur fetch transactions:", error);
    return [];
  }
}
