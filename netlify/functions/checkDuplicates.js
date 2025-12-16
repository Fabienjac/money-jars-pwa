// netlify/functions/checkDuplicates.js
// Vérifie si des transactions existent déjà dans Google Sheets

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { transactions } = JSON.parse(event.body);

    if (!transactions || !Array.isArray(transactions)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid transactions data" }),
      };
    }

    // Récupérer toutes les dépenses existantes
    const existingSpendingsResponse = await fetch(
      `${process.env.GSCRIPT_URL}?action=spendings&key=${process.env.VITE_API_KEY}`
    );

    if (!existingSpendingsResponse.ok) {
      console.warn("Impossible de récupérer les dépenses existantes");
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions }), // Retourner sans vérification
      };
    }

    const existingSpendings = await existingSpendingsResponse.json();

    console.log(`📊 ${existingSpendings.length} dépenses existantes`);
    console.log(`🔍 Vérification de ${transactions.length} transactions`);

    // Vérifier chaque transaction
    const transactionsWithDuplicateCheck = transactions.map((transaction) => {
      const duplicate = existingSpendings.find((existing) => {
        // Critères de doublon :
        // 1. Même date
        // 2. Même montant (à 0.01 près)
        // 3. Description similaire (au moins 50% de correspondance)

        const sameDate = existing.Date === transaction.date;
        const sameAmount = Math.abs(existing.Amount - transaction.amount) < 0.01;
        const descriptionSimilarity = calculateSimilarity(
          existing.Description?.toLowerCase() || "",
          transaction.description?.toLowerCase() || ""
        );

        return sameDate && sameAmount && descriptionSimilarity > 0.5;
      });

      if (duplicate) {
        console.log(`⚠️ Doublon détecté: ${transaction.description}`);
        return {
          ...transaction,
          isDuplicate: true,
          duplicateNote: `Déjà enregistré le ${duplicate.Date}`,
        };
      }

      return {
        ...transaction,
        isDuplicate: false,
        duplicateNote: null,
      };
    });

    const duplicateCount = transactionsWithDuplicateCheck.filter(
      (t) => t.isDuplicate
    ).length;

    console.log(`✅ ${duplicateCount} doublon(s) détecté(s)`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactions: transactionsWithDuplicateCheck,
        duplicateCount,
      }),
    };
  } catch (error) {
    console.error("Error checking duplicates:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to check duplicates",
        message: error.message,
      }),
    };
  }
};

/**
 * Calcule la similarité entre deux chaînes (0 = différent, 1 = identique)
 * Utilise l'algorithme de Levenshtein simplifié
 */
function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  // Normaliser les chaînes
  const normalized1 = str1.replace(/[^a-z0-9]/g, "");
  const normalized2 = str2.replace(/[^a-z0-9]/g, "");

  if (normalized1 === normalized2) return 1;

  // Calculer le pourcentage de mots communs
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);

  let commonWords = 0;
  for (const word1 of words1) {
    if (words2.some((word2) => word2.includes(word1) || word1.includes(word2))) {
      commonWords++;
    }
  }

  const similarity = (commonWords * 2) / (words1.length + words2.length);
  return similarity;
}
