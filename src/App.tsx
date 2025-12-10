// src/App.tsx
import React, { useState, useEffect } from "react";
import SpendingForm from "./components/SpendingForm";
import RevenueForm from "./components/RevenueForm";
import HistoryView, { HistoryUseEntry } from "./components/HistoryView";
import JarsView from "./components/JarsView";
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

  // Quand on clique "Utiliser" depuis l’historique
  const handleUseEntry = (entry: HistoryUseEntry) => {
    if (entry.kind === "spending") {
      openEntry("spending", entry.row);
    } else {
      openEntry("revenue", entry.row);
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

          {section === "history" && (
            <HistoryView onUseEntry={handleUseEntry} />
          )}

          {section === "settings" && <SettingsView />}
        </main>
      </div>

      {/* Bottom navigation */}
      <nav className="bottom-nav">
        <button
          type="button"
          className={`bottom-nav-btn ${section === "home" ? "active" : ""}`}
          onClick={() => setSection("home")}
        >
          <span className="bottom-nav-icon">🏠</span>
          <span className="bottom-nav-label">Accueil</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-btn ${section === "history" ? "active" : ""}`}
          onClick={() => setSection("history")}
        >
          <span className="bottom-nav-icon">📊</span>
          <span className="bottom-nav-label">Rapports</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-btn ${section === "settings" ? "active" : ""}`}
          onClick={() => setSection("settings")}
        >
          <span className="bottom-nav-icon">⚙️</span>
          <span className="bottom-nav-label">Réglages</span>
        </button>
      </nav>

      {/* Floating Action Button */}
      <button
        type="button"
        className="fab"
        onClick={() => openEntry("spending")}
      >
        +
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
    </div>
  );
}

function SettingsView() {
  return (
    <section className="settings-page">
      <h2>Configuration</h2>

      <div className="settings-card">
        <h3>Paramètres des Jars</h3>
        <p>
          Prochaine étape : affichage et édition des pourcentages et soldes
          initiaux pour chaque jar (NEC, FFA, LTSS, PLAY, EDUC, GIFT).
        </p>
      </div>

      <div className="settings-card">
        <h3>Règles automatiques</h3>
        <p>
          Prochaine étape : création de règles basées sur des mots-clés pour
          catégoriser automatiquement les dépenses et revenus.
        </p>
      </div>
    </section>
  );
}

export default App;
