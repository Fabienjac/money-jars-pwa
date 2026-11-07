// src/components/UniversalImporter.tsx - VERSION AVEC NOUVEAU MAPPING INVERSÉ
import React, { useState, useEffect, useRef } from "react";
import { JarKey } from "../types";
import { NewColumnMappingStep } from "./NewColumnMappingStep";
import { TransactionEditor } from "./TransactionEditor";
import { RevenueTransactionEditor } from "./RevenueTransactionEditor";
import { loadRevenueSources } from "../revenueSourcesUtils";
import { getRevenueAccounts } from "../api";
import { getHistoricalExchangeRate } from "../exchangeRate";
import { supabase } from "../lib/supabase";
import { loadTags } from "../tagsUtils";
import { AutoTagRule, findRule, upsertRule, loadCachedRules } from "../autoTagRules";
import { fetchAutoTagRules, saveAutoTagRulesToSheet } from "../api";

import { getBaseCurrency, currencySymbol as curSym } from "../baseCurrency";
import { t as tr, useLang } from "../i18n";
import { ImportReadSettings } from "./ImportReadSettings";
import {
  addNetAmountColumn, suggestColumns, resolveReading, parseAmount, parseDate,
  DEFAULT_READ_OPTIONS,
  type ReadOptions, type SuggestedColumns, type DateOrder,
} from "../importNormalize";

function relTime(diffMin: number, diffH: number, diffD: number): string {
  if (diffMin < 2) return tr("imp.justNow");
  if (diffMin < 60) return tr("imp.minAgo", { n: diffMin });
  if (diffH < 24) return tr("imp.hAgo", { n: diffH });
  if (diffD === 1) return tr("imp.yesterday");
  if (diffD < 7) return tr("imp.daysAgo", { n: diffD });
  return tr("imp.weeksAgo", { n: Math.floor(diffD / 7) });
}
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
  needsConversion?: boolean;
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
  // Champs internes (non envoyés à l'API)
  _origDescription?: string;   // libellé original avant édition / auto-tag
  _autoTagged?: boolean;       // true si une règle a été appliquée automatiquement
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

type FileFormat = "pdf" | "csv" | "xlsx" | "ofx" | "qif";
type TransactionType = "spending" | "revenue";

export const UniversalImporter: React.FC<UniversalImporterProps> = ({
  onImport,
  accounts = [],
}) => {
  useLang();
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
  // Lecture tolérante des CSV/XLSX/OFX/QIF : suggestions de colonnes, formats de dates/nombres, lignes ignorées
  const [suggestedColumns, setSuggestedColumns] = useState<SuggestedColumns>({});
  const [readOptions, setReadOptions] = useState<ReadOptions>(DEFAULT_READ_OPTIONS);
  const [fileDateHint, setFileDateHint] = useState<DateOrder | undefined>(undefined);
  const [importNotices, setImportNotices] = useState<string[]>([]);
  // On garde l'ancien state pour compatibilité mais on n'utilisera que le nouveau
  const [columnMappings, setColumnMappings] = useState<Array<{sourceColumn: string, targetColumn: string, confidence: number}>>([]);
  const [newColumnMappings, setNewColumnMappings] = useState<ColumnMapping[]>([]);

  // Lignes à convertir : montant EUR saisi à la main / état du réessai
  const [manualEur, setManualEur] = useState<Record<number, string>>({});
  const [retryingIdx, setRetryingIdx] = useState<number | null>(null);

  // ✨ Règles d'auto-tag chargées depuis Google Sheets (avec fallback localStorage)
  const autoTagRulesRef = useRef<AutoTagRule[]>([]);

  useEffect(() => {
    // Pré-charger les règles depuis le cache local immédiatement, puis depuis l'API
    autoTagRulesRef.current = loadCachedRules();
    fetchAutoTagRules()
      .then(rules => { autoTagRulesRef.current = rules; })
      .catch(() => { /* garder le cache local */ });
  }, []);

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
    else if (extension === "tsv" || extension === "txt") format = "csv";
    else if (extension === "ofx" || extension === "qfx") format = "ofx";
    else if (extension === "qif") format = "qif";

    if (format) {
      setFile(selectedFile);
      setFileFormat(format);
      setError(null);
    } else {
      setError(tr("imp.badFormat"));
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

      // Port 5173 = Vite seul → plugin local. Port 8888 = netlify dev → vraie fonction.
      const analyzeUrl =
        import.meta.env.DEV && window.location.port === "5173"
          ? "/__vite-local/analyzeFile"
          : "/.netlify/functions/analyzeFile";

      const response = await fetch(analyzeUrl, {
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
        const hint =
          is404 && typeof window !== "undefined" && window.location.port === "8888"
            ? tr("imp.netlifyHint")
            : "";
        throw new Error(tr("imp.analyzeError") + backendMessage + hint);
      }

      const data = await response.json();
      
      console.log("✅ Structure détectée:", {
        headers: data.structure.headers,
        rows: data.structure.totalRows
      });
      
      // Stocker les données brutes et headers
      // Colonnes débit/crédit séparées → colonne « montant net » ; puis suggestion automatique des colonnes
      const prepared = addNetAmountColumn(data.structure.headers, data.structure.rows);
      setRawData(prepared.rows);
      setHeaders(prepared.headers);
      setSuggestedColumns(suggestColumns(prepared.headers, prepared.rows));
      setFileDateHint(data.structure.hints?.dateOrder as DateOrder | undefined);
      setReadOptions(DEFAULT_READ_OPTIONS);
      setImportNotices([]);
      setColumnMappings(data.structure.suggestedMappings);
      
      // Passer à l'étape de mapping
      setStep("mapping");
      
    } catch (err: any) {
      console.error("❌ Erreur extraction:", err);
      setError(err.message || tr("imp.extractError"));
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
          currency: mapped.Currency || getBaseCurrency(),
          originalCurrency: mapped.Currency || getBaseCurrency(),
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
        return { ...t, selected: !t.needsConversion };
      });
      
      const selectedCount = withSelection.filter(t => t.selected).length;
      const deselectedCount = withSelection.length - selectedCount;
      console.log(`✅ ${selectedCount} nouvelles transactions sélectionnées pour import`);
      console.log(`❌ ${deselectedCount} doublons désélectionnés`);

      // ✨ Appliquer les règles d'auto-tag mémorisées
      const autoTagRules = autoTagRulesRef.current;
      const withAutoTag = withSelection.map(t => {
        const origDesc = t.description;
        const rule = findRule(origDesc, autoTagRules);
        if (!rule) return { ...t, _origDescription: origDesc };
        const changed =
          rule.correctedDescription !== origDesc ||
          rule.tags.length > 0 ||
          (rule.jar != null && rule.jar !== t.suggestedJar);
        return {
          ...t,
          _origDescription: origDesc,
          description: rule.correctedDescription,
          tags: rule.tags.length > 0 ? rule.tags.join(",") : (t.tags ?? ""),
          suggestedJar: (rule.jar as JarKey) ?? t.suggestedJar,
          _autoTagged: changed,
        };
      });

      setTransactions(withAutoTag);
      setStep("review");
      
    } catch (err: any) {
      console.error("❌ Erreur mapping:", err);
      setError(err.message || tr("imp.mappingError"));
    } finally {
      setLoading(false);
    }
  };

  // NOUVELLE FONCTION : Appliquer le mapping inversé (Google Sheets → Source)
  const applyNewMapping = async (mappings: ColumnMapping[]) => {
    setLoading(true);
    
    try {
      console.log("🔄 Application du nouveau mapping inversé...", mappings);
      
      // Lecture tolérante : format des dates, des nombres, sens des montants (détectés sur les colonnes choisies)
      const srcCol = (g: string) => {
        const o = mappings.find(m => m.googleSheetColumn === g)?.option;
        return o?.type === "column" ? o.value : undefined;
      };
      const reading = resolveReading(rawData, srcCol("Date"), srcCol("Montant"), readOptions, fileDateHint);

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
          ? (transaction.Devise || getBaseCurrency())
          : (transaction.Valeur || getBaseCurrency());
        const currencyFromFile = (rawCurrency && String(rawCurrency).trim().toUpperCase()) || getBaseCurrency();

        // Adapter au format Transaction complet
        const finalTransaction: Transaction = {
          date: parseDate(transaction.Date, reading.order) ?? "",
          description: String(transaction.Description ?? transaction.Source ?? defaultAccount ?? "Transaction"),
          amount: parseAmount(transaction.Montant, reading.decimal) ?? NaN,
          
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
          originalAmount: parseAmount(transaction.Montant, reading.decimal) ?? NaN,
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
      
      // Lignes illisibles, puis lignes dans le mauvais sens (rentrées d'argent dans un import de dépenses, et inversement)
      const notices: string[] = [];
      const readable = mappedTransactions.filter(tx => tx.date && Number.isFinite(tx.amount));
      const invalidCount = mappedTransactions.length - readable.length;
      if (invalidCount > 0) notices.push(tr("imp.notice.invalid", { n: invalidCount }));

      const isExpenseRow = (a: number) => (reading.expenseSign === "negative" ? a < 0 : a > 0);
      const keepRow = (a: number) => {
        if (a === 0) return false;
        if (transactionType === "spending") return isExpenseRow(a) || !reading.mixedSigns;
        return reading.mixedSigns ? !isExpenseRow(a) : true;
      };
      const kept = readable.filter(tx => keepRow(tx.amount)).map(tx => {
        const amount = Math.abs(tx.amount);
        return { ...tx, amount, originalAmount: amount };
      });
      const otherCount = readable.length - kept.length;
      if (otherCount > 0) {
        notices.push(tr(transactionType === "revenue" ? "imp.notice.otherRevenue" : "imp.notice.otherSpending", { n: otherCount }));
      }
      setImportNotices(notices);
      if (kept.length === 0) throw new Error(tr("imp.noRows"));

      console.log(`✅ ${kept.length} transactions créées avec le nouveau mapping`);
      
      // Conversion des devises
      console.log("💱 Conversion des devises en EUR...");
      const convertedTransactions = await convertCurrenciesToEUR(kept);
      
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
        return { ...t, selected: !t.needsConversion };
      });
      
      const selectedCount = withSelection.filter(t => t.selected).length;
      console.log(`✅ ${selectedCount} nouvelles transactions sélectionnées`);

      // ✨ Appliquer les règles d'auto-tag mémorisées
      const autoTagRules = autoTagRulesRef.current;
      const withAutoTag = withSelection.map(t => {
        const origDesc = t.description;
        const rule = findRule(origDesc, autoTagRules);
        if (!rule) return { ...t, _origDescription: origDesc };
        // Déterminer si la règle change quelque chose d'visible
        const changed =
          rule.correctedDescription !== origDesc ||
          rule.tags.length > 0 ||
          (rule.jar != null && rule.jar !== t.suggestedJar);
        return {
          ...t,
          _origDescription: origDesc,
          description: rule.correctedDescription,
          tags: rule.tags.length > 0 ? rule.tags.join(",") : (t.tags ?? ""),
          suggestedJar: (rule.jar as JarKey) ?? t.suggestedJar,
          _autoTagged: changed,
        };
      });

      setTransactions(withAutoTag);
      setStep("review");

    } catch (err: any) {
      console.error("❌ Erreur mapping:", err);
      setError(err.message || tr("imp.mappingError"));
    } finally {
      setLoading(false);
    }
  };

  // Convertir les devises en EUR
  const convertCurrenciesToEUR = async (txns: Transaction[]): Promise<Transaction[]> => {
    const converted: Transaction[] = [];

    for (const txn of txns) {
      // Pour les REVENUS : ne pas convertir le montant, juste récupérer le taux
      if (transactionType === "revenue") {
        if (!txn.valeur || txn.valeur === getBaseCurrency()) {
          // Pas de taux nécessaire pour EUR
          converted.push({
            ...txn,
            usdEurRate: undefined,
          });
        } else {
          // Récupérer le taux Devise/EUR sans convertir le montant
          try {
            const rate = await getHistoricalRate(txn.valeur, getBaseCurrency(), txn.date);
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
        if (txn.currency === getBaseCurrency()) {
          // Déjà en EUR
          converted.push({
            ...txn,
            conversionRate: 1,
            needsConversion: false,
            conversionNote: null,
          });
        } else {
          // Conversion nécessaire
          try {
            const rate = await getHistoricalRate(txn.currency ?? "USD", getBaseCurrency(), txn.date);
            const convertedAmount = txn.amount * rate;
            
            console.log(`💱 ${txn.amount} ${txn.currency} → ${convertedAmount.toFixed(2)} ${getBaseCurrency()} (rate: ${rate})`);
            
            const origAmount = txn.originalAmount ?? txn.amount;
            const origCurrency = txn.originalCurrency ?? txn.currency ?? "USD";
            converted.push({
              ...txn,
              amount: parseFloat(convertedAmount.toFixed(2)),
              currency: getBaseCurrency(),
              originalAmount: origAmount,
              originalCurrency: origCurrency,
              conversionRate: rate,
              needsConversion: false,
              conversionNote: tr("imp.noteRate", { amount: origAmount.toFixed(2), cur: origCurrency, rate: rate.toFixed(4) }),
            });
          } catch (error) {
            console.error(`❌ Échec conversion ${txn.currency} pour ${txn.date}:`, error);
            
            // Taux indisponible : la ligne reste dans sa devise d'origine et ne peut pas être importée telle quelle
            converted.push({
              ...txn,
              originalAmount: txn.originalAmount ?? txn.amount,
              originalCurrency: txn.originalCurrency ?? txn.currency,
              conversionRate: null,
              needsConversion: true,
              conversionNote: tr("imp.noteNoRate", { cur: txn.currency ?? "" }),
            });
          }
        }
      }
    }
    
    return converted;
  };

  // Taux de change historique (proxy Netlify, puis Frankfurter en direct, avec cache)
  const getHistoricalRate = (fromCurrency: string, toCurrency: string, date: string): Promise<number> =>
    getHistoricalExchangeRate(fromCurrency, toCurrency, date);

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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch("/.netlify/functions/checkDuplicates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
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
    const selectedTransactions = transactions.filter(t => t.selected && !t.needsConversion);
    
    if (selectedTransactions.length === 0) {
      setError(tr("imp.noneSelected"));
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: selectedTransactions.length });

    for (let i = 0; i < selectedTransactions.length; i++) {
      setImportProgress({ current: i + 1, total: selectedTransactions.length });
      await new Promise(resolve => setTimeout(resolve, 50)); // Petit délai pour l'affichage
    }

    // ✨ Mémoriser les associations libellé → description/tags/jar pour l'auto-tag futur
    let updatedRules = autoTagRulesRef.current;
    for (const t of selectedTransactions) {
      const origDesc = t._origDescription || t.description;
      const tags = t.tags ? t.tags.split(",").map(s => s.trim()).filter(Boolean) : [];
      updatedRules = upsertRule(updatedRules, origDesc, t.description, tags, t.suggestedJar);
    }
    // Sauvegarder dans Google Sheets (+ cache localStorage en fallback)
    // fire-and-forget : on n'attend pas pour ne pas bloquer l'import
    saveAutoTagRulesToSheet(updatedRules)
      .then(() => { autoTagRulesRef.current = updatedRules; })
      .catch(err => {
        console.warn("Sauvegarde auto-tag dans Sheets échouée (cache local mis à jour):", err);
        autoTagRulesRef.current = updatedRules;
      });

    // ✅ Mémoriser la date du dernier import
    try { localStorage.setItem("mjars:lastImport", Date.now().toString()); } catch {}

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

  // Inline editing: update a field on the transaction found by reference in the transactions array
  const updateTransactionField = (transaction: Transaction, field: string, value: any) => {
    const realIndex = transactions.indexOf(transaction);
    if (realIndex === -1) return;
    setTransactions(prev =>
      prev.map((t, i) => (i === realIndex ? { ...t, [field]: value } : t))
    );
  };

  const retryConversion = async (transaction: Transaction) => {
    const idx = transactions.indexOf(transaction);
    if (idx === -1) return;
    const cur = transaction.originalCurrency ?? transaction.currency ?? "USD";
    const orig = transaction.originalAmount ?? transaction.amount;
    setRetryingIdx(idx);
    try {
      const rate = await getHistoricalRate(cur, getBaseCurrency(), transaction.date);
      setTransactions(prev => prev.map((t, i) => i !== idx ? t : {
        ...t,
        amount: parseFloat((orig * rate).toFixed(2)),
        currency: getBaseCurrency(),
        originalAmount: orig,
        originalCurrency: cur,
        conversionRate: rate,
        needsConversion: false,
        selected: !t.isDuplicate,
        conversionNote: tr("imp.noteRate", { amount: orig.toFixed(2), cur, rate: rate.toFixed(4) }),
      }));
    } catch {
      setError(tr("imp.rateUnavailable", { cur, base: getBaseCurrency(), sym: curSym() }));
    } finally {
      setRetryingIdx(null);
    }
  };

  const applyManualEur = (transaction: Transaction) => {
    const idx = transactions.indexOf(transaction);
    if (idx === -1) return;
    const value = parseFloat((manualEur[idx] ?? "").replace(",", "."));
    if (!isFinite(value) || value <= 0) return;
    const cur = transaction.originalCurrency ?? transaction.currency ?? "";
    const orig = transaction.originalAmount ?? transaction.amount;
    setTransactions(prev => prev.map((t, i) => i !== idx ? t : {
      ...t,
      amount: parseFloat(value.toFixed(2)),
      currency: getBaseCurrency(),
      originalAmount: orig,
      originalCurrency: cur,
      conversionRate: null,
      needsConversion: false,
      selected: !t.isDuplicate,
      conversionNote: tr("imp.noteManual", { amount: orig.toFixed(2), cur }),
    }));
  };

  // Available tags loaded once
  const availableTags = loadTags();

  // Track which card's tag-add dropdown is open (by transaction reference)
  const [openTagDropdown, setOpenTagDropdown] = useState<Transaction | null>(null);

  const toggleTransaction = (index: number) => {
    setTransactions(prev =>
      prev.map((t, i) => (i === index && !t.needsConversion ? { ...t, selected: !t.selected } : t))
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

  const filteredTransactions = transactions.filter(t => {
    const desc = t.description != null ? String(t.description) : "";
    const date = t.date != null ? String(t.date) : "";
    return desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      date.includes(searchQuery) ||
      String(t.amount ?? "").includes(searchQuery);
  });

  // N'agit que sur les transactions visibles (filtre de recherche actif)
  const toggleAll = () => {
    const selectable = filteredTransactions.filter(t => !t.needsConversion);
    const allVisibleSelected = selectable.every(t => t.selected);
    const visibleSet = new Set(selectable);
    setTransactions(prev => prev.map(t =>
      visibleSet.has(t) ? { ...t, selected: !allVisibleSelected } : t
    ));
  };

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
            {tr("imp.title")}
          </h2>
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "15px" }}>
            {tr("imp.pickType")}
          </p>
          {(() => {
            try {
              const ts = localStorage.getItem("mjars:lastImport");
              if (!ts) return null;
              const diffMs = Date.now() - parseInt(ts, 10);
              const diffMin = Math.floor(diffMs / 60000);
              const diffH = Math.floor(diffMs / 3600000);
              const diffD = Math.floor(diffMs / 86400000);
              const label = relTime(diffMin, diffH, diffD);
              const color = diffD >= 7 ? "#FF9500" : diffD >= 3 ? "#AEAEB2" : "#34C759";
              return (
                <div style={{ marginTop: "10px", fontSize: "12px", color, fontWeight: "600" }}>
                  {tr("imp.lastImport", { label })}
                </div>
              );
            } catch { return null; }
          })()}
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
              {tr("imp.spending")}
            </div>
            <p style={{
              fontSize: "14px",
              color: "var(--text-muted)",
              margin: 0,
              lineHeight: 1.5,
            }}>
              {tr("imp.spendingDesc")}
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
              {tr("imp.revenue")}
            </div>
            <p style={{
              fontSize: "14px",
              color: "var(--text-muted)",
              margin: 0,
              lineHeight: 1.5,
            }}>
              {tr("imp.revenueDesc")}
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
      <div
        className="import-mapping-step-wrapper"
        style={{
        backgroundColor: "var(--bg-card)",
        borderRadius: "20px",
        padding: 0,
        boxShadow: "var(--shadow-md)",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflowY: "auto",
      }}
      >
        {loading && (
          <div className="import-mapping-loading-overlay">
            <div className="import-mapping-spinner" />
            <p style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "var(--text-main)" }}>
              {tr("imp.loadingData")}
            </p>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
              {tr("imp.loadingHint")}
            </p>
          </div>
        )}
        {!loading && (
          <ImportReadSettings
            reading={resolveReading(rawData, suggestedColumns.Date, suggestedColumns.Montant, readOptions, fileDateHint)}
            options={readOptions}
            onChange={setReadOptions}
          />
        )}
        <NewColumnMappingStep
          key={`mapping-${transactionType}-${defaultAccount}`}
          detectedColumns={headers}
          suggested={suggestedColumns}
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
    return renderReviewStep();
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
              {transactionType === "spending" ? tr("imp.spendingHead") : tr("imp.revenueHead")}
            </h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "14px" }}>
              {tr("imp.step1")}
            </p>
            {(() => {
              try {
                const ts = localStorage.getItem("mjars:lastImport");
                if (!ts) return null;
                const diffMs = Date.now() - parseInt(ts, 10);
                const diffD = Math.floor(diffMs / 86400000);
                const diffH = Math.floor(diffMs / 3600000);
                const diffMin = Math.floor(diffMs / 60000);
                const label = relTime(diffMin, diffH, diffD);
                const color = diffD >= 7 ? "#FF9500" : diffD >= 3 ? "#AEAEB2" : "#34C759";
                return (
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color, fontWeight: "600" }}>
                    {tr("imp.lastImport", { label })}
                  </p>
                );
              } catch { return null; }
            })()}
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
            {tr("imp.back")}
          </button>
        </div>

        {/* Sélection du compte OU de la source selon le type */}
        {transactionType === "spending" && accounts.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "600",
              color: "var(--text-main)",
              marginBottom: "12px",
            }}>
              {tr("imp.pickAccount")}
            </label>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
              gap: "8px",
            }}>
              {accounts.map((account) => (
                <button
                  key={account.name}
                  onClick={() => setDefaultAccount(account.name)}
                  style={{
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    minWidth: 0,
                    borderRadius: "12px",
                    border: defaultAccount === account.name
                      ? "2px solid var(--jar-nec)"
                      : "1px solid var(--border-color)",
                    background: defaultAccount === account.name
                      ? "rgba(0, 122, 255, 0.1)"
                      : "var(--bg-body)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: "22px", lineHeight: 1, flexShrink: 0 }}>
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
        {transactionType === "revenue" && revenueSources.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "16px",
              fontWeight: "700",
              color: "var(--text-main)",
              marginBottom: "16px",
            }}>
              {tr("imp.pickSource")}
            </label>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
              gap: "8px",
            }}>
              {revenueSources.map((source: any) => (
                <button
                  key={source.id}
                  onClick={() => setDefaultAccount(source.name)}
                  style={{
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    minWidth: 0,
                    borderRadius: "12px",
                    border: defaultAccount === source.name
                      ? "2px solid #34C759"
                      : "1px solid var(--border-color)",
                    background: defaultAccount === source.name
                      ? "rgba(52, 199, 89, 0.1)"
                      : "var(--bg-body)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: "22px", lineHeight: 1, flexShrink: 0 }}>
                    {source.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
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
                        marginTop: "2px",
                      }}>
                        {source.category}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {transactionType === "spending" && accounts.length === 0 && (
          <div style={{
            marginBottom: "20px",
            padding: "12px 16px",
            borderRadius: "12px",
            backgroundColor: "rgba(255, 149, 0, 0.1)",
            color: "var(--text-main)",
            fontSize: "14px",
          }}>
            {tr("imp.noAccounts")}
          </div>
        )}

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
            accept=".pdf,.csv,.tsv,.txt,.xlsx,.xls,.ofx,.qfx,.qif"
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
            {tr("imp.chooseFile")}
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
          {loading ? tr("imp.analyzing") : tr("imp.analyze")}
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
            <strong>{tr("imp.formatsLabel")}</strong>{tr("imp.formatsText")}
          </p>
        </div>
      </div>
    );
  }

  // Fonction pour rendre l'étape de révision
  function renderReviewStep() {
    const selectedCount = transactions.filter(t => t.selected).length;
    const duplicateCount = transactions.filter(t => t.isDuplicate).length;
    const unconvertedCount = transactions.filter(t => t.needsConversion).length;

    const jars: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];

    const inputStyle: React.CSSProperties = {
      width: "100%",
      padding: "8px 12px",
      borderRadius: "8px",
      border: "1px solid var(--border-color)",
      backgroundColor: "var(--bg-body)",
      color: "var(--text-main)",
      fontSize: "14px",
      boxSizing: "border-box",
    };

    const chipStyle: React.CSSProperties = {
      padding: "4px 10px",
      borderRadius: "20px",
      backgroundColor: "rgba(0,122,255,0.15)",
      color: "var(--jar-nec)",
      fontSize: "12px",
      fontWeight: "600",
      border: "1px solid rgba(0,122,255,0.3)",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
    };

    const addTagBtnStyle: React.CSSProperties = {
      padding: "4px 10px",
      borderRadius: "20px",
      backgroundColor: "var(--bg-body)",
      border: "1px dashed var(--border-color)",
      fontSize: "12px",
      cursor: "pointer",
      color: "var(--text-muted)",
    };

    return (
      <div style={{
        backgroundColor: "var(--bg-card)",
        borderRadius: "20px",
        padding: "24px",
        boxShadow: "var(--shadow-md)",
        height: "100%",
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
              {tr("imp.review")}
            </h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "14px" }}>
              {tr("imp.reviewCount", { sel: selectedCount, dup: duplicateCount })}
              {unconvertedCount > 0 && (
                <span style={{ color: "#FF3B30", fontWeight: 600 }}>{tr("imp.toConvert", { n: unconvertedCount })}</span>
              )}
            </p>
            {importNotices.map((n, i) => (
              <p key={i} style={{ margin: "4px 0 0", color: "#FF9500", fontSize: "13px", fontWeight: 600 }}>{n}</p>
            ))}
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
            {tr("imp.backToMapping")}
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
            placeholder={tr("imp.search")}
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
            {transactions.filter(t => !t.needsConversion).every(t => t.selected) ? tr("imp.unselectAll") : tr("imp.selectAll")}
          </button>
        </div>

        {/* Liste des transactions */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          marginBottom: "16px",
          minHeight: 0,
        }}
          onClick={() => setOpenTagDropdown(null)}
        >
          {filteredTransactions.map((transaction, index) => {
            const currentTagIds = transaction.tags
              ? transaction.tags.split(",").map(s => s.trim()).filter(Boolean)
              : [];
            const unselectedTags = availableTags.filter(t => !currentTagIds.includes(t.id));
            const isTagDropdownOpen = openTagDropdown === transaction;

            return (
              <div
                key={index}
                style={{
                  padding: "14px 16px",
                  marginBottom: "12px",
                  borderRadius: "12px",
                  border: transaction.needsConversion
                    ? "2px solid #FF3B30"
                    : transaction.isDuplicate
                    ? `2px solid ${transaction.duplicateLevel === 1 ? "#FF3B30" : transaction.duplicateLevel === 2 ? "#FF9500" : "#FFCC00"}`
                    : "1px solid var(--border-color)",
                  backgroundColor: transaction.selected ? "var(--bg-body)" : "rgba(0,0,0,0.02)",
                  opacity: transaction.selected ? 1 : 0.6,
                }}
              >
                {/* Row 1: checkbox + date + amount */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "10px",
                }}>
                  <input
                    type="checkbox"
                    checked={!!transaction.selected}
                    disabled={!!transaction.needsConversion}
                    onChange={() => toggleTransaction(index)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: "20px",
                      height: "20px",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    flexShrink: 0,
                  }}>
                    {transaction.date}
                  </span>
                  {transaction._autoTagged && (
                    <span style={{
                      fontSize: "11px",
                      color: "#FF2D78",
                      fontWeight: "700",
                      backgroundColor: "rgba(255,45,120,0.1)",
                      borderRadius: "8px",
                      padding: "2px 7px",
                      flexShrink: 0,
                    }}
                      title={tr("imp.autoFilled")}
                    >
                      ✨ Auto
                    </span>
                  )}
                  {transaction.isDuplicate && (
                    <span style={{
                      fontSize: "11px",
                      color: transaction.duplicateLevel === 1 ? "#FF3B30" : transaction.duplicateLevel === 2 ? "#FF9500" : "#FFCC00",
                      fontWeight: "600",
                      flex: 1,
                    }}>
                      {transaction.duplicateNote}
                    </span>
                  )}
                  <div style={{ marginLeft: "auto", textAlign: "right", flexShrink: 0 }}>
                    <span style={{
                      fontSize: "17px",
                      fontWeight: "700",
                      color: "var(--text-main)",
                    }}>
                      {transactionType === "revenue"
                        ? `${transaction.amount.toFixed(2)} ${transaction.valeur || transaction.currency || getBaseCurrency()}`
                        : transaction.needsConversion
                        ? `${transaction.amount.toFixed(2)} ${transaction.currency || ""}`
                        : `${transaction.amount.toFixed(2)} ${curSym()}`
                      }
                    </span>
                    {transactionType === "spending" && transaction.conversionNote && !transaction.needsConversion && (
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                        {transaction.conversionNote}
                      </div>
                    )}
                  </div>
                </div>

                {transaction.needsConversion && (() => {
                  const realIdx = transactions.indexOf(transaction);
                  const cur = transaction.originalCurrency ?? transaction.currency ?? "";
                  return (
                    <div style={{
                      marginBottom: "10px",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      backgroundColor: "rgba(255,59,48,0.1)",
                      border: "1px solid rgba(255,59,48,0.35)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#FF3B30" }}>
                        {tr("imp.needsConvert", { amount: transaction.originalAmount?.toFixed(2) ?? transaction.amount.toFixed(2), cur })}
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder={tr("imp.amountIn", { cur: curSym() })}
                          value={manualEur[realIdx] ?? ""}
                          onChange={e => setManualEur(prev => ({ ...prev, [realIdx]: e.target.value }))}
                          style={{ ...inputStyle, width: "130px", flex: "0 0 auto" }}
                        />
                        <button
                          type="button"
                          onClick={() => applyManualEur(transaction)}
                          style={{
                            padding: "8px 14px", borderRadius: "8px", border: "none",
                            background: "#34C759", color: "white", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          {tr("imp.validate")}
                        </button>
                        <button
                          type="button"
                          onClick={() => retryConversion(transaction)}
                          disabled={retryingIdx === realIdx}
                          style={{
                            padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--border-color)",
                            background: "var(--bg-card)", color: "var(--text-main)", fontSize: "13px", fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          {retryingIdx === realIdx ? "⏳…" : tr("imp.retry")}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Row 2: description input (full width) */}
                <div style={{ marginBottom: "10px" }}>
                  <input
                    type="text"
                    value={transaction.description}
                    placeholder={tr("imp.descPh")}
                    onChange={e => updateTransactionField(transaction, "description", e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {/* Row 3: jar select (spending only) + tag chips */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "wrap",
                }}>
                  {/* Jar select — spending only */}
                  {transactionType === "spending" && (
                    <select
                      value={transaction.suggestedJar || "NEC"}
                      onChange={e => updateTransactionField(transaction, "suggestedJar", e.target.value as JarKey)}
                      onClick={e => e.stopPropagation()}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        backgroundColor: `var(--jar-${(transaction.suggestedJar || "NEC").toLowerCase()})`,
                        color: "white",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {jars.map(j => (
                        <option key={j} value={j}>{j}</option>
                      ))}
                    </select>
                  )}

                  {/* Current tag chips */}
                  {currentTagIds.map(tagId => {
                    const tagInfo = availableTags.find(t => t.id === tagId);
                    return (
                      <span
                        key={tagId}
                        style={chipStyle}
                        onClick={e => {
                          e.stopPropagation();
                          const newTags = currentTagIds.filter(id => id !== tagId).join(",");
                          updateTransactionField(transaction, "tags", newTags || undefined);
                        }}
                        title={tr("imp.clickRemove")}
                      >
                        {tagInfo ? `${tagInfo.emoji} ${tagInfo.name}` : tagId}
                        <span style={{ fontSize: "14px", lineHeight: 1 }}>×</span>
                      </span>
                    );
                  })}

                  {/* Add tag button + inline dropdown */}
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <button
                      style={addTagBtnStyle}
                      onClick={e => {
                        e.stopPropagation();
                        setOpenTagDropdown(isTagDropdownOpen ? null : transaction);
                      }}
                    >
                      + Tag
                    </button>
                    {isTagDropdownOpen && unselectedTags.length > 0 && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          left: 0,
                          zIndex: 100,
                          backgroundColor: "var(--bg-card)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "10px",
                          padding: "6px",
                          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          minWidth: "160px",
                        }}
                      >
                        {unselectedTags.map(tag => (
                          <button
                            key={tag.id}
                            onClick={e => {
                              e.stopPropagation();
                              const newTags = [...currentTagIds, tag.id].join(",");
                              updateTransactionField(transaction, "tags", newTags);
                              setOpenTagDropdown(null);
                            }}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "8px",
                              border: "none",
                              backgroundColor: "transparent",
                              color: "var(--text-main)",
                              fontSize: "13px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.backgroundColor = "rgba(0,122,255,0.08)";
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            {tag.emoji} {tag.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredTransactions.length === 0 && (
            <div style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-muted)",
            }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔍</div>
              <p>{tr("imp.noneFound")}</p>
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
            {tr("imp.cancel")}
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
              ? tr("imp.importing", { cur: importProgress.current, total: importProgress.total })
              : tr("imp.importN", { n: selectedCount })
            }
          </button>
        </div>
      </div>
    );
  }
};

export default UniversalImporter;
