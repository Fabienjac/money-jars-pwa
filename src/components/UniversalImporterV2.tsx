import React, { useState } from "react";
import { ColumnMappingStep } from "./ColumnMappingStep";

interface Transaction {
  date: string;
  description: string;
  amount: number;
  currency?: string;
  suggestedJar?: string;
  suggestedAccount?: string;
  suggestedSource?: string; // Pour les revenus
  suggestedMethod?: string; // Pour les revenus - méthode séparée
  valeur?: string; // Valeur (devise) pour les revenus
  quantiteCrypto?: string; // Quantité Crypto pour les revenus
  tauxUSDEUR?: string; // Taux USD/EUR pour les revenus
  adresseCrypto?: string; // Adresse crypto pour les revenus
  compteDestination?: string; // Compte de destination pour les revenus
  type?: string; // Type pour les revenus
  selected?: boolean;
  isDuplicate?: boolean;
  duplicateNote?: string | null;
  originalAmount?: number;
  originalCurrency?: string;
  conversionRate?: number | null;
  conversionNote?: string | null;
}

interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string;
  confidence: number;
}

interface FileStructure {
  headers: string[];
  rows: any[];
  preview: any[];
  suggestedMappings: ColumnMapping[];
  totalRows: number;
}

type TransactionType = "spending" | "revenue";

interface UniversalImporterV2Props {
  onImport: (transactions: Transaction[], type: TransactionType) => Promise<void>;
  defaultType?: TransactionType; // Type par défaut
}

type Step = "upload" | "mapping" | "review";

export const UniversalImporterV2: React.FC<UniversalImporterV2Props> = ({ 
  onImport,
  defaultType = "spending" 
}) => {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string>("");
  const [transactionType, setTransactionType] = useState<TransactionType>(defaultType);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Structure du fichier détectée
  const [fileStructure, setFileStructure] = useState<FileStructure | null>(null);
  
  // Mappings configurés
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  
  // Transactions transformées
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // Import en cours
  const [importing, setImporting] = useState(false);

  // États pour l'édition (en dehors du map)
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editedData, setEditedData] = useState<{
    date: string;
    description: string;
    amount: number;
    suggestedJar: string;
    suggestedAccount: string;
    suggestedSource?: string;
    suggestedMethod?: string;
    valeur?: string;
    quantiteCrypto?: string;
    tauxUSDEUR?: string;
    adresseCrypto?: string;
    compteDestination?: string;
    type?: string;
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);

    // Détecter le format
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") setFileFormat("pdf");
    else if (ext === "csv") setFileFormat("csv");
    else if (ext === "xlsx" || ext === "xls") setFileFormat("xlsx");
    else {
      setError("Format de fichier non supporté");
      setFile(null);
    }
  };

  const handleAnalyzeFile = async () => {
    if (!file || !fileFormat) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("format", fileFormat);

      const response = await fetch("/.netlify/functions/analyzeFile", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erreur lors de l'analyse du fichier");
      }

      const data = await response.json();
      console.log("📊 Structure détectée:", data.structure);

      setFileStructure(data.structure);
      setColumnMappings(data.structure.suggestedMappings);
      setStep("mapping");
    } catch (err: any) {
      console.error("Erreur analyse:", err);
      setError(err.message || "Erreur lors de l'analyse du fichier");
    } finally {
      setLoading(false);
    }
  };

  const handleMappingContinue = async () => {
    if (!fileStructure) return;

    setLoading(true);
    setError(null);

    try {
      // Transformer les données selon les mappings
      const transformedTransactions = transformData(
        fileStructure.rows,
        columnMappings,
        accountName
      );

      console.log(`✅ ${transformedTransactions.length} transactions transformées`);

      // Convertir les devises en EUR
      console.log("💱 Conversion des devises...");
      const transactionsWithConversion = await convertCurrencies(transformedTransactions);

      // Vérifier les doublons
      const transactionsWithDuplicates = await checkDuplicates(transactionsWithConversion);

      // Marquer comme sélectionnées (sauf doublons)
      const transactionsWithSelection = transactionsWithDuplicates.map(t => ({
        ...t,
        selected: !t.isDuplicate,
      }));

      setTransactions(transactionsWithSelection);
      setStep("review");
    } catch (err: any) {
      console.error("Erreur transformation:", err);
      setError(err.message || "Erreur lors de la transformation des données");
    } finally {
      setLoading(false);
    }
  };

  const transformData = (
    rows: any[],
    mappings: ColumnMapping[],
    account: string
  ): Transaction[] => {
    const dateMapping = mappings.find(m => m.targetColumn === "Date");
    
    // Pour les revenus, Source est optionnel (sera rempli avec le nom du compte)
    const descMapping = mappings.find(m => m.targetColumn === "Description" || m.targetColumn === "Source");
    
    // Pour les revenus, chercher "Montant", pour les dépenses chercher "Amount"
    const amountMapping = transactionType === "revenue"
      ? mappings.find(m => m.targetColumn === "Montant")
      : mappings.find(m => m.targetColumn === "Amount");
      
    const currencyMapping = mappings.find(m => m.targetColumn === "Currency" || m.targetColumn === "Valeur");
    const accountColMapping = mappings.find(m => m.targetColumn === "AccountColumn" || m.targetColumn === "CompteDestination");
    const methodeMapping = mappings.find(m => m.targetColumn === "Methode");
    const quantiteCryptoMapping = mappings.find(m => m.targetColumn === "QuantiteCrypto");
    const tauxUSDEURMapping = mappings.find(m => m.targetColumn === "TauxUSDEUR");
    const adresseCryptoMapping = mappings.find(m => m.targetColumn === "AdresseCrypto");
    const typeMapping = mappings.find(m => m.targetColumn === "Type");

    // Vérification : Date et Montant obligatoires pour tous
    // Description obligatoire pour dépenses, optionnel pour revenus
    if (!dateMapping || !amountMapping) {
      throw new Error(`Les colonnes Date et Montant sont obligatoires`);
    }
    
    if (transactionType === "spending" && !descMapping) {
      throw new Error(`La colonne Description est obligatoire pour les dépenses`);
    }

    return rows.map(row => {
      // Extraire les valeurs
      let date = String(row[dateMapping.sourceColumn] || "");
      const description = descMapping ? String(row[descMapping.sourceColumn] || "") : "";
      let amountValue = row[amountMapping.sourceColumn];
      const accountCol = accountColMapping ? String(row[accountColMapping.sourceColumn] || "") : "";
      const methode = methodeMapping ? String(row[methodeMapping.sourceColumn] || "") : "";
      const quantiteCrypto = quantiteCryptoMapping ? String(row[quantiteCryptoMapping.sourceColumn] || "") : "";
      const tauxUSDEUR = tauxUSDEURMapping ? String(row[tauxUSDEURMapping.sourceColumn] || "") : "";
      const adresseCrypto = adresseCryptoMapping ? String(row[adresseCryptoMapping.sourceColumn] || "") : "";
      const typeValue = typeMapping ? String(row[typeMapping.sourceColumn] || "") : "";

      // Normaliser la date
      date = normalizeDate(date);

      // Gérer le montant et la devise
      let amount = 0;
      let currency = "EUR";

      // Si colonne Currency/Valeur existe, l'utiliser
      if (currencyMapping) {
        currency = String(row[currencyMapping.sourceColumn] || "EUR");
      }

      // Parser le montant
      if (typeof amountValue === "number") {
        // Déjà un nombre
        amount = Math.abs(amountValue);
      } else {
        // String : peut contenir la devise
        const amountStr = String(amountValue || "");
        
        // Essayer d'extraire montant + devise
        const amountMatch = amountStr.match(/(-?\d{1,3}(?:[,]\d{3})*(?:\.\d{2}))\s*(EUR|USD|AUD|GBP|CAD|CHF|THB|CNY|JPY)?/);
        
        if (amountMatch) {
          amount = Math.abs(parseFloat(amountMatch[1].replace(",", "")));
          if (amountMatch[2]) {
            currency = amountMatch[2]; // Override avec la devise trouvée
          }
        } else {
          // Fallback : parse simple
          amount = Math.abs(parseFloat(amountStr.replace(/[^\d.-]/g, "").replace(",", ".")));
        }
      }

      if (isNaN(amount)) amount = 0;

      // Pour les revenus, mettre la source dans suggestedSource
      if (transactionType === "revenue") {
        // Source = SEULEMENT le nom du compte (ou la colonne Source si mappée)
        const source = description || account || "Imported";
        
        return {
          date,
          description: "", // Pas de description pour les revenus
          amount,
          currency,
          suggestedJar: "",
          suggestedAccount: accountCol || account || "Imported",
          suggestedSource: source, // Source simple : "LGM"
          suggestedMethod: methode, // Méthode séparée : "USDT(TRC20)"
          valeur: currency, // Valeur = devise
          quantiteCrypto,
          tauxUSDEUR,
          adresseCrypto,
          compteDestination: accountCol,
          type: typeValue,
        };
      }

      // Pour les dépenses, comportement normal
      return {
        date,
        description,
        amount,
        currency,
        suggestedJar: suggestJar(description),
        suggestedAccount: accountCol || account || "Imported",
      };
    }).filter(t => t.date && (t.description || t.suggestedSource) && t.amount > 0);
  };

  const normalizeDate = (date: string): string => {
    if (!date) return "";

    // YYYY-MM-DD (déjà bon)
    if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return date;
    }

    // DD/MM/YYYY
    if (date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [day, month, year] = date.split("/");
      return `${year}-${month}-${day}`;
    }

    // Format LGM: "21 November 2025 , 02 : 37am"
    const lgmMatch = date.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (lgmMatch) {
      const monthMap: Record<string, string> = {
        january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
        july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
      };
      const month = monthMap[lgmMatch[2].toLowerCase()];
      const day = lgmMatch[1].padStart(2, "0");
      const year = lgmMatch[3];
      return `${year}-${month}-${day}`;
    }

    // Month DD, YYYY
    const monthMatch = date.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/);
    if (monthMatch) {
      const monthMap: Record<string, string> = {
        Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
        Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
      };
      const month = monthMap[monthMatch[1]];
      const day = monthMatch[2].padStart(2, "0");
      const year = monthMatch[3];
      return `${year}-${month}-${day}`;
    }

    // Timestamp format (YYYY-MM-DD HH:MM:SS)
    if (date.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/)) {
      return date.split(" ")[0];
    }

    return date;
  };

  const suggestJar = (description: string): string => {
    const desc = description.toLowerCase();

    const rules: Record<string, string[]> = {
      NEC: [
        "pharmacie", "gal", "intermarche", "semello", "cevennalgues",
        "phytonut", "nutreine", "garcon", "carrefour", "lidl", "free",
        "biovie", "zencleanz", "carre frais", "provenc", "decathlon",
      ],
      PLAY: [
        "airbnb", "booking", "hotel", "trip", "kiwi", "yanssie",
        "restaurant", "cinema", "netflix", "ryanair", "air france",
        "sncf", "vinci", "rompetrol", "canal", "traveloka", "omise",
        "jeremy",
      ],
      EDUC: ["success resources", "formation", "udemy", "ihr einkau"],
      GIFT: ["gofundme", "don", "charity", "soul travel", "chevry"],
    };

    for (const [jar, keywords] of Object.entries(rules)) {
      if (keywords.some((keyword) => desc.includes(keyword))) {
        return jar;
      }
    }

    return "NEC";
  };

  const convertCurrencies = async (transactions: Transaction[]): Promise<Transaction[]> => {
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
        } catch (error: any) {
          console.error(
            `❌ Conversion failed for ${transaction.currency}:`,
            error.message
          );

          // En cas d'erreur, garder le montant original avec warning
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
  };

  const getHistoricalRate = async (
    fromCurrency: string,
    toCurrency: string,
    date: string
  ): Promise<number> => {
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
  };

  const checkDuplicates = async (transactions: Transaction[]): Promise<Transaction[]> => {
    try {
      console.log(`🔍 Vérification de ${transactions.length} transactions pour doublons`);

      const response = await fetch("/.netlify/functions/checkDuplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          transactions,
          type: transactionType // Envoyer le type (spending ou revenue)
        }),
      });

      if (!response.ok) {
        console.warn("⚠️ Impossible de vérifier les doublons");
        return transactions.map(t => ({ ...t, isDuplicate: false, duplicateNote: null }));
      }

      const data = await response.json();
      console.log(`✅ Vérification terminée: ${data.transactions?.filter((t: any) => t.isDuplicate).length || 0} doublon(s)`);
      
      return data.transactions || transactions;
    } catch (error) {
      console.error("Erreur check doublons:", error);
      return transactions.map(t => ({ ...t, isDuplicate: false, duplicateNote: null }));
    }
  };

  const handleImportTransactions = async () => {
    const selectedTransactions = transactions.filter(t => t.selected);
    
    if (selectedTransactions.length === 0) return;

    setImporting(true);

    try {
      await onImport(selectedTransactions, transactionType); // Passer le type
      
      // Reset
      setFile(null);
      setFileFormat(null);
      setAccountName("");
      setFileStructure(null);
      setColumnMappings([]);
      setTransactions([]);
      setStep("upload");
    } catch (error) {
      console.error("Erreur import:", error);
      setError("Erreur lors de l'import des transactions");
    } finally {
      setImporting(false);
    }
  };

  const toggleTransaction = (index: number) => {
    setTransactions(prev =>
      prev.map((t, i) => (i === index ? { ...t, selected: !t.selected } : t))
    );
  };

  const selectedCount = transactions.filter(t => t.selected).length;
  const duplicateCount = transactions.filter(t => t.isDuplicate).length;

  // Render selon l'étape
  if (step === "mapping" && fileStructure) {
    return (
      <ColumnMappingStep
        headers={fileStructure.headers}
        preview={fileStructure.preview}
        suggestedMappings={columnMappings}
        onMappingChange={setColumnMappings}
        onBack={() => setStep("upload")}
        onContinue={handleMappingContinue}
        type={transactionType}
      />
    );
  }

  if (step === "review") {
    return (
      <div style={{ 
        height: "100%", 
        display: "flex", 
        flexDirection: "column",
        padding: "20px",
        paddingBottom: "0",
      }}>
        {/* Header fixe */}
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          marginBottom: "16px",
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "700" }}>
            📋 Révision des transactions
          </h2>
          <button
            onClick={() => setStep("upload")}
            style={{
              padding: "8px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-main)",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            ← Retour
          </button>
        </div>

        <p style={{ 
          color: "var(--text-muted)", 
          marginBottom: "12px",
          flexShrink: 0,
        }}>
          {transactions.length} transaction(s) • {duplicateCount} doublon(s) • {selectedCount} sélectionnée(s)
        </p>

        {/* Toggle all */}
        <div
          style={{
            padding: "12px 16px",
            marginBottom: "12px",
            borderRadius: "12px",
            backgroundColor: "rgba(0, 122, 255, 0.1)",
            border: "1px solid rgba(0, 122, 255, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            cursor: "pointer",
            flexShrink: 0,
          }}
          onClick={() => {
            const allSelected = transactions.filter(t => !t.isDuplicate).every(t => t.selected);
            setTransactions(prev =>
              prev.map(t => (t.isDuplicate ? t : { ...t, selected: !allSelected }))
            );
          }}
        >
          <input
            type="checkbox"
            checked={transactions.filter(t => !t.isDuplicate).every(t => t.selected)}
            onChange={() => {}}
            style={{ width: "20px", height: "20px", cursor: "pointer" }}
          />
          <span style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)" }}>
            Tout sélectionner / désélectionner
          </span>
          <span style={{ marginLeft: "auto", fontSize: "14px", color: "#007AFF", fontWeight: "600" }}>
            {selectedCount} sélectionnée(s)
          </span>
        </div>

        {/* Liste scrollable - prend l'espace disponible */}
        <div style={{ 
          flex: 1,
          overflowY: "auto", 
          marginBottom: "12px",
          minHeight: 0, // Important pour le flex
        }}>
          {transactions.map((t, i) => {
            const isEditing = editingIndex === i;
            
            const handleStartEdit = () => {
              setEditingIndex(i);
              setEditedData({
                date: t.date,
                description: t.description || "",
                amount: t.amount,
                suggestedJar: t.suggestedJar || "NEC",
                suggestedAccount: t.suggestedAccount || "",
                suggestedSource: t.suggestedSource || t.suggestedAccount || t.description || "",
                suggestedMethod: t.suggestedMethod || "",
                valeur: t.valeur || t.currency || "",
                quantiteCrypto: t.quantiteCrypto || "",
                tauxUSDEUR: t.tauxUSDEUR || "",
                adresseCrypto: t.adresseCrypto || "",
                compteDestination: t.compteDestination || "",
                type: t.type || "",
              });
            };

            const handleSaveEdit = () => {
              if (editedData) {
                setTransactions(prev =>
                  prev.map((transaction, idx) =>
                    idx === i ? { ...transaction, ...editedData } : transaction
                  )
                );
              }
              setEditingIndex(null);
              setEditedData(null);
            };

            const handleCancelEdit = () => {
              setEditingIndex(null);
              setEditedData(null);
            };

            return (
              <div
                key={i}
                style={{
                  padding: "12px",
                  marginBottom: "8px",
                  border: `2px solid ${
                    t.isDuplicate ? "#FF9500" : t.selected ? "#007AFF" : "var(--border-color)"
                  }`,
                  borderRadius: "12px",
                  backgroundColor: t.isDuplicate
                    ? "rgba(255, 149, 0, 0.05)"
                    : t.selected
                    ? "rgba(0, 122, 255, 0.05)"
                    : "var(--bg-card)",
                  cursor: t.isDuplicate ? "not-allowed" : "pointer",
                  opacity: t.isDuplicate ? 0.7 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <input
                    type="checkbox"
                    checked={t.selected || false}
                    disabled={t.isDuplicate}
                    onChange={() => !t.isDuplicate && toggleTransaction(i)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: "20px",
                      height: "20px",
                      marginTop: "2px",
                      cursor: t.isDuplicate ? "not-allowed" : "pointer",
                    }}
                  />
                  <div style={{ flex: 1 }} onClick={() => !isEditing && !t.isDuplicate && toggleTransaction(i)}>
                    {!isEditing ? (
                      <>
                        {/* Vue normale compacte */}
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                            📅 {t.date}
                          </span>
                          <span style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-main)" }}>
                            {t.amount.toFixed(2)} {t.currency}
                          </span>
                        </div>

                        <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-main)", marginBottom: "4px" }}>
                          {t.description || t.suggestedSource}
                        </div>

                        {t.conversionNote && (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#34C759",
                              marginBottom: "4px",
                              padding: "2px 6px",
                              backgroundColor: "rgba(52, 199, 89, 0.1)",
                              borderRadius: "4px",
                              display: "inline-block",
                            }}
                          >
                            💱 {t.conversionNote}
                          </div>
                        )}

                        <div style={{ display: "flex", gap: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                          {transactionType === "spending" ? (
                            <>
                              <span>🏺 <strong>{t.suggestedJar}</strong></span>
                              <span>🏦 <strong>{t.suggestedAccount}</strong></span>
                            </>
                          ) : (
                            <>
                              <span>💼 Source: <strong>{t.suggestedSource || t.suggestedAccount}</strong></span>
                              {t.suggestedMethod && <span>🔄 Méthode: <strong>{t.suggestedMethod}</strong></span>}
                            </>
                          )}
                        </div>

                        {t.isDuplicate && (
                          <div
                            style={{
                              marginTop: "6px",
                              padding: "6px 10px",
                              backgroundColor: "rgba(255, 149, 0, 0.1)",
                              borderRadius: "6px",
                              fontSize: "12px",
                              color: "#FF9500",
                              fontWeight: "600",
                            }}
                          >
                            ⚠️ DOUBLON
                          </div>
                        )}

                        {/* Bouton Modifier */}
                        {!t.isDuplicate && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit();
                            }}
                            style={{
                              marginTop: "6px",
                              padding: "4px 10px",
                              borderRadius: "6px",
                              border: "1px solid var(--border-color)",
                              background: "var(--bg-card)",
                              color: "var(--text-main)",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            ✏️ Modifier
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Mode édition */}
                        {editedData && (
                          <div style={{ display: "grid", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
                            {/* Ligne 1: Date + Montant */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                              <div>
                                <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                  📅 Date
                                </label>
                                <input
                                  type="date"
                                  value={editedData.date}
                                  onChange={(e) => setEditedData({ ...editedData, date: e.target.value })}
                                  style={{
                                    width: "100%",
                                    padding: "6px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border-color)",
                                    backgroundColor: "var(--bg-body)",
                                    color: "var(--text-main)",
                                    fontSize: "13px",
                                  }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                  💰 Montant (EUR)
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editedData.amount}
                                  onChange={(e) => setEditedData({ ...editedData, amount: parseFloat(e.target.value) || 0 })}
                                  style={{
                                    width: "100%",
                                    padding: "6px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border-color)",
                                    backgroundColor: "var(--bg-body)",
                                    color: "var(--text-main)",
                                    fontSize: "13px",
                                  }}
                                />
                              </div>
                            </div>

                            {/* Formulaire différent selon le type */}
                            {transactionType === "revenue" ? (
                              <>
                                {/* Ligne 2: Source + Méthode */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                  <div>
                                    <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                      💼 Source
                                    </label>
                                    <input
                                      type="text"
                                      value={editedData.suggestedSource || ""}
                                      onChange={(e) => setEditedData({ ...editedData, suggestedSource: e.target.value })}
                                      style={{
                                        width: "100%",
                                        padding: "6px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "var(--bg-body)",
                                        color: "var(--text-main)",
                                        fontSize: "13px",
                                      }}
                                    />
                                  </div>

                                  <div>
                                    <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                      🔄 Méthode
                                    </label>
                                    <input
                                      type="text"
                                      value={editedData.suggestedMethod || ""}
                                      onChange={(e) => setEditedData({ ...editedData, suggestedMethod: e.target.value })}
                                      style={{
                                        width: "100%",
                                        padding: "6px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "var(--bg-body)",
                                        color: "var(--text-main)",
                                        fontSize: "13px",
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Ligne 3: Valeur + Quantité Crypto */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                  <div>
                                    <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                      💵 Valeur (devise)
                                    </label>
                                    <input
                                      type="text"
                                      value={editedData.valeur || ""}
                                      onChange={(e) => setEditedData({ ...editedData, valeur: e.target.value })}
                                      style={{
                                        width: "100%",
                                        padding: "6px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "var(--bg-body)",
                                        color: "var(--text-main)",
                                        fontSize: "13px",
                                      }}
                                    />
                                  </div>

                                  <div>
                                    <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                      🪙 Quantité Crypto
                                    </label>
                                    <input
                                      type="text"
                                      value={editedData.quantiteCrypto || ""}
                                      onChange={(e) => setEditedData({ ...editedData, quantiteCrypto: e.target.value })}
                                      style={{
                                        width: "100%",
                                        padding: "6px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "var(--bg-body)",
                                        color: "var(--text-main)",
                                        fontSize: "13px",
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Ligne 4: Taux USD/EUR + Type */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                  <div>
                                    <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                      📊 Taux USD/EUR
                                    </label>
                                    <input
                                      type="text"
                                      value={editedData.tauxUSDEUR || ""}
                                      onChange={(e) => setEditedData({ ...editedData, tauxUSDEUR: e.target.value })}
                                      style={{
                                        width: "100%",
                                        padding: "6px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "var(--bg-body)",
                                        color: "var(--text-main)",
                                        fontSize: "13px",
                                      }}
                                    />
                                  </div>

                                  <div>
                                    <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                      🏷️ Type
                                    </label>
                                    <input
                                      type="text"
                                      value={editedData.type || ""}
                                      onChange={(e) => setEditedData({ ...editedData, type: e.target.value })}
                                      style={{
                                        width: "100%",
                                        padding: "6px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "var(--bg-body)",
                                        color: "var(--text-main)",
                                        fontSize: "13px",
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Ligne 5: Adresse crypto (pleine largeur) */}
                                <div>
                                  <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                    🔐 Adresse crypto
                                  </label>
                                  <input
                                    type="text"
                                    value={editedData.adresseCrypto || ""}
                                    onChange={(e) => setEditedData({ ...editedData, adresseCrypto: e.target.value })}
                                    style={{
                                      width: "100%",
                                      padding: "6px",
                                      borderRadius: "6px",
                                      border: "1px solid var(--border-color)",
                                      backgroundColor: "var(--bg-body)",
                                      color: "var(--text-main)",
                                      fontSize: "13px",
                                    }}
                                  />
                                </div>

                                {/* Ligne 6: Compte de destination (pleine largeur) */}
                                <div>
                                  <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                    🏦 Compte de destination
                                  </label>
                                  <input
                                    type="text"
                                    value={editedData.compteDestination || ""}
                                    onChange={(e) => setEditedData({ ...editedData, compteDestination: e.target.value })}
                                    style={{
                                      width: "100%",
                                      padding: "6px",
                                      borderRadius: "6px",
                                      border: "1px solid var(--border-color)",
                                      backgroundColor: "var(--bg-body)",
                                      color: "var(--text-main)",
                                      fontSize: "13px",
                                    }}
                                  />
                                </div>
                              </>
                            ) : (
                              <>
                                {/* Pour les dépenses: Description + Jarre + Compte */}
                                {/* Ligne 2: Description (pleine largeur) */}
                                <div>
                                  <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                    📝 Description
                                  </label>
                                  <input
                                    type="text"
                                    value={editedData.description}
                                    onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
                                    style={{
                                      width: "100%",
                                      padding: "6px",
                                      borderRadius: "6px",
                                      border: "1px solid var(--border-color)",
                                      backgroundColor: "var(--bg-body)",
                                      color: "var(--text-main)",
                                      fontSize: "13px",
                                    }}
                                  />
                                </div>

                                {/* Ligne 3: Jarre + Compte */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                  <div>
                                    <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                      🏺 Jarre
                                    </label>
                                    <select
                                      value={editedData.suggestedJar}
                                      onChange={(e) => setEditedData({ ...editedData, suggestedJar: e.target.value })}
                                      style={{
                                        width: "100%",
                                        padding: "6px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "var(--bg-body)",
                                        color: "var(--text-main)",
                                        fontSize: "13px",
                                      }}
                                    >
                                      <option value="NEC">NEC</option>
                                      <option value="FFA">FFA</option>
                                      <option value="LTSS">LTSS</option>
                                      <option value="PLAY">PLAY</option>
                                      <option value="EDUC">EDUC</option>
                                      <option value="GIFT">GIFT</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                                      🏦 Compte
                                    </label>
                                    <input
                                      type="text"
                                      value={editedData.suggestedAccount}
                                      onChange={(e) => setEditedData({ ...editedData, suggestedAccount: e.target.value })}
                                      style={{
                                        width: "100%",
                                        padding: "6px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "var(--bg-body)",
                                        color: "var(--text-main)",
                                        fontSize: "13px",
                                      }}
                                    />
                                  </div>
                                </div>
                              </>
                            )}

                            {/* Boutons */}
                            <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                              <button
                                onClick={handleSaveEdit}
                                style={{
                                  flex: 1,
                                  padding: "8px",
                                  borderRadius: "6px",
                                  border: "none",
                                  background: "#34C759",
                                  color: "white",
                                  fontSize: "13px",
                                  fontWeight: "600",
                                  cursor: "pointer",
                                }}
                              >
                                ✅ Sauvegarder
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelEdit();
                                }}
                                style={{
                                  flex: 1,
                                  padding: "8px",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border-color)",
                                  background: "var(--bg-card)",
                                  color: "var(--text-main)",
                                  fontSize: "13px",
                                  cursor: "pointer",
                                }}
                              >
                                ❌ Annuler
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bouton import fixe en bas */}
        <div style={{ 
          flexShrink: 0,
          padding: "16px 20px",
          margin: "0 -20px",
          backgroundColor: "var(--bg-body)",
          borderTop: "1px solid var(--border-color)",
        }}>
          <button
            onClick={handleImportTransactions}
            disabled={selectedCount === 0 || importing}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background:
                selectedCount > 0 && !importing
                  ? "linear-gradient(135deg, var(--jar-nec) 0%, #0051d5 100%)"
                  : "var(--border-color)",
              color: "white",
              fontSize: "16px",
              fontWeight: "700",
              cursor: selectedCount > 0 && !importing ? "pointer" : "not-allowed",
              opacity: selectedCount > 0 && !importing ? 1 : 0.5,
              transition: "transform 0.2s",
            }}
            onMouseEnter={(e) => {
              if (selectedCount > 0 && !importing) {
                e.currentTarget.style.transform = "translateY(-2px)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {importing ? "⏳ Import..." : `Importer ${selectedCount} transaction(s)`}
          </button>
        </div>
      </div>
    );
  }

  // Étape upload (par défaut)
  return (
    <div style={{ 
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: "20px",
      paddingBottom: "0",
    }}>
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: "16px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "700", marginBottom: "20px" }}>
          📂 Importer des transactions
        </h2>

      {/* Type selector */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
          Type de transaction
        </label>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => setTransactionType("spending")}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "12px",
              border: `2px solid ${transactionType === "spending" ? "#007AFF" : "var(--border-color)"}`,
              background: transactionType === "spending" ? "rgba(0, 122, 255, 0.1)" : "var(--bg-card)",
              color: transactionType === "spending" ? "#007AFF" : "var(--text-main)",
              fontSize: "14px",
              fontWeight: transactionType === "spending" ? "700" : "600",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            💸 Dépense
          </button>
          <button
            onClick={() => setTransactionType("revenue")}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "12px",
              border: `2px solid ${transactionType === "revenue" ? "#34C759" : "var(--border-color)"}`,
              background: transactionType === "revenue" ? "rgba(52, 199, 89, 0.1)" : "var(--bg-card)",
              color: transactionType === "revenue" ? "#34C759" : "var(--text-main)",
              fontSize: "14px",
              fontWeight: transactionType === "revenue" ? "700" : "600",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            💰 Revenu
          </button>
        </div>
      </div>

      {/* File upload */}
      <div style={{ marginBottom: "20px" }}>
        <input
          type="file"
          accept=".pdf,.csv,.xlsx,.xls"
          onChange={handleFileChange}
          style={{ display: "none" }}
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          style={{
            display: "block",
            padding: "40px 20px",
            border: "2px dashed var(--border-color)",
            borderRadius: "12px",
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: "var(--bg-card)",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>📎</div>
          <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)" }}>
            {file ? file.name : "Choisir un fichier"}
          </div>
          <div style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "8px" }}>
            PDF, CSV ou Excel
          </div>
        </label>
      </div>

      {/* Account name */}
      {file && (
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
            Nom du compte
          </label>
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Ex: Revolut, RedotPay, N26..."
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--bg-card)",
              color: "var(--text-main)",
              fontSize: "14px",
            }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: "12px",
          marginBottom: "20px",
          borderRadius: "12px",
          backgroundColor: "rgba(255, 59, 48, 0.1)",
          color: "#FF3B30",
          fontSize: "14px",
        }}>
          {error}
        </div>
      )}
      </div>

      {/* Analyze button - Sticky en bas */}
      <div style={{
        flexShrink: 0,
        padding: "16px 20px",
        margin: "0 -20px",
        backgroundColor: "var(--bg-body)",
        borderTop: "1px solid var(--border-color)",
      }}>
        <button
          onClick={handleAnalyzeFile}
          disabled={!file || !accountName || loading}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "12px",
            border: "none",
            background: file && accountName && !loading
              ? "linear-gradient(135deg, var(--jar-nec) 0%, #0051d5 100%)"
              : "var(--border-color)",
            color: "white",
            fontSize: "16px",
            fontWeight: "700",
            cursor: file && accountName && !loading ? "pointer" : "not-allowed",
            opacity: file && accountName && !loading ? 1 : 0.5,
          }}
        >
          {loading ? "⏳ Analyse en cours..." : "Analyser le fichier"}
        </button>
      </div>
    </div>
  );
};
