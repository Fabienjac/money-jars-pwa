// src/App.tsx
import React, { useState, useEffect } from "react";
import SpendingForm from "./components/SpendingForm";
import RevenueForm from "./components/RevenueForm";
import HistoryView, { HistoryUseEntry } from "./components/HistoryView";
import JarsView from "./components/JarsView";
import "./style.css";

type Tab = "spending" | "revenue" | "history" | "jars";

function App() {
  const [tab, setTab] = useState<Tab>("spending");

  // Dark mode
  const [darkMode, setDarkMode] = useState(false);

  // Pré-remplissage venant de l'historique
  const [prefillSpending, setPrefillSpending] = useState<any | null>(null);
  const [prefillRevenue, setPrefillRevenue] = useState<any | null>(null);

  // Charger la préférence de thème depuis le localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("mj-dark-mode");
      if (stored === "1") {
        setDarkMode(true);
      }
    } catch {
      // pas grave si le localStorage n'est pas dispo
    }
  }, []);

  // Sauvegarder la préférence de thème
  useEffect(() => {
    try {
      localStorage.setItem("mj-dark-mode", darkMode ? "1" : "0");
    } catch {
      // ignore
    }
  }, [darkMode]);

  // Quand on clique sur "Utiliser" dans l’historique
  const handleUseEntry = (entry: HistoryUseEntry) => {
    if (entry.kind === "spending") {
      setPrefillSpending(entry.row);
      setTab("spending");
    } else {
      setPrefillRevenue(entry.row);
      setTab("revenue");
    }
  };

  return (
    <div className={`app-shell ${darkMode ? "dark" : ""}`}>
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title">Money Jars</h1>
          <p className="app-subtitle">
            Journal MMI (Harv Eker) connecté à ton Google Sheet.
          </p>
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

      {/* Barre d’onglets compacte en 1 ligne */}
      <nav className="tab-bar">
        <button
          type="button"
          className={`tab-btn ${tab === "spending" ? "active" : ""}`}
          onClick={() => setTab("spending")}
        >
          + Dépense
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "revenue" ? "active" : ""}`}
          onClick={() => setTab("revenue")}
        >
          + Revenu
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          Historique
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "jars" ? "active" : ""}`}
          onClick={() => setTab("jars")}
        >
          Jarres
        </button>
      </nav>

      <section className="page">
        {tab === "spending" && (
          <SpendingForm
            prefill={prefillSpending}
            onClearPrefill={() => setPrefillSpending(null)}
          />
        )}

        {tab === "revenue" && (
          <RevenueForm
            prefill={prefillRevenue}
            onClearPrefill={() => setPrefillRevenue(null)}
          />
        )}

        {tab === "history" && <HistoryView onUseEntry={handleUseEntry} />}

        {tab === "jars" && <JarsView />}
      </section>

      <footer className="app-footer">
        v0.1 · Données stockées dans ton Google Sheet (Apps Script).
      </footer>
    </div>
  );
}

export default App;
