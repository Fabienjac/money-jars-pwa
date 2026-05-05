// netlify/functions/parseVoiceSpending.js
// Analyse un texte naturel pour en extraire une dépense structurée via Gemini

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "GEMINI_API_KEY manquante dans les variables d'environnement" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON invalide" }) };
  }

  const { text, today } = body;
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Le champ 'text' est requis" }) };
  }

  const todayStr = today || new Date().toISOString().slice(0, 10);

  const prompt = `Tu es un assistant financier personnel. Analyse ce texte en français et extrais les informations d'une dépense.

Tags disponibles (utilise exactement ces IDs):
- "alimentaire" : nourriture, fruits, légumes, marché, épicerie, boulangerie, poisson, viande, boisson alimentaire
- "vie_quotidienne" : courses générales, supermarché, dépenses courantes du quotidien
- "sante_corps" : pharmacie, médecin, dentiste, sport, gym, coiffeur, bien-être
- "transport" : essence, parking, autoroute, train, bus, métro, taxi, vélo, avion
- "habitat" : loyer, électricité, eau, gaz, internet, réparations, meubles, bricolage
- "loisirs" : cinéma, bar, sortie, spectacle, voyage, hôtel, café (lieu de sortie)
- "evolution" : formation, livre, cours en ligne, abonnement professionnel
- "administratif" : impôts, assurance, frais bancaires, amende, documents officiels
- "don_cadeau" : cadeau, don, association

Jarres (codes exacts):
- "NEC" : nécessités quotidiennes (nourriture, transport quotidien, loyer, santé courante, courses)
- "PLAY" : plaisir (restaurants de plaisir, sorties, cinéma, voyages de plaisir)
- "EDUC" : éducation et développement personnel
- "GIFT" : cadeaux et dons
- "FFA" : investissements, liberté financière
- "LTSS" : épargne long terme

Comptes de paiement: "Cash", "Revolut", "N26"
- "cash", "espèces", "liquide", "en liquide" → "Cash"
- "revolut" → "Revolut"
- "n26" → "N26"
- Non mentionné → "Cash" par défaut

Date actuelle: ${todayStr}
- "aujourd'hui" → ${todayStr}
- "hier" → calcule la veille de ${todayStr}

Texte: "${text.replace(/"/g, "'")}"

Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans backticks):
{"description":"description courte max 50 chars","amount":0.00,"date":"YYYY-MM-DD","jar":"NEC","tags":["tag1"],"account":"Cash","currency":"EUR"}`;

  // Essaie les modèles dans l'ordre (fallback si surchargé)
  const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

  for (const model of MODELS) {
    let geminiRes;
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
          }),
        }
      );
    } catch (fetchErr) {
      console.warn(`Fetch error for ${model}:`, fetchErr.message);
      continue; // essaie le modèle suivant
    }

    // 503 = surchargé → essaie le suivant
    if (geminiRes.status === 503 || geminiRes.status === 429) {
      console.warn(`${model} returned ${geminiRes.status}, trying next model…`);
      continue;
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error(`Gemini ${model} error:`, errText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: `Erreur Gemini API (${geminiRes.status})` }),
      };
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error(`${model} non-parseable response:`, cleaned);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Réponse IA non parseable", raw: cleaned.slice(0, 200) }),
      };
    }

    // Validation et valeurs par défaut
    const result = {
      description: String(parsed.description || "Dépense").slice(0, 80),
      amount: Math.abs(parseFloat(parsed.amount) || 0),
      date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : todayStr,
      jar: ["NEC", "PLAY", "EDUC", "GIFT", "FFA", "LTSS"].includes(parsed.jar) ? parsed.jar : "NEC",
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter(t => typeof t === "string") : [],
      account: ["Cash", "Revolut", "N26"].includes(parsed.account) ? parsed.account : "Cash",
      currency: String(parsed.currency || "EUR"),
    };

    console.log(`✅ Parsed via ${model}:`, result);
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  }

  // Tous les modèles ont échoué
  return {
    statusCode: 503,
    headers,
    body: JSON.stringify({ error: "Service IA temporairement indisponible. Réessayez dans quelques secondes." }),
  };
};
