// src/components/UniversalImporter.tsx - VERSION AVEC NOUVEAU MAPPING INVERSÉ
import React, { useState, useEffect, useRef } from "react";
import { JarKey } from "../types";
import { NewColumnMappingStep } from "./NewColumnMappingStep";
import { TransactionEditor } from "./TransactionEditor";
import { RevenueTransactionEditor } from "./RevenueTransactionEditor";
import { loadRevenueSources } from "../revenueSourcesUtils";
import { getRevenueAccounts } from "../api";

interface MatchDetails {
  dateMatch: string;
  amountMatch: string;
  descriptionMatch: string;
  dateDiff: number;
  amountDiff: number;
  amountDiffPercent: number;
  commonWords: string[];
  commonWordsCount: number;
  textSimilarity: number;
}

interface Account {
  name: string;
  emoji: string;
}

interface Transaction {
  date: string;
  description: string;
  amount: number;
  currency?: string;
  originalAmount?: number;
  originalCurrency?: string;
  conversionRate?: number | null;
  conversionNote?: string | null;
  suggestedJar?: JarKey;
  suggestedAccount?: string;
  suggestedSource?: string;  // Pour les revenus
  selected?: boolean;
  isDuplicate?: boolean;
  duplicateLevel?: number | null;
  duplicateConfidence?: number | null;
  duplicateNote?: string | null;
  matchDetails?: MatchDetails | null;
  matchedTransaction?: any;
  tags?: string;
  // ✅ CHAMPS CRYPTO POUR LES REVENUS
  valeur?: string; // ✅ Devise en texte (USD, EUR, JPY, etc.)
  quantiteCrypto?: number;
  methodeCrypto?: string;
  usdEurRate?: number;
  adresseCrypto?: string;
  compteDestination?: string;
  type?: string;
}

// Interfaces pour le nouveau système de mapping inversé
interface MappingOption {
  type: "empty" | "column" | "fixed";
  value?: string;
}

interface ColumnMapping {
  googleSheetColumn: string;
  option: MappingOption;
}

interface UniversalImporterProps {
  onImport: (transactions: Transaction[], type: "spending" | "revenue") => void;
  accounts?: Account[];
}

type FileFormat = "pdf" | "csv" | "xlsx";
type TransactionType = "spending" | "revenue";

export const UniversalImporter: React.FC<UniversalImporterProps> = ({
  onImport,
  accounts = [],
}) => {
  const [transactionType, setTransactionType] = useState<TransactionType | null>(null);
  const [defaultAccount, setDefaultAccount] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<FileFormat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [step, setStep] = useState<"selectType" | "upload" | "mapping" | "review">("selectType");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  
  // États pour le mapping de colonnes
  const [rawData, setRawData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  // On garde l'ancien state pour compatibilité mais on n'utilisera que le nouveau
  const [columnMappings, setColumnMappings] = useState<Array<{sourceColumn: string, targetColumn: string, confidence: number}>>([]);
  const [newColumnMappings, setNewColumnMappings] = useState<ColumnMapping[]>([]);

  // Cache des taux de change par (devise, date) pour éviter des appels répétés au proxy
  const rateCacheRef = useRef<Map<string, number>>(new Map());

  // Sources de revenu (chargées au montage et à chaque revenueAccountsUpdated)
  const [revenueSources, setRevenueSources] = useState<any[]>([]);

  useEffect(() => {
    getRevenueAccounts()
      .then((list) => setRevenueSources(Array.isArray(list) ? list : loadRevenueSources()))
      .catch(() => setRevenueSources(loadRevenueSources()));
  }, []);

  useEffect(() => {
    const reload = () =>
      getRevenueAccounts()
        .then((list) => setRevenueSources(Array.isArray(list) ? list : loadRevenueSources()))
        .catch(() => setRevenueSources(loadRevenueSources()));
    window.addEventListener("revenueAccountsUpdated", reload);
    return () => window.removeEventListener("revenueAccountsUpdated", reload);
  }, []);

  // États pour l'édition de transactions
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  // États pour l'édition de transactions de revenus
  const [editingRevenueTransaction, setEditingRevenueTransaction] = useState<Transaction | null>(null);
  const [editingRevenueIndex, setEditingRevenueIndex] = useState<number | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Détection du format
    const extension = selectedFile.name.split(".").pop()?.toLowerCase();
    let format: FileFormat | null = null;

    if (extension === "pdf") format = "pdf";
    else if (extension === "csv") format = "csv";
    else if (extension === "xlsx" || extension === "xls") format = "xlsx";

    if (format) {
      setFile(selectedFile);
      setFileFormat(format);
      setError(null);
    } else {
      setError(
        "Format non supporté. Veuillez sélectionner un fichier PDF, CSV ou XLSX."
      );
      setFile(null);
      setFileFormat(null);
    }
  };

  // ÉTAPE 1 : Analyser le fichier pour détecter la structure
  const extractTransactions = async () => {
    if (!file || !fileFormat) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("format", fileFormat);

      console.log("🔍 Analyse de la structure du fichier...");

      // ✅ UTILISER analyzeFile au lieu de parseFile
      const response = await fetch("/.netlify/functions/analyzeFile", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erreur API:", errorText);
        let backendMessage = "";
        try {
          const parsedError = JSON.parse(errorText);
          backendMessage = parsedError?.message ? ` ${parsedError.message}` : "";
        } catch {
          backendMessage = "";
        }
        const is404 = response.status === 404;
        const hint = is404 && typeof window !== "undefined" && window.location.port === "5173"
          ? " Lancez « npm run dev » (Netlify Dev) et ouvrez http://localhost:8888 pour activer l'import de fichiers."
          : "";
        throw new Error("Erreur lors de l'analyse du fichier." + backendMessage + hint);
      }

      const data = await response.json();
      
      console.log("✅ Structure détectée:", {
        headers: data.structure.headers,
        rows: data.structure.totalRows
      });
      
      // Stocker les données brutes et headers
      setRawData(data.structure.rows);
      setHeaders(data.structure.headers);
      setColumnMappings(data.structure.suggestedMappings);
      
      // Passer à l'étape de mapping
      setStep("mapping");
      
    } catch (err: any) {
      console.error("❌ Erreur extraction:", err);
      setError(err.message || "Erreur lors de l'extraction du fichier");
    } finally {
      setLoading(false);
    }
  };

  // ÉTAPE 2 : Appliquer le mapping de colonnes
  const applyMapping = async () => {
    setLoading(true);
    
    try {
      console.log("🔄 Application du mapping...");
      
      // Transformer les données brutes selon le mapping
      const mappedTransactions = rawData.map(row => {
        const mapped: any = {};
        
        // Appliquer chaque mapping
        columnMappings.forEach(mapping => {
          if (mapping.targetColumn !== "ignore") {
            const sourceValue = row[mapping.sourceColumn];
            mapped[mapping.targetColumn] = sourceValue;
          }
        });
        
        // 🐛 DEBUG: Voir ce qui est dans mapped
        console.log("📊 Mapped keys:", Object.keys(mapped));
        console.log("📊 Mapped values:", mapped);
        
        // Adapter au format Transaction
        const transaction: Transaction = {
          date: mapped.Date || "",
          description: String(mapped.Description ?? defaultAccount ?? "Transaction"),
          amount: parseFloat(mapped.Amount || mapped.Montant || "0"),
          suggestedAccount: transactionType === "spending" ? defaultAccount || mapped.Account || "" : "",
          suggestedSource: transactionType === "revenue" ? defaultAccount : undefined,
          suggestedJar: (mapped.Jar as JarKey) || "NEC",
          currency: mapped.Currency || "EUR",
          originalCurrency: mapped.Currency || "EUR",
          originalAmount: row.OriginalAmount || parseFloat(mapped.Amount || mapped.Montant || "0"),
          selected: true,
          // ✅ AJOUT DES CHAMPS CRYPTO - Essayer plusieurs variantes
          valeur: mapped["Valeur (devise)"] || mapped["Valeur"] || undefined, // ✅ Garder comme string
          quantiteCrypto: mapped["Quantité Crypto"] || mapped["QuantitéCrypto"] || mapped["Quantité"] ? parseFloat(mapped["Quantité Crypto"] || mapped["QuantitéCrypto"] || mapped["Quantité"]) : undefined,
          methodeCrypto: mapped["Méthode"] || mapped["Methode"] || undefined,
          usdEurRate: mapped["Taux USD/EUR"] || mapped["TauxUSDEUR"] || mapped["Taux"] ? parseFloat(mapped["Taux USD/EUR"] || mapped["TauxUSDEUR"] || mapped["Taux"]) : undefined,
          adresseCrypto: mapped["Adresse crypto"] || mapped["AdresseCrypto"] || mapped["Adresse"] || undefined,
          compteDestination: mapped["Compte de destination"] || undefined,
          type: mapped["Type"] || undefined,
        };
        
        return transaction;
      });
      
      console.log(`📊 ${mappedTransactions.length} transactions mappées`);
      
      // ✅ CONVERTIR LES DEVISES EN EUR AVANT LA VÉRIFICATION DES DOUBLONS
      console.log("💱 Conversion des devises en EUR...");
      const convertedTransactions = await convertCurrenciesToEUR(mappedTransactions);
      
      // Vérifier les doublons APRÈS conversion
      console.log("🔍 Vérification des doublons...");
      const checkedTransactions = await checkDuplicates(convertedTransactions);
      
      const duplicateCount = checkedTransactions.filter(t => t.isDuplicate).length;
      console.log(`⚠️ ${duplicateCount} doublon(s) détecté(s)`);
      
      // 🔍 DEBUG : Afficher quelques exemples
      console.log("🔍 DEBUG - Première transaction reçue:", JSON.stringify(checkedTransactions[0]));
      if (checkedTransactions.length > 1) {
        console.log("🔍 DEBUG - Deuxième transaction reçue:", JSON.stringify(checkedTransactions[1]));
      }
      
      // ✅ LOGIQUE CORRECTE : 
      // - DÉSÉLECTIONNER tous les doublons (déjà dans Google Sheets)
      // - SÉLECTIONNER uniquement les nouvelles transactions (pas de doublon détecté)
      const withSelection = checkedTransactions.map(t => {
        // Si un doublon est détecté (quel que soit le niveau) → DÉSÉLECTIONNER
        if (t.isDuplicate) {
          console.log(`❌ Deselecting duplicate (level ${t.duplicateLevel}): ${t.description} | ${t.amount}€`);
          return { ...t, selected: false };
        }
        
        // Si aucun doublon détecté → SÉLECTIONNER (c'est une nouvelle transaction)
        console.log(`✅ Keeping selected (new transaction): ${t.description} | ${t.amount}€`);
        return { ...t, selected: true };
      });
      
      const selectedCount = withSelection.filter(t => t.selected).length;
      const deselectedCount = withSelection.length - selectedCount;
      console.log(`✅ ${selectedCount} nouvelles transactions sélectionnées pour import`);
      console.log(`❌ ${deselectedCount} doublons désélectionnés`);
      
      setTransactions(withSelection);
      setStep("review");
      
    } catch (err: any) {
      console.error("❌ Erreur mapping:", err);
      setError(err.message || "Erreur lors du mapping");
    } finally {
      setLoading(false);
    }
  };

  // NOUVELLE FONCTION : Appliquer le mapping inversé (Google Sheets → Source)
  const applyNewMapping = async (mappings: ColumnMapping[]) => {
    setLoading(true);
    
    try {
      console.log("🔄 Application du nouveau mapping inversé...", mappings);
      
      // Transformer les données brutes selon le nouveau mapping
      const mappedTransactions = rawData.map(row => {
        const transaction: any = {};
        
        // Appliquer chaque mapping
        mappings.forEach(mapping => {
          const googleColumn = mapping.googleSheetColumn;
          const option = mapping.option;
          
          if (option.type === "column") {
            // Prendre la valeur de la colonne du fichier
            transaction[googleColumn] = row[option.value!];
          } else if (option.type === "fixed") {
            // Utiliser la valeur fixe
            transaction[googleColumn] = option.value;
          }
          // Si type === "empty", ne rien faire
        });
        
        console.log("📊 Transaction mappée:", transaction);
        
        // Devise : dépenses = colonne Devise (ex. PDF Currency), revenus = Valeur (normaliser en majuscules pour l'API)
        const rawCurrency = transactionType === "spending"
          ? (transaction.Devise || "EUR")
          : (transaction.Valeur || "EUR");
        const currencyFromFile = (rawCurrency && String(rawCurrency).trim().toUpperCase()) || "EUR";

        // Adapter au format Transaction complet
        const finalTransaction: Transaction = {
          date: transaction.Date || "",
          description: String(transaction.Description ?? transaction.Source ?? defaultAccount ?? "Transaction"),
          amount: parseFloat(transaction.Montant || "0"),
          
          // Pour spending
          suggestedAccount: transactionType === "spending" 
            ? (transaction.Compte || defaultAccount || "") 
            : "",
          suggestedJar: transactionType === "spending"
            ? (transaction.Jar as JarKey) || "NEC"
            : "NEC",
          
          // Pour revenue
          suggestedSource: transactionType === "revenue" 
            ? (transaction.Source || defaultAccount)
            : undefined,
          
          // Champs communs (devise détectée pour conversion en EUR selon la date)
          currency: currencyFromFile,
          originalCurrency: currencyFromFile,
          originalAmount: parseFloat(transaction.Montant || "0"),
          selected: true,
          tags: transaction.Tags || undefined,
          
          // Champs crypto pour revenus
          valeur: transaction.Valeur || undefined, // ✅ Garder comme string (USD, EUR, etc.)
          quantiteCrypto: transaction["Quantité Crypto"] 
            ? parseFloat(transaction["Quantité Crypto"]) 
            : undefined,
          methodeCrypto: transaction.Méthode || undefined,
          usdEurRate: transaction["Taux USD/EUR"] 
            ? parseFloat(transaction["Taux USD/EUR"]) 
            : undefined,
          adresseCrypto: transaction["Adresse crypto"] || undefined,
          compteDestination: transaction["Compte de destination"] || undefined,
          type: transaction.Type || undefined,
        };
        
        return finalTransaction;
      });
      
      console.log(`✅ ${mappedTransactions.length} transactions créées avec le nouveau mapping`);
      
      // Conversion des devises
      console.log("💱 Conversion des devises en EUR...");
      const convertedTransactions = await convertCurrenciesToEUR(mappedTransactions);
      
      // Vérification des doublons
      console.log("🔍 Vérification des doublons...");
      const checkedTransactions = await checkDuplicates(convertedTransactions);
      
      const duplicateCount = checkedTransactions.filter(t => t.isDuplicate).length;
      console.log(`⚠️ ${duplicateCount} doublon(s) détecté(s)`);
      
      // Désélectionner les doublons
      const withSelection = checkedTransactions.map(t => {
        if (t.isDuplicate) {
          console.log(`❌ Deselecting duplicate: ${t.description} | ${t.amount}€`);
          return { ...t, selected: false };
        }
        return { ...t, selected: true };
      });
      
      const selectedCount = withSelection.filter(t => t.selected).length;
      console.log(`✅ ${selectedCount} nouvelles transactions sélectionnées`);
      
      setTransactions(withSelection);
      setStep("review");
      
    } catch (err: any) {
      console.error("❌ Erreur mapping:", err);
      setError(err.message || "Erreur lors du mapping");
    } finally {
      setLoading(false);
    }
  };

  // Convertir les devises en EUR
  const convertCurrenciesToEUR = async (txns: Transaction[]): Promise<Transaction[]> => {
    rateCacheRef.current.clear(); // un cache par session de conversion
    const converted: Transaction[] = [];

    for (const txn of txns) {
      // Pour les REVENUS : ne pas convertir le montant, juste récupérer le taux
      if (transactionType === "revenue") {
        if (!txn.valeur || txn.valeur === "EUR") {
          // Pas de taux nécessaire pour EUR
          converted.push({
            ...txn,
            usdEurRate: undefined,
          });
        } else {
          // Récupérer le taux Devise/EUR sans convertir le montant
          try {
            const rate = await getHistoricalRate(txn.valeur, "EUR", txn.date);
            console.log(`💱 Taux ${txn.valeur}/EUR pour ${txn.date}: ${rate}`);
            
            converted.push({
              ...txn,
              usdEurRate: rate, // Stocker le taux pour l'export Google Sheets
            });
          } catch (error) {
            console.error(`❌ Échec récupération taux ${txn.valeur} pour ${txn.date}:`, error);
            converted.push({
              ...txn,
              usdEurRate: undefined,
            });
          }
        }
      } 
      // Pour les DÉPENSES : convertir comme avant
      else {
        if (txn.currency === "EUR") {
          // Déjà en EUR
          converted.push({
            ...txn,
            conversionRate: 1,
            conversionNote: null,
          });
        } else {
          // Conversion nécessaire
          try {
            const rate = await getHistoricalRate(txn.currency ?? "USD", "EUR", txn.date);
            const convertedAmount = txn.amount * rate;
            
            console.log(`💱 ${txn.amount} ${txn.currency} → ${convertedAmount.toFixed(2)} EUR (rate: ${rate})`);
            
            converted.push({
              ...txn,
              amount: parseFloat(convertedAmount.toFixed(2)),
              currency: "EUR",
              conversionRate: rate,
              conversionNote: `Converti de ${txn.originalAmount} ${txn.originalCurrency} au taux de ${rate.toFixed(4)}`,
            });
          } catch (error) {
            console.error(`❌ Échec conversion ${txn.currency} pour ${txn.date}:`, error);
            
            // En cas d'erreur, garder le montant original avec warning
            converted.push({
              ...txn,
              conversionRate: null,
              conversionNote: `⚠️ Conversion échouée - Montant en ${txn.currency}`,
            });
          }
        }
      }
    }
    
    return converted;
  };

  // Récupérer le taux de change historique via notre proxy (cache par devise+date pour limiter les appels)
  const getHistoricalRate = async (fromCurrency: string, toCurrency: string, date: string): Promise<number> => {
    const isoDate = convertToISODate(date);
    const cacheKey = `${fromCurrency}-${toCurrency}-${isoDate}`;
    const cached = rateCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const url = `/.netlify/functions/getExchangeRate?from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(toCurrency)}&date=${encodeURIComponent(isoDate)}`;
    console.log(`🔄 Fetching rate ${fromCurrency}→${toCurrency} for ${date} via proxy`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 s max

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.message || `Taux indisponible (${response.status})`);
      }
      const data = await response.json();
      if (typeof data.rate !== "number") {
        throw new Error("No rate in response");
      }
      rateCacheRef.current.set(cacheKey, data.rate);
      return data.rate;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error("Délai dépassé pour récupérer le taux");
      }
      throw err;
    }
  };

  // ✅ Fonction pour convertir différents formats de date en ISO (YYYY-MM-DD)
  const convertToISODate = (dateStr: string): string => {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    
    // Déjà au format ISO (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    // Format DD/MM/YYYY
    const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (ddmmyyyyMatch) {
      const [, day, month, year] = ddmmyyyyMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Format "26 May 2025, 11:40am" ou "26 May 2025"
    const longMatch = dateStr.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (longMatch) {
      const [, day, monthName, year] = longMatch;
      const months: { [key: string]: string } = {
        'January': '01', 'February': '02', 'March': '03', 'April': '04',
        'May': '05', 'June': '06', 'July': '07', 'August': '08',
        'September': '09', 'October': '10', 'November': '11', 'December': '12'
      };
      const month = months[monthName];
      if (month) {
        return `${year}-${month}-${day.padStart(2, '0')}`;
      }
    }
    
    // Fallback : essayer de parser avec Date
    try {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    } catch {}
    
    // Si tout échoue, retourner la date actuelle
    console.warn(`⚠️ Unable to parse date: ${dateStr}, using today`);
    return new Date().toISOString().split('T')[0];
  };


  // Vérifier les doublons via l'API
  const checkDuplicates = async (txns: Transaction[]): Promise<Transaction[]> => {
    try {
      const response = await fetch("/.netlify/functions/checkDuplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: txns }),
      });

      if (!response.ok) {
        console.warn("⚠️ Échec de la vérification des doublons");
        return txns;
      }

      const data = await response.json();
      return data.transactions || txns;
    } catch (error) {
      console.error("❌ Erreur vérification doublons:", error);
      return txns;
    }
  };

  // Importer les transactions sélectionnées
  const handleImport = async () => {
    const selectedTransactions = transactions.filter(t => t.selected);
    
    if (selectedTransactions.length === 0) {
      setError("Aucune transaction sélectionnée");
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: selectedTransactions.length });

    for (let i = 0; i < selectedTransactions.length; i++) {
      setImportProgress({ current: i + 1, total: selectedTransactions.length });
      await new Promise(resolve => setTimeout(resolve, 50)); // Petit délai pour l'affichage
    }

    // ✅ Passer le type de transaction à onImport
    onImport(selectedTransactions, transactionType || "spending");
    
    // Reset
    setImporting(false);
    setFile(null);
    setFileFormat(null);
    setTransactions([]);
    setRawData([]);
    setHeaders([]);
    setColumnMappings([]);
    setStep("selectType");
    setTransactionType(null);
    setDefaultAccount("");
  };

  const updateTransaction = (index: number, field: keyof Transaction, value: any) => {
    setTransactions(prev =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const toggleTransaction = (index: number) => {
    setTransactions(prev =>
      prev.map((t, i) => (i === index ? { ...t, selected: !t.selected } : t))
    );
  };

  // Sauvegarder une transaction éditée
  const handleSaveEditedTransaction = (updatedTransaction: Transaction) => {
    if (editingIndex !== null) {
      const updatedTransactions = [...transactions];
      updatedTransactions[editingIndex] = updatedTransaction;
      setTransactions(updatedTransactions);
    }
    setEditingTransaction(null);
    setEditingIndex(null);
  };

  // Sauvegarder une transaction de revenu éditée
  const handleSaveEditedRevenueTransaction = (updatedTransaction: Transaction) => {
    if (editingRevenueIndex !== null) {
      const updatedTransactions = [...transactions];
      updatedTransactions[editingRevenueIndex] = updatedTransaction;
      setTransactions(updatedTransactions);
    }
    setEditingRevenueTransaction(null);
    setEditingRevenueIndex(null);
  };

  const toggleAll = () => {
    const allSelected = transactions.every(t => t.selected);
    setTransactions(prev => prev.map(t => ({ ...t, selected: !allSelected })));
  };

  const filteredTransactions = transactions.filter(t => {
    const desc = t.description != null ? String(t.description) : "";
    const date = t.date != null ? String(t.date) : "";
    return desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      date.includes(searchQuery) ||
      String(t.amount ?? "").includes(searchQuery);
  });

  // ÉTAPE 1 : Sélection du type
  if (step === "selectType") {
    return (
      <div style={{
        backgroundColor: "var(--bg-card)",
        borderRadius: "20px",
        padding: "32px 24px",
        boxShadow: "var(--shadow-md)",
        maxWidth: "600px",
        margin: "0 auto",
      }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h2 style={{
            fontSize: "28px",
            fontWeight: "700",
            color: "var(--text-main)",
            margin: "0 0 12px 0",
          }}>
            📂 Importer des transactions
          </h2>
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "15px" }}>
            Sélectionnez le type de transactions à importer
          </p>
        </div>

        <div style={{ display: "grid", gap: "16px" }}>
          <button
            onClick={() => {
              setTransactionType("spending");
              setStep("upload");
            }}
            style={{
              padding: "24px",
              borderRadius: "16px",
              border: "2px solid var(--border-color)",
              background: "var(--bg-body)",
              cursor: "pointer",
              transition: "all 0.2s",
              textAlign: "left",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "#FF3B30";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(255, 59, 48, 0.15)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "var(--border-color)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>💸</div>
            <div style={{
              fontSize: "20px",
              fontWeight: "700",
              color: "var(--text-main)",
              marginBottom: "8px",
            }}>
              Dépenses
            </div>
            <p style={{
              fontSize: "14px",
              color: "var(--text-muted)",
              margin: 0,
              lineHeight: 1.5,
            }}>
              Importer des transactions de dépenses (achats, factures, etc.)
            </p>
          </button>

          <button
            onClick={() => {
              setTransactionType("revenue");
              setStep("upload");
            }}
            style={{
              padding: "24px",
              borderRadius: "16px",
              border: "2px solid var(--border-color)",
              background: "var(--bg-body)",
              cursor: "pointer",
              transition: "all 0.2s",
              textAlign: "left",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "#34C759";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(52, 199, 89, 0.15)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "var(--border-color)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>💰</div>
            <div style={{
              fontSize: "20px",
              fontWeight: "700",
              color: "var(--text-main)",
              marginBottom: "8px",
            }}>
              Revenus
            </div>
            <p style={{
              fontSize: "14px",
              color: "var(--text-muted)",
              margin: 0,
              lineHeight: 1.5,
            }}>
              Importer des revenus (salaires, ventes crypto, etc.)
            </p>
          </button>
        </div>
      </div>
    );
  }

  // ÉTAPE 2 : Sélection du fichier
  if (step === "upload") {
    return renderUploadStep();
  }

  // ÉTAPE 3 : Mapping des colonnes
  if (step === "mapping") {
    return (
      <div style={{
        backgroundColor: "var(--bg-card)",
        borderRadius: "20px",
        padding: 0,
        boxShadow: "var(--shadow-md)",
        height: "80vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}>
        {loading && (
          <div className="import-mapping-loading-overlay">
            <div className="import-mapping-spinner" />
            <p style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "var(--text-main)" }}>
              Chargement des données…
            </p>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
              Application du mapping, conversion des devises et vérification des doublons
            </p>
          </div>
        )}
        <NewColumnMappingStep
          key={`mapping-${transactionType}-${defaultAccount}`}
          detectedColumns={headers}
          transactionType={transactionType || "spending"}
          defaultSource={defaultAccount}
          onBack={() => setStep("upload")}
          onContinue={applyNewMapping}
        />
      </div>
    );
  }

  // ÉTAPE 4 : Révision des transactions
  if (step === "review") {
    return (
      <>
        {renderReviewStep()}
        
        {/* Modal d'édition de transaction de dépense */}
        {editingTransaction && transactionType === "spending" && (
          <TransactionEditor
            transaction={editingTransaction}
            onSave={handleSaveEditedTransaction}
            onCancel={() => {
              setEditingTransaction(null);
              setEditingIndex(null);
            }}
            accounts={accounts}
          />
        )}
        
        {/* Modal d'édition de transaction de revenu */}
        {editingRevenueTransaction && transactionType === "revenue" && (
          <RevenueTransactionEditor
            transaction={editingRevenueTransaction}
            onSave={handleSaveEditedRevenueTransaction}
            onCancel={() => {
              setEditingRevenueTransaction(null);
              setEditingRevenueIndex(null);
            }}
            accounts={accounts}
          />
        )}
      </>
    );
  }

  return null;

  // Fonction pour rendre l'étape d'upload
  function renderUploadStep() {
    return (
      <div style={{
        backgroundColor: "var(--bg-card)",
        borderRadius: "20px",
        padding: "24px",
        boxShadow: "var(--shadow-md)",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}>
          <div>
            <h3 style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: "700",
              color: "var(--text-main)",
            }}>
              {transactionType === "spending" ? "💸 Dépenses" : "💰 Revenus"}
            </h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "14px" }}>
              Étape 1 : Sélectionnez votre fichier
            </p>
          </div>
          <button
            onClick={() => {
              setStep("selectType");
              setFile(null);
              setFileFormat(null);
              setError(null);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-body)",
              color: "var(--text-main)",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            ← Retour
          </button>
        </div>

        {/* Zone de drag & drop */}
        <div style={{
          border: "2px dashed var(--border-color)",
          borderRadius: "12px",
          padding: "40px 20px",
          textAlign: "center",
          marginBottom: "20px",
          backgroundColor: "var(--bg-body)",
        }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📎</div>
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
              display: "inline-block",
              padding: "12px 24px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, var(--jar-nec) 0%, #0051d5 100%)",
              color: "white",
              fontSize: "16px",
              fontWeight: "600",
              cursor: "pointer",
              marginBottom: "12px",
            }}
          >
            Choisir un fichier
          </label>
          {file && (
            <div style={{ marginTop: "12px" }}>
              <p style={{ color: "var(--text-main)", margin: "0 0 8px" }}>
                ✅ {file.name}
              </p>
              <div style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: "8px",
                backgroundColor: "rgba(0, 122, 255, 0.1)",
                color: "var(--jar-nec)",
                fontSize: "12px",
                fontWeight: "600",
                textTransform: "uppercase",
              }}>
                {fileFormat}
              </div>
            </div>
          )}
        </div>

        {/* Sélection du compte OU de la source selon le type */}
        {file && transactionType === "spending" && accounts.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "600",
              color: "var(--text-main)",
              marginBottom: "12px",
            }}>
              💳 Sélectionnez le compte
            </label>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "12px",
            }}>
              {accounts.map((account) => (
                <button
                  key={account.name}
                  onClick={() => setDefaultAccount(account.name)}
                  style={{
                    padding: "16px 12px",
                    borderRadius: "12px",
                    border: defaultAccount === account.name
                      ? "2px solid var(--jar-nec)"
                      : "1px solid var(--border-color)",
                    background: defaultAccount === account.name
                      ? "rgba(0, 122, 255, 0.1)"
                      : "var(--bg-body)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "36px", marginBottom: "8px" }}>
                    {account.emoji}
                  </div>
                  <div style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "var(--text-main)",
                  }}>
                    {account.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sélection de la source de revenu pour les revenus */}
        {file && transactionType === "revenue" && revenueSources.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "16px",
              fontWeight: "700",
              color: "var(--text-main)",
              marginBottom: "16px",
            }}>
              💰 Sélectionnez la source de revenu
            </label>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "12px",
            }}>
              {revenueSources.map((source: any) => (
                <button
                  key={source.id}
                  onClick={() => setDefaultAccount(source.name)}
                  style={{
                    padding: "16px 12px",
                    borderRadius: "12px",
                    border: defaultAccount === source.name
                      ? "2px solid #34C759"
                      : "1px solid var(--border-color)",
                    background: defaultAccount === source.name
                      ? "rgba(52, 199, 89, 0.1)"
                      : "var(--bg-body)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "36px", marginBottom: "8px" }}>
                    {source.icon}
                  </div>
                  <div style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "var(--text-main)",
                  }}>
                    {source.name}
                  </div>
                  {source.category && (
                    <div style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      marginTop: "4px",
                    }}>
                      {source.category}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            padding: "12px 16px",
            borderRadius: "12px",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "#ef4444",
            marginBottom: "20px",
            fontSize: "14px",
          }}>
            {error}
          </div>
        )}

        <button
          onClick={extractTransactions}
          disabled={!file || loading}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "12px",
            border: "none",
            background: !file || loading
              ? "var(--border-color)"
              : "linear-gradient(135deg, #34C759 0%, #28a745 100%)",
            color: "white",
            fontSize: "16px",
            fontWeight: "700",
            cursor: !file || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Analyse en cours..." : "Analyser le fichier"}
        </button>

        <div style={{
          marginTop: "20px",
          padding: "16px",
          borderRadius: "12px",
          backgroundColor: "rgba(0, 122, 255, 0.1)",
          border: "1px solid rgba(0, 122, 255, 0.2)",
        }}>
          <p style={{
            margin: 0,
            fontSize: "13px",
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}>
            <strong>📌 Formats acceptés :</strong> PDF, CSV, XLSX. Le fichier sera analysé automatiquement et vous pourrez mapper les colonnes avant l'import.
          </p>
        </div>
      </div>
    );
  }

  // Fonction pour rendre l'étape de révision
  function renderReviewStep() {
    const selectedCount = transactions.filter(t => t.selected).length;
    const duplicateCount = transactions.filter(t => t.isDuplicate).length;

    return (
      <div style={{
        backgroundColor: "var(--bg-card)",
        borderRadius: "20px",
        padding: "24px",
        boxShadow: "var(--shadow-md)",
        height: "85vh",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}>
          <div>
            <h3 style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: "700",
              color: "var(--text-main)",
            }}>
              📋 Révision des transactions
            </h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "14px" }}>
              {selectedCount} sélectionnée(s) • {duplicateCount} doublon(s) potentiel(s)
            </p>
          </div>
          <button
            onClick={() => setStep("mapping")}
            style={{
              padding: "8px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-body)",
              color: "var(--text-main)",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            ← Retour au mapping
          </button>
        </div>

        {/* Recherche et actions */}
        <div style={{
          display: "flex",
          gap: "12px",
          marginBottom: "16px",
        }}>
          <input
            type="text"
            placeholder="🔍 Rechercher..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--bg-body)",
              color: "var(--text-main)",
              fontSize: "14px",
            }}
          />
          <button
            onClick={toggleAll}
            style={{
              padding: "10px 16px",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-body)",
              color: "var(--text-main)",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {transactions.every(t => t.selected) ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
        </div>

        {/* Liste des transactions */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          marginBottom: "16px",
          minHeight: 0,
        }}>
          {filteredTransactions.map((transaction, index) => (
            <div
              key={index}
              style={{
                padding: "16px",
                marginBottom: "12px",
                borderRadius: "12px",
                border: transaction.isDuplicate
                  ? `2px solid ${transaction.duplicateLevel === 1 ? "#FF3B30" : transaction.duplicateLevel === 2 ? "#FF9500" : "#FFCC00"}`
                  : "1px solid var(--border-color)",
                backgroundColor: transaction.selected ? "var(--bg-body)" : "rgba(0,0,0,0.02)",
                opacity: transaction.selected ? 1 : 0.6,
              }}
            >
              <div style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                gap: "16px",
                alignItems: "start",
              }}>
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={transaction.selected}
                  onChange={() => toggleTransaction(index)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "20px",
                    height: "20px",
                    cursor: "pointer",
                    marginTop: "2px",
                  }}
                />

                {/* Infos */}
                <div>
                  <div style={{
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "var(--text-main)",
                    marginBottom: "4px",
                  }}>
                    {transaction.description}
                  </div>
                  <div style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                  }}>
                    {transaction.date} • {transaction.suggestedAccount || "Compte non défini"}
                  </div>
                  {transaction.isDuplicate && (
                    <div style={{
                      fontSize: "12px",
                      color: transaction.duplicateLevel === 1 ? "#FF3B30" : transaction.duplicateLevel === 2 ? "#FF9500" : "#FFCC00",
                      marginTop: "6px",
                      fontWeight: "600",
                    }}>
                      {transaction.duplicateNote}
                    </div>
                  )}
                </div>

                {/* Montant (toujours en EUR après conversion) */}
                <div style={{
                  textAlign: "right",
                }}>
                  <div style={{
                    fontSize: "18px",
                    fontWeight: "700",
                    color: "var(--text-main)",
                  }}>
                    {transactionType === "revenue" 
                      ? `${transaction.amount.toFixed(2)} ${transaction.valeur || transaction.currency || "EUR"}`
                      : `${transaction.amount.toFixed(2)} €`
                    }
                  </div>
                  {transactionType === "spending" && transaction.conversionNote && (
                    <div style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      marginTop: "2px",
                    }}>
                      {transaction.conversionNote}
                    </div>
                  )}
                </div>

                {/* Jar badge (uniquement pour spending) */}
                {transactionType === "spending" && (
                  <div style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    backgroundColor: `var(--jar-${transaction.suggestedJar?.toLowerCase() || 'nec'})`,
                    color: "white",
                    fontSize: "12px",
                    fontWeight: "700",
                    whiteSpace: "nowrap",
                  }}>
                    {transaction.suggestedJar || "NEC"}
                  </div>
                )}
              </div>
              
              {/* Bouton "Éditer" pour dépenses */}
              {transactionType === "spending" && (
                <button
                  onClick={() => {
                    setEditingTransaction(transaction);
                    setEditingIndex(index);
                  }}
                  style={{
                    marginTop: "8px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-body)",
                    fontSize: "12px",
                    color: "var(--text-main)",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(0, 122, 255, 0.1)";
                    e.currentTarget.style.borderColor = "var(--jar-nec)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-body)";
                    e.currentTarget.style.borderColor = "var(--border-color)";
                  }}
                >
                  <span>✏️</span>
                  <span>Éditer</span>
                </button>
              )}
              
              {/* Bouton "Éditer" pour revenus */}
              {transactionType === "revenue" && (
                <button
                  onClick={() => {
                    setEditingRevenueTransaction(transaction);
                    setEditingRevenueIndex(index);
                  }}
                  style={{
                    marginTop: "8px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-body)",
                    fontSize: "12px",
                    color: "var(--text-main)",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(0, 122, 255, 0.1)";
                    e.currentTarget.style.borderColor = "var(--jar-nec)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-body)";
                    e.currentTarget.style.borderColor = "var(--border-color)";
                  }}
                >
                  <span>✏️</span>
                  <span>Éditer</span>
                </button>
              )}
            </div>
          ))}

          {filteredTransactions.length === 0 && (
            <div style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-muted)",
            }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔍</div>
              <p>Aucune transaction trouvée</p>
            </div>
          )}
        </div>

        {/* Actions finales */}
        <div style={{
          display: "flex",
          gap: "12px",
          paddingTop: "16px",
          borderTop: "1px solid var(--border-color)",
        }}>
          <button
            onClick={() => setStep("mapping")}
            disabled={importing}
            style={{
              flex: 1,
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-main)",
              fontSize: "16px",
              fontWeight: "600",
              cursor: importing ? "not-allowed" : "pointer",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleImport}
            disabled={selectedCount === 0 || importing}
            style={{
              flex: 2,
              padding: "16px",
              borderRadius: "12px",
              border: "none",
              background: selectedCount === 0 || importing
                ? "var(--border-color)"
                : "linear-gradient(135deg, #34C759 0%, #28a745 100%)",
              color: "white",
              fontSize: "16px",
              fontWeight: "700",
              cursor: selectedCount === 0 || importing ? "not-allowed" : "pointer",
            }}
          >
            {importing
              ? `Import... (${importProgress.current}/${importProgress.total})`
              : `Importer ${selectedCount} transaction(s)`
            }
          </button>
        </div>
      </div>
    );
  }
};

export default UniversalImporter;
