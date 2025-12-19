// src/App.tsx
import React, { useState, useEffect } from "react";
import SpendingForm from "./components/SpendingForm";
import RevenueForm from "./components/RevenueForm";
import HistoryView, { HistoryUseEntry } from "./components/HistoryView";
import JarsView from "./components/JarsView";
import SettingsView from "./components/SettingsView";
import { UniversalImporterV2 } from "./components/UniversalImporterV2";
import "./style.css";

type Section = "home" | "history" | "settings";
type EntryMode = "spending" | "revenue";

function App() {
  const [section, setSection] = useState<Section>("home");
  const [darkMode, setDarkMode] = useState(false);

  const [entryOpen, setEntryOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>("spending");

  const [prefillSpending, setPrefillSpending] = useState<any | null>(null);
  const [prefillRevenue, setPrefillRevenue] = useState<any | null>(null);

  // Importeur universel
  const [importerOpen, setImporterOpen] = useState(false);

  // Thème
  useEffect(() => {
    try {
      const stored = localStorage.getItem("mj-dark-mode");
      if (stored === "1") setDarkMode(true);
    } catch {}
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
    
    try {
      let successCount = 0;
      let errorCount = 0;

      // Importer chaque transaction individuellement
      for (const t of transactions) {
        try {
          // Le Google Apps Script attend les données dans body.row !
          const dataToSend = type === "spending" ? {
            action: "append",
            type: "spending",
            row: {
              date: t.date,
              jar: t.suggestedJar,
              account: t.suggestedAccount,
              amount: t.amount,
              description: t.description,
            }
          } : {
            action: "append",
            type: "revenue",
            row: {
              date: t.date,
              source: t.suggestedSource || t.suggestedAccount || t.description,
              amount: t.amount,
              valeur: t.valeur || t.currency || "",
              quantiteCrypto: t.quantiteCrypto || "",
              method: t.suggestedMethod || "",
              tauxUSDEUR: t.tauxUSDEUR || "",
              adresseCrypto: t.adresseCrypto || "",
              compteDestination: t.compteDestination || "",
              type: t.type || "",
            }
          };

          console.log(`📤 Envoi: ${JSON.stringify(dataToSend)}`);

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

        } catch (error: any) {
          console.error(`❌ Error importing ${t.description || t.suggestedSource}:`, error);
          errorCount++;
        }
      }

      console.log(`✅ Import terminé: ${successCount} réussie(s), ${errorCount} échouée(s)`);
      
      if (successCount > 0) {
        alert(`✅ ${successCount} ${type === "revenue" ? "revenu(s)" : "transaction(s)"} importée(s) avec succès !${errorCount > 0 ? `\n⚠️ ${errorCount} échouée(s)` : ''}`);
      } else {
        throw new Error(`Aucun${type === "revenue" ? " revenu" : "e transaction"} n'a pu être importé${type === "revenue" ? "" : "e"}`);
      }
      
      // Fermer l'importeur
      setImporterOpen(false);
      
      // Rafraîchir la page pour voir les nouvelles données
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
    } catch (error: any) {
      console.error("❌ Erreur import:", error);
      alert(`❌ Erreur lors de l'import: ${error.message}`);
    }
  };

  return (
    <div className={`app-shell ${darkMode ? "dark" : ""}`}>
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
          {section === "home" && <JarsView />}
          {section === "history" && <HistoryView onUseEntry={handleUseEntry} />}
          {section === "settings" && <SettingsView />}
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
                d="M22.75 17.5C22.6125 17.8083 22.575 18.1542 22.6433 18.4867C22.7117 18.8192 22.8817 19.1217 23.1275 19.355L23.1875 19.415C23.3823 19.6097 23.5367 19.8408 23.642 20.0951C23.7472 20.3494 23.8012 20.6219 23.8012 20.8972C23.8012 21.1725 23.7472 21.445 23.642 21.6993C23.5367 21.9536 23.3823 22.1847 23.1875 22.3795C22.9928 22.5743 22.7617 22.7287 22.5074 22.8339C22.2531 22.9392 21.9806 22.9932 21.7053 22.9932C21.43 22.9932 21.1575 22.9392 20.9032 22.8339C20.6489 22.7287 20.4178 22.5743 20.223 22.3795L20.163 22.3195C19.9297 22.0737 19.6272 21.9037 19.2947 21.8353C18.9622 21.767 18.6163 21.8045 18.308 21.942C18.0049 22.074 17.7506 22.2955 17.5775 22.5773C17.4044 22.859 17.3204 23.1881 17.3365 23.52V23.75C17.3365 24.3025 17.1169 24.8324 16.7262 25.223C16.3356 25.6137 15.8057 25.8333 15.2532 25.8333C14.7007 25.8333 14.1708 25.6137 13.7801 25.223C13.3895 24.8324 13.1698 24.3025 13.1698 23.75V23.66C13.1483 23.3178 13.0542 22.9845 12.8947 22.6845C12.7353 22.3845 12.5149 22.1258 12.2497 21.9273C11.9412 21.685 11.5953 21.5475 11.2628 21.5267C10.9303 21.5058 10.5976 21.6023 10.293 21.8062L10.233 21.8662C10.0382 22.061 9.80711 22.2154 9.55282 22.3207C9.29853 22.4259 9.02606 22.4799 8.75075 22.4799C8.47544 22.4799 8.20297 22.4259 7.94868 22.3207C7.69439 22.2154 7.46331 22.061 7.2685 21.8662C7.07369 21.6714 6.91928 21.4403 6.81405 21.186C6.70881 20.9317 6.65478 20.6592 6.65478 20.3839C6.65478 20.1086 6.70881 19.8361 6.81405 19.5818C6.91928 19.3275 7.07369 19.0964 7.2685 18.9016L7.3285 18.8416C7.53239 18.537 7.62889 18.2043 7.60803 17.8718C7.58718 17.5393 7.44989 17.2167 7.2076 16.9082C7.00911 16.643 6.75042 16.4226 6.45042 16.2632C6.15042 16.1038 5.81714 16.0096 5.475 15.9882H5.25C4.69747 15.9882 4.16756 15.7686 3.77691 15.3779C3.38627 14.9873 3.16667 14.4574 3.16667 13.9048C3.16667 13.3523 3.38627 12.8224 3.77691 12.4318C4.16756 12.0411 4.69747 11.8215 5.25 11.8215H5.34C5.68214 11.8 6.01542 11.7059 6.31542 11.5465C6.61542 11.387 6.87411 11.1666 7.0726 10.9015C7.31489 10.593 7.45218 10.2703 7.47303 9.93782C7.49389 9.60533 7.39739 9.27261 7.1935 8.96799V8.96799L7.1335 8.90799C6.93869 8.71318 6.78428 8.48211 6.67905 8.22782C6.57381 7.97353 6.51978 7.70106 6.51978 7.42575C6.51978 7.15044 6.57381 6.87797 6.67905 6.62368C6.78428 6.36939 6.93869 6.13831 7.1335 5.9435C7.32831 5.74869 7.55939 5.59428 7.81368 5.48905C8.06797 5.38381 8.34044 5.32978 8.61575 5.32978C8.89106 5.32978 9.16353 5.38381 9.41782 5.48905C9.67211 5.59428 9.90319 5.74869 10.098 5.9435L10.158 6.0035C10.4626 6.20739 10.7953 6.30389 11.1278 6.28303C11.4603 6.26218 11.783 6.12489 12.0915 5.8826H12.0915C12.3567 5.68411 12.5771 5.42542 12.7365 5.12542C12.8959 4.82542 12.99 4.49214 13.0115 4.15H13.0115V3.92C13.0115 3.36747 13.2311 2.83756 13.6218 2.44691C14.0124 2.05627 14.5423 1.83667 15.0948 1.83667C15.6474 1.83667 16.1773 2.05627 16.5679 2.44691C16.9586 2.83756 17.1782 3.36747 17.1782 3.92V3.98C17.1996 4.32214 17.2938 4.65542 17.4532 4.95542C17.6126 5.25542 17.8329 5.51411 18.0982 5.7126C18.4067 5.95489 18.7293 6.09218 19.0618 6.11303C19.3943 6.13389 19.727 6.03739 20.0316 5.8335L20.0916 5.7735C20.2864 5.57869 20.5175 5.42428 20.7718 5.31905C21.0261 5.21381 21.2986 5.15978 21.5739 5.15978C21.8492 5.15978 22.1217 5.21381 22.376 5.31905C22.6303 5.42428 22.8613 5.57869 23.0561 5.7735C23.251 5.96831 23.4054 6.19939 23.5106 6.45368C23.6158 6.70797 23.6699 6.98044 23.6699 7.25575C23.6699 7.53106 23.6158 7.80353 23.5106 8.05782C23.4054 8.31211 23.251 8.54319 23.0561 8.738L22.9961 8.798C22.7922 9.10261 22.6957 9.43533 22.7166 9.76782C22.7374 10.1003 22.8747 10.423 23.117 10.7315V10.7315C23.3155 10.9967 23.5742 11.2171 23.8742 11.3765C24.1742 11.5359 24.5075 11.63 24.8496 11.6515H25.08C25.6325 11.6515 26.1625 11.8711 26.5531 12.2618C26.9437 12.6524 27.1633 13.1823 27.1633 13.7348C27.1633 14.2874 26.9437 14.8173 26.5531 15.2079C26.1625 15.5986 25.6325 15.8182 25.08 15.8182H25.02C24.6779 15.8396 24.3446 15.9338 24.0446 16.0932C23.7446 16.2526 23.4859 16.4729 23.2874 16.7382V16.7382"
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

      {/* Floating Action Button - Principal (violet) */}
      <button
        type="button"
        className="fab"
        onClick={() => openEntry("spending")}
        style={{
          position: "fixed",
          bottom: "100px", // ← Plus haut (au-dessus de la navbar)
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
          bottom: "170px", // ← Encore plus haut (au-dessus du bouton +)
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

      {/* Bottom sheet "Nouvelle entrée" */}
      {entryOpen && (
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

            <div className="entry-search">
              <input
                type="text"
                placeholder="Rechercher une entrée similaire..."
              />
            </div>

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
              height: "90vh", // Force la hauteur
              overflow: "hidden", // Pas de scroll ici
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
              overflow: "hidden",
            }}>
              <UniversalImporterV2 onImport={handleImportTransactions} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;