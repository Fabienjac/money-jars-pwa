// src/App.tsx - VERSION V2 avec JarsViewV2 et QuickSpendingForm
import React, { useState, useEffect } from "react";
import SpendingForm from "./components/SpendingForm";
import RevenueForm from "./components/RevenueForm";
import HistoryView, { HistoryUseEntry } from "./components/HistoryView";
import JarsView from "./components/JarsView";
// ✅ AJOUT : Nouveaux composants V2
import JarsViewV2 from "./components/JarsViewV2";
import QuickSpendingForm from "./components/QuickSpendingForm";
// Fin ajouts V2
import SettingsView from "./components/SettingsView";
import { UniversalImporter } from "./components/UniversalImporter";
import { RecentTransactions } from "./components/RecentTransactions";
import TagStatsView from "./components/TagStatsView";
import { ImportSuccessScreen } from "./components/ImportSuccessScreen";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { useOffline } from "./hooks/useOffline";
import { loadAccounts } from "./accountsUtils";
import "./style.css";

type Section = "home" | "history" | "settings" | "tags";
type EntryMode = "spending" | "revenue";

function App() {
  const [section, setSection] = useState<Section>("home");
  const [darkMode, setDarkMode] = useState(false);

  const [entryOpen, setEntryOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>("spending");

  const [prefillSpending, setPrefillSpending] = useState<any | null>(null);
  const [prefillRevenue, setPrefillRevenue] = useState<any | null>(null);

  // ✅ AJOUT : États pour les nouveaux modals V2
  const [showQuickSpending, setShowQuickSpending] = useState(false);
  const [showQuickRevenue, setShowQuickRevenue] = useState(false);
  
  // ✅ AJOUT : Toggle pour activer/désactiver la V2 (optionnel - pour A/B test)
  const [useV2, setUseV2] = useState(() => {
    try {
      const stored = localStorage.getItem("use_jars_v2");
      return stored === null ? true : stored === "true"; // Par défaut TRUE = V2 activée
    } catch {
      return true; // Par défaut, utiliser V2
    }
  });

  // Importeur universel
  const [importerOpen, setImporterOpen] = useState(false);
  
  // États pour l'écran de succès d'importation
  const [showImportSuccess, setShowImportSuccess] = useState(false);
  const [importStats, setImportStats] = useState({ successCount: 0, errorCount: 0 });
  const [isImporting, setIsImporting] = useState(false);
  
  // Comptes de dépenses
  const [accounts, setAccounts] = useState<Array<{id: string, name: string, icon: string}>>([]);

  // Mode offline
  const offline = useOffline();

  // Thème
  useEffect(() => {
    try {
      const stored = localStorage.getItem("mj-dark-mode");
      if (stored === "1") setDarkMode(true);
    } catch {}
  }, []);

  // Charger les comptes au démarrage
  useEffect(() => {
    const loadedAccounts = loadAccounts();
    setAccounts(loadedAccounts);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("mj-dark-mode", darkMode ? "1" : "0");
    } catch {}
  }, [darkMode]);

  const openEntry = (mode: EntryMode, prefill?: any) => {
    setEntryMode(mode);
    if (mode === "spending") {
      setPrefillSpending(prefill ?? null);
    } else {
      setPrefillRevenue(prefill ?? null);
    }
    setEntryOpen(true);
  };

  const closeEntry = () => {
    setEntryOpen(false);
  };

  // Quand on clique "Utiliser" depuis l'historique
  const handleUseEntry = (entry: HistoryUseEntry) => {
    if (entry.kind === "spending") {
      openEntry("spending", entry.row);
    } else {
      openEntry("revenue", entry.row);
    }
  };

  // Import de transactions depuis fichiers
  const handleImportTransactions = async (transactions: any[], type: "spending" | "revenue" = "spending") => {
    console.log(`📦 Importing ${transactions.length} ${type === "revenue" ? "revenues" : "transactions"}...`);
    
    // Fonction pour convertir la date au format DD/MM/YYYY
    const formatDateForGoogleSheets = (dateStr: string) => {
      if (!dateStr) return "";
      
      // Nettoyer les espaces
      const cleaned = dateStr.replace(/\s*:\s*/g, ':').replace(/\s*,\s*/g, ', ');
      
      // Map des mois
      const months: { [key: string]: string } = {
        'January': '01', 'February': '02', 'March': '03', 'April': '04',
        'May': '05', 'June': '06', 'July': '07', 'August': '08',
        'September': '09', 'October': '10', 'November': '11', 'December': '12'
      };
      
      // Parser "04 September 2025, 12:00pm" → "04/09/2025"
      const match = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      
      if (match) {
        const day = match[1].padStart(2, '0');
        const monthName = match[2];
        const year = match[3];
        const month = months[monthName];
        
        if (month) {
          return `${day}/${month}/${year}`;
        }
      }
      
      // Si le parsing échoue, retourner la date nettoyée
      console.warn(`⚠️ Could not parse date: ${dateStr}, using cleaned version`);
      return cleaned;
    };
    
    // Afficher l'écran "Importation en cours..."
    setIsImporting(true);
    setShowImportSuccess(true);
    setImporterOpen(false); // Fermer l'importeur
    
    try {
      let successCount = 0;
      let errorCount = 0;

      // Fonction pour extraire la devise de la méthode
      const extractCurrencyFromMethod = (method: string): string | null => {
        if (!method) return null;
        
        const currencyPatterns = [
          /BTC/i, /ETH/i, /USDT/i, /USDC/i, /XRP/i,
          /ADA/i, /SOL/i, /DOGE/i, /DOT/i, /MATIC/i,
          /LTC/i, /BCH/i,
        ];
        
        for (const pattern of currencyPatterns) {
          if (pattern.test(method)) {
            return method.match(pattern)![0].toUpperCase();
          }
        }
        
        return null;
      };

      // Fonction pour récupérer le taux de change historique
      const getHistoricalRate = async (fromCurrency: string, dateStr: string): Promise<number | null> => {
        try {
          // Convertir la date au format DD/MM/YYYY d'abord
          const formattedDate = formatDateForGoogleSheets(dateStr);
          
          // Puis convertir DD/MM/YYYY en ISO (YYYY-MM-DD)
          let isoDate: string;
          if (formattedDate.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            const [day, month, year] = formattedDate.split('/');
            isoDate = `${year}-${month}-${day}`;
          } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            isoDate = dateStr;
          } else {
            console.error(`❌ Invalid date format: ${dateStr}`);
            return null;
          }
          
          // Cryptomonnaies : utiliser CoinGecko
          const cryptoIds: { [key: string]: string } = {
            'BTC': 'bitcoin',
            'ETH': 'ethereum',
            'USDT': 'tether',
            'USDC': 'usd-coin',
            'XRP': 'ripple',
            'ADA': 'cardano',
            'SOL': 'solana',
            'DOGE': 'dogecoin',
            'DOT': 'polkadot',
            'MATIC': 'matic-network',
            'LTC': 'litecoin',
            'BCH': 'bitcoin-cash',
          };
          
          if (cryptoIds[fromCurrency]) {
            // Crypto : utiliser CoinGecko
            const coinId = cryptoIds[fromCurrency];
            const [year, month, day] = isoDate.split('-');
            const dateFormatted = `${day}-${month}-${year}`; // DD-MM-YYYY pour CoinGecko
            
            const url = `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${dateFormatted}`;
            console.log(`🔄 Fetching crypto rate ${fromCurrency}→EUR for ${dateFormatted} via CoinGecko`);
            
            const response = await fetch(url);
            
            if (!response.ok) {
              console.error(`❌ CoinGecko API returned ${response.status}`);
              return null;
            }
            
            const data = await response.json();
            
            if (!data.market_data || !data.market_data.current_price || !data.market_data.current_price.eur) {
              console.error(`❌ No rate found for ${fromCurrency}→EUR in CoinGecko response`);
              return null;
            }
            
            const rate = data.market_data.current_price.eur;
            console.log(`✅ Rate ${fromCurrency}→EUR: ${rate}`);
            return rate;
          } else {
            // Devise fiat : utiliser Frankfurter
            const url = `https://api.frankfurter.app/${isoDate}?from=${fromCurrency}&to=EUR`;
            console.log(`🔄 Fetching fiat rate ${fromCurrency}→EUR for ${isoDate} via Frankfurter`);
            
            const response = await fetch(url);
            
            if (!response.ok) {
              console.error(`❌ Frankfurter API returned ${response.status}`);
              return null;
            }
            
            const data = await response.json();
            
            if (!data.rates || !data.rates.EUR) {
              console.error(`❌ No rate found for ${fromCurrency}→EUR`);
              return null;
            }
            
            console.log(`✅ Rate ${fromCurrency}→EUR: ${data.rates.EUR}`);
            return data.rates.EUR;
          }
        } catch (error) {
          console.error(`❌ Error fetching rate:`, error);
          return null;
        }
      };

      // Importer chaque transaction individuellement
      for (const t of transactions) {
        try {
          // Pour les REVENUS : calculer automatiquement le taux si nécessaire
          if (type === "revenue" && (!t.usdEurRate || t.usdEurRate === 0)) {
            const method = t.methodeCrypto || t.suggestedMethod || "";
            const currency = extractCurrencyFromMethod(method);
            
            if (currency && currency !== "EUR") {
              console.log(`💱 Calcul auto du taux ${currency}/EUR pour ${t.date}...`);
              const rate = await getHistoricalRate(currency, t.date);
              
              if (rate) {
                t.usdEurRate = rate;
                console.log(`✅ Taux calculé: ${rate}`);
              }
            }
          }

          // Le Google Apps Script attend les données dans body.row !
          const dataToSend = type === "spending" ? {
            action: "append",
            type: "spending",
            row: {
              date: formatDateForGoogleSheets(t.date),
              jar: t.suggestedJar,
              account: t.suggestedAccount,
              amount: t.amount,
              description: t.description,
              tags: t.tags || "",
            }
          } : {
            action: "append",
            type: "revenue",
            row: {
              date: formatDateForGoogleSheets(t.date),
              source: t.suggestedSource || t.suggestedAccount || t.description,
              amount: t.amount,
              valeur: t.valeur || t.currency || "",
              quantiteCrypto: t.quantiteCrypto || "",
              method: t.methodeCrypto || t.suggestedMethod || "",
              tauxUSDEUR: t.usdEurRate || t.tauxUSDEUR || "",
              adresseCrypto: t.adresseCrypto || "",
              compteDestination: t.compteDestination || t.suggestedMethod || "",
              type: t.type || "",
            }
          };

          console.log(`📤 Envoi: ${JSON.stringify(dataToSend)}`);

          // Vérifier si en ligne
          if (offline.isOnline) {
            // Mode online : envoi direct
            const response = await fetch("/.netlify/functions/gsheetProxy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(dataToSend),
            });

            const responseText = await response.text();
            console.log(`📥 Réponse: ${responseText}`);

            if (!response.ok) {
              console.error(`❌ Failed to import: ${t.description}`, responseText);
              errorCount++;
            } else {
              // Vérifier que la réponse contient un succès
              try {
                const responseData = JSON.parse(responseText);
                if (responseData.ok === false || responseData.error) {
                  console.error(`❌ Server error for: ${t.description}`, responseData);
                  errorCount++;
                } else {
                  console.log(`✅ Imported: ${t.description || t.suggestedSource}`);
                  successCount++;
                }
              } catch (e) {
                // Si pas de JSON, considérer comme succès si status 200
                console.log(`✅ Imported: ${t.description || t.suggestedSource}`);
                successCount++;
              }
            }

            // Petit délai pour ne pas surcharger l'API
            await new Promise(resolve => setTimeout(resolve, 200));
          } else {
            // Mode offline : ajouter à la file d'attente
            offline.addPendingTransaction(type, dataToSend.row);
            successCount++;
            console.log(`📴 Transaction ajoutée à la file (offline): ${t.description || t.suggestedSource}`);
          }

        } catch (error: any) {
          console.error(`❌ Error importing ${t.description || t.suggestedSource}:`, error);
          errorCount++;
        }
      }

      console.log(`✅ Import terminé: ${successCount} réussie(s), ${errorCount} échouée(s)`);
      
      // Message différent selon le mode
      if (!offline.isOnline && successCount > 0) {
        console.log(`📴 ${successCount} transaction(s) seront synchronisées au retour en ligne`);
      }
      
      // Mettre à jour les stats et afficher l'écran de succès
      setImportStats({ successCount, errorCount });
      setIsImporting(false);
      
    } catch (error: any) {
      console.error("❌ Erreur import:", error);
      setImportStats({ successCount: 0, errorCount: transactions.length });
      setIsImporting(false);
    }
  };

  return (
    <div className={`app-shell ${darkMode ? "dark" : ""}`}>
      {/* Indicateur de mode offline */}
      <OfflineIndicator />
      
      <div className="app-main">
        <header className="home-header">
          <div>
            <p className="home-kicker">Système des 6 Jars</p>
            <h1 className="home-title">Mes Finances</h1>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setDarkMode((v) => !v)}
            aria-label={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </header>

        <main className="app-content">
          {/* ✅ MODIFICATION : Utiliser JarsViewV2 à la place de JarsView */}
          {section === "home" && (
            <>
              {useV2 ? (
                <JarsViewV2
                  onOpenSpending={() => setShowQuickSpending(true)}
                  onOpenRevenue={() => setShowQuickRevenue(true)}
                />
              ) : (
                <JarsView />
              )}
            </>
          )}
          
          {section === "history" && <HistoryView onUseEntry={handleUseEntry} />}
          {section === "settings" && <SettingsView />}
          {section === "tags" && <TagStatsView />}
        </main>
      </div>

      {/* Bottom navigation - Icônes modernes */}
      <nav className="bottom-nav">
        <button
          type="button"
          className={`bottom-nav-btn ${section === "home" ? "active" : ""}`}
          onClick={() => setSection("home")}
        >
          <span className="bottom-nav-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M3.5 10.5L14 3.5L24.5 10.5V22.75C24.5 23.3467 24.2629 23.919 23.841 24.341C23.419 24.7629 22.8467 25 22.25 25H5.75C5.15326 25 4.58097 24.7629 4.15901 24.341C3.73705 23.919 3.5 23.3467 3.5 22.75V10.5Z"
                stroke={section === "home" ? "#007AFF" : "#8E8E93"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10.5 25V14H17.5V25"
                stroke={section === "home" ? "#007AFF" : "#8E8E93"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="bottom-nav-label">Accueil</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-btn ${section === "history" ? "active" : ""}`}
          onClick={() => setSection("history")}
        >
          <span className="bottom-nav-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M22.75 24.5H5.25C4.42157 24.5 3.75 23.8284 3.75 23V5.5C3.75 4.67157 4.42157 4 5.25 4H22.75C23.5784 4 24.25 4.67157 24.25 5.5V23C24.25 23.8284 23.5784 24.5 22.75 24.5Z"
                stroke={section === "history" ? "#007AFF" : "#8E8E93"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3.75 10.5H24.25M10.5 4V7M17.5 4V7"
                stroke={section === "history" ? "#007AFF" : "#8E8E93"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect
                x="8"
                y="14"
                width="4"
                height="4"
                rx="1"
                fill={section === "history" ? "#007AFF" : "#8E8E93"}
              />
              <rect
                x="16"
                y="14"
                width="4"
                height="4"
                rx="1"
                fill={section === "history" ? "#007AFF" : "#8E8E93"}
              />
            </svg>
          </span>
          <span className="bottom-nav-label">Rapports</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-btn ${section === "tags" ? "active" : ""}`}
          onClick={() => setSection("tags")}
        >
          <span className="bottom-nav-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M24.5 14L14 24.5L3.5 14V5.25C3.5 4.65326 3.73705 4.08097 4.15901 3.65901C4.58097 3.23705 5.15326 3 5.75 3H14.5L24.5 13V14Z"
                stroke={section === "tags" ? "#007AFF" : "#8E8E93"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="10"
                cy="10"
                r="1.5"
                fill={section === "tags" ? "#007AFF" : "#8E8E93"}
              />
            </svg>
          </span>
          <span className="bottom-nav-label">Tags</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-btn ${section === "settings" ? "active" : ""}`}
          onClick={() => setSection("settings")}
        >
          <span className="bottom-nav-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M14 17.5C15.933 17.5 17.5 15.933 17.5 14C17.5 12.067 15.933 10.5 14 10.5C12.067 10.5 10.5 12.067 10.5 14C10.5 15.933 12.067 17.5 14 17.5Z"
                stroke={section === "settings" ? "#007AFF" : "#8E8E93"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22.75 14C22.75 14.93 22.6 15.82 22.33 16.67L24.5 18.5L22.75 21.5L20 20.5C19.03 21.38 17.85 22 16.5 22.33V25H11.5V22.33C10.15 22 8.97 21.38 8 20.5L5.25 21.5L3.5 18.5L5.67 16.67C5.4 15.82 5.25 14.93 5.25 14C5.25 13.07 5.4 12.18 5.67 11.33L3.5 9.5L5.25 6.5L8 7.5C8.97 6.62 10.15 6 11.5 5.67V3H16.5V5.67C17.85 6 19.03 6.62 20 7.5L22.75 6.5L24.5 9.5L22.33 11.33C22.6 12.18 22.75 13.07 22.75 14Z"
                stroke={section === "settings" ? "#007AFF" : "#8E8E93"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="bottom-nav-label">Réglages</span>
        </button>
      </nav>

      {/* ✅ MODIFICATION : Boutons flottants UNIQUEMENT si V1 activée */}
      {!useV2 && (
        <>
          {/* Floating Action Button - Principal (violet) */}
          <button
            type="button"
            className="fab"
            onClick={() => openEntry("spending")}
            style={{
              position: "fixed",
              bottom: "100px",
              right: "20px",
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              zIndex: 999,
            }}
          >
            +
          </button>

          {/* Bouton Import (vert) - Au-dessus du bouton violet */}
          <button
            type="button"
            onClick={() => setImporterOpen(true)}
            style={{
              position: "fixed",
              bottom: "170px",
              right: "20px",
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              border: "none",
              background: "linear-gradient(135deg, #34C759 0%, #30B350 100%)",
              color: "white",
              fontSize: "24px",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              zIndex: 999,
              transition: "transform 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            📂
          </button>
        </>
      )}

      {/* ✅ AJOUT : Modal QuickSpendingForm (V2) */}
      {showQuickSpending && (
        <QuickSpendingForm
          onClose={() => setShowQuickSpending(false)}
          onSuccess={() => {
            console.log("✅ Dépense enregistrée avec succès");
            // Recharger les données (optionnel)
            // window.location.reload();
          }}
        />
      )}

      {/* ✅ AJOUT : Modal RevenueForm (V2 - réutilise l'existant) */}
      {showQuickRevenue && (
        <div className="entry-sheet-backdrop" onClick={() => setShowQuickRevenue(false)}>
          <div className="entry-sheet" onClick={(e) => e.stopPropagation()}>
            <header className="entry-sheet-header">
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>
                💵 Nouveau revenu
              </h2>
              <button
                type="button"
                className="entry-close-btn"
                onClick={() => setShowQuickRevenue(false)}
              >
                ×
              </button>
            </header>
            <div className="entry-sheet-body">
              <RevenueForm
                prefill={prefillRevenue}
                onClearPrefill={() => setPrefillRevenue(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom sheet "Nouvelle entrée" (V1 uniquement) */}
      {entryOpen && !useV2 && (
        <div className="entry-sheet-backdrop" onClick={closeEntry}>
          <div
            className="entry-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="entry-sheet-header">
              <div className="entry-tabs">
                <button
                  type="button"
                  className={`entry-tab ${
                    entryMode === "spending" ? "active" : ""
                  }`}
                  onClick={() => setEntryMode("spending")}
                >
                  Dépense
                </button>
                <button
                  type="button"
                  className={`entry-tab ${
                    entryMode === "revenue" ? "active" : ""
                  }`}
                  onClick={() => setEntryMode("revenue")}
                >
                  Revenu
                </button>
              </div>
              <button
                type="button"
                className="entry-close-btn"
                onClick={closeEntry}
              >
                ×
              </button>
            </header>

            <RecentTransactions
              mode={entryMode}
              onSelect={(transaction) => {
                if (entryMode === "spending") {
                  setPrefillSpending(transaction);
                } else {
                  setPrefillRevenue(transaction);
                }
              }}
            />

            <div className="entry-sheet-body">
              {entryMode === "spending" ? (
                <SpendingForm
                  prefill={prefillSpending}
                  onClearPrefill={() => setPrefillSpending(null)}
                />
              ) : (
                <RevenueForm
                  prefill={prefillRevenue}
                  onClearPrefill={() => setPrefillRevenue(null)}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Importeur Universel */}
      {importerOpen && (
        <div 
          className="entry-sheet-backdrop" 
          onClick={() => setImporterOpen(false)}
          style={{ zIndex: 1001 }}
        >
          <div
            className="entry-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "900px",
              width: "95%",
              maxHeight: "90vh",
              height: "90vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <header className="entry-sheet-header" style={{ flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>
                📂 Importer des transactions
              </h2>
              <button
                type="button"
                className="entry-close-btn"
                onClick={() => setImporterOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="entry-sheet-body" style={{ 
              padding: 0, 
              flex: 1,
              minHeight: 0,
              overflow: "auto",
            }}>
              <UniversalImporter 
                onImport={handleImportTransactions} 
                onClose={() => setImporterOpen(false)}
                accounts={accounts.map(acc => ({ name: acc.name, emoji: acc.icon }))}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Écran de succès d'importation */}
      {showImportSuccess && (
        <ImportSuccessScreen
          successCount={importStats.successCount}
          errorCount={importStats.errorCount}
          isImporting={isImporting}
          onClose={() => {
            setShowImportSuccess(false);
            // Rafraîchir la page pour voir les nouvelles données
            if (importStats.successCount > 0) {
              setTimeout(() => {
                window.location.reload();
              }, 300);
            }
          }}
        />
      )}
    </div>
  );
}

export default App;
