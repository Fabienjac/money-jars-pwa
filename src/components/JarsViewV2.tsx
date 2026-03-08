// src/components/JarsViewV2.tsx
// NOUVELLE VERSION - UX Optimisée pour usage mobile quotidien
import React, { useEffect, useState } from "react";
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
  const [showJarsDetail, setShowJarsDetail] = useState(false);

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
    setCustomSplit(loadJarSplitFromSettings());
  }, []);

  useEffect(() => {
    if (showJarsDetail && !totals && !loading) loadData();
  }, [showJarsDetail]);

  const totalRevenues = totals?.totalRevenues || 0;
  const totalSpendings = totals
    ? Object.values(totals.jars).reduce((acc, j) => acc + (j.spendings || 0), 0)
    : 0;
  const totalBalance = totalRevenues - totalSpendings;
  const jarKeys = totals ? (Object.keys(totals.jars) as JarKey[]) : [];

  return (
    <main className="jars-v2-page">
      {/* 🎯 Page d'accueil : uniquement les 2 actions principales (pas de chargement) */}
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

      {/* Lien pour afficher le détail des jarres à la demande */}
      {!showJarsDetail ? (
        <section className="jars-v2-detail-link">
          <button
            type="button"
            className="jars-v2-detail-btn"
            onClick={() => setShowJarsDetail(true)}
          >
            📊 Voir le détail des jarres et du bilan
          </button>
        </section>
      ) : (
        <>
          {loading && !totals && (
            <div className="jars-v2-loading-inline">
              <div className="spinner"></div>
              <p>Chargement des données…</p>
            </div>
          )}

          {error && !totals && (
            <div className="jars-v2-error-inline">
              <p>❌ {error}</p>
              <button onClick={loadData} className="btn-retry">
                Réessayer
              </button>
            </div>
          )}

          {totals && (
            <>
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

              <section className="jars-v2-section">
                <div className="jars-v2-section-header">
                  <h2 className="jars-v2-section-title">🏺 Mes Jarres</h2>
                </div>
                <div className="jars-v2-grid">
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
                          <p className="jar-spent-amount">{formatMoney(spent)} €</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
};

export default JarsViewV2;
