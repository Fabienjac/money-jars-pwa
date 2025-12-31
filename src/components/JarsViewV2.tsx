// src/components/JarsViewV2.tsx
// NOUVELLE VERSION - UX Optimisée pour usage mobile quotidien
import React, { useEffect, useState, useRef } from "react";
import { fetchTotals } from "../api";
import { TotalsResponse, JarKey } from "../types";

const JAR_LABELS: Record<JarKey, string> = {
  NEC: "Nécessités",
  FFA: "Liberté Financière",
  LTSS: "Épargne Long Terme",
  PLAY: "Fun / Play",
  EDUC: "Éducation",
  GIFT: "Don / Gift",
};

const JAR_EMOJIS: Record<JarKey, string> = {
  NEC: "🏺",
  FFA: "🌱",
  LTSS: "🏦",
  PLAY: "🎮",
  EDUC: "📚",
  GIFT: "🎁",
};

const JAR_COLORS: Record<JarKey, string> = {
  NEC: "#007AFF",
  FFA: "#34C759",
  LTSS: "#FFD60A",
  PLAY: "#FF9500",
  EDUC: "#AF52DE",
  GIFT: "#5AC8FA",
};

const JAR_SETTINGS_STORAGE_KEY = "mjars:jarSettings";

function formatMoney(value: number | null | undefined): string {
  const v = typeof value === "number" && !isNaN(value) ? value : 0;
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function loadJarSplitFromSettings(): Record<JarKey, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(JAR_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any[];
    const map: Partial<Record<JarKey, number>> = {};
    parsed.forEach((j) => {
      const key = j?.key as JarKey | undefined;
      const pct = Number(j?.percent);
      if (key && !isNaN(pct)) {
        map[key] = pct / 100;
      }
    });
    return map as Record<JarKey, number>;
  } catch {
    return null;
  }
}

interface JarsViewV2Props {
  onOpenSpending: () => void;
  onOpenRevenue: () => void;
}

const JarsViewV2: React.FC<JarsViewV2Props> = ({ onOpenSpending, onOpenRevenue }) => {
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customSplit, setCustomSplit] = useState<Record<JarKey, number> | null>(null);
  
  // Pour le swipe horizontal des jars
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTotals();
      setTotals(data);
    } catch (err: any) {
      console.error("Erreur chargement totals:", err);
      setError(err?.message || "Erreur lors du chargement des totaux.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setCustomSplit(loadJarSplitFromSettings());
  }, []);

  if (loading && !totals) {
    return (
      <main className="jars-v2-page">
        <div className="jars-v2-loading">
          <div className="spinner"></div>
          <p>Chargement…</p>
        </div>
      </main>
    );
  }

  if (error && !totals) {
    return (
      <main className="jars-v2-page">
        <div className="jars-v2-error">
          <p>❌ {error}</p>
          <button onClick={loadData} className="btn-retry">
            Réessayer
          </button>
        </div>
      </main>
    );
  }

  if (!totals) {
    return (
      <main className="jars-v2-page">
        <div className="jars-v2-empty">
          <p>Aucune donnée pour le moment.</p>
        </div>
      </main>
    );
  }

  const totalRevenues = totals.totalRevenues || 0;
  const totalSpendings = Object.values(totals.jars).reduce(
    (acc, j) => acc + (j.spendings || 0),
    0
  );
  const totalBalance = totalRevenues - totalSpendings;

  const jarKeys = Object.keys(totals.jars) as JarKey[];

  return (
    <main className="jars-v2-page">
      {/* 🎯 ACTIONS RAPIDES - LES PLUS UTILISÉES */}
      <section className="jars-v2-quick-actions">
        <button
          type="button"
          className="quick-action-btn quick-action-spending"
          onClick={onOpenSpending}
        >
          <span className="quick-action-icon">💰</span>
          <div className="quick-action-text">
            <span className="quick-action-label">Dépense</span>
            <span className="quick-action-sub">Rapide</span>
          </div>
        </button>

        <button
          type="button"
          className="quick-action-btn quick-action-revenue"
          onClick={onOpenRevenue}
        >
          <span className="quick-action-icon">💵</span>
          <div className="quick-action-text">
            <span className="quick-action-label">Revenu</span>
            <span className="quick-action-sub">Ajouter</span>
          </div>
        </button>
      </section>

      {/* 🏺 MES JARS - SWIPE HORIZONTAL */}
      <section className="jars-v2-section">
        <div className="jars-v2-section-header">
          <h2 className="jars-v2-section-title">🏺 Mes Jars</h2>
          {loading && <div className="mini-spinner"></div>}
        </div>

        <div className="jars-v2-scroll-container" ref={scrollContainerRef}>
          {jarKeys.map((key) => {
            const jar = totals.jars[key];
            const backendSplit = totals.split?.[key];
            const settingsSplit = customSplit?.[key];
            const effectiveSplit =
              settingsSplit != null
                ? settingsSplit
                : backendSplit != null
                ? backendSplit
                : 0;

            const allocated = jar.revenues || 0;
            const spent = jar.spendings || 0;
            const progressPercent = allocated > 0 ? (spent / allocated) * 100 : 0;

            return (
              <article key={key} className="jar-card-v2">
                <div className="jar-card-header">
                  <div className="jar-card-title">
                    <span className="jar-emoji">{JAR_EMOJIS[key]}</span>
                    <span className="jar-code">{key}</span>
                  </div>
                  <span
                    className="jar-percent"
                    style={{ color: JAR_COLORS[key] }}
                  >
                    {(effectiveSplit * 100).toFixed(0)}%
                  </span>
                </div>

                <p className="jar-label">{JAR_LABELS[key]}</p>

                <p className="jar-amount">
                  {formatMoney(jar.net)}
                  <span className="jar-currency">€</span>
                </p>

                {/* Barre de progression */}
                <div className="jar-progress-wrapper">
                  <div className="jar-progress-info">
                    <span className="jar-progress-label">Dépensé</span>
                    <span className="jar-progress-value">
                      {progressPercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="jar-progress-bar">
                    <div
                      className="jar-progress-fill"
                      style={{
                        width: `${Math.min(progressPercent, 100)}%`,
                        backgroundColor: JAR_COLORS[key],
                      }}
                    />
                  </div>
                  <p className="jar-spent-amount">
                    {formatMoney(spent)} €
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="jars-v2-scroll-hint">← swipe →</div>
      </section>

      {/* 📊 BILAN RAPIDE - COMPACT */}
      <section className="jars-v2-summary">
        <h3 className="jars-v2-summary-title">📊 Bilan Rapide</h3>
        <div className="jars-v2-summary-grid">
          <div className="summary-item summary-revenues">
            <span className="summary-label">💰 Revenus</span>
            <span className="summary-value">{formatMoney(totalRevenues)}€</span>
          </div>
          <div className="summary-item summary-spendings">
            <span className="summary-label">💸 Dépenses</span>
            <span className="summary-value">{formatMoney(totalSpendings)}€</span>
          </div>
          <div className="summary-item summary-balance">
            <span className="summary-label">💎 Balance</span>
            <span className="summary-value summary-value--highlight">
              {formatMoney(totalBalance)}€
            </span>
          </div>
        </div>
      </section>
    </main>
  );
};

export default JarsViewV2;
