// src/components/JarsView.tsx - VERSION AVEC BARRES DE PROGRESSION
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

const JAR_COLORS_SOFT: Record<JarKey, string> = {
  NEC: "rgba(59,130,246,0.08)",
  FFA: "rgba(34,197,94,0.10)",
  LTSS: "rgba(250,204,21,0.12)",
  PLAY: "rgba(249,115,22,0.10)",
  EDUC: "rgba(168,85,247,0.10)",
  GIFT: "rgba(6,182,212,0.10)",
};

const JAR_DOT_COLORS: Record<JarKey, string> = {
  NEC: "#2563eb",
  FFA: "#16a34a",
  LTSS: "#eab308",
  PLAY: "#f97316",
  EDUC: "#a855f7",
  GIFT: "#06b6d4",
};

const JAR_SETTINGS_STORAGE_KEY = "mjars:jarSettings";

function formatMoney(value: number | null | undefined) {
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

const JarsView: React.FC = () => {
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customSplit, setCustomSplit] = useState<Record<JarKey, number> | null>(null);

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
      <main className="page center">
        <p>Chargement…</p>
      </main>
    );
  }

  if (error && !totals) {
    return (
      <main className="page center">
        <p className="error-text">{error}</p>
      </main>
    );
  }

  if (!totals) {
    return (
      <main className="page center">
        <p>Aucune donnée pour le moment.</p>
      </main>
    );
  }

  const totalRevenues = totals.totalRevenues || 0;
  const totalSpendings = Object.values(totals.jars).reduce(
    (acc, j) => acc + (j.spendings || 0),
    0
  );
  const totalBalance = totalRevenues - totalSpendings;

  return (
    <main className="page home-page">
      {/* 3 cartes KPI */}
      <section className="home-kpis">
        <article className="home-kpi-pill home-kpi-pill--revenues">
          <p className="home-kpi-label">Revenus</p>
          <p className="home-kpi-value">{formatMoney(totalRevenues)} €</p>
        </article>

        <article className="home-kpi-pill home-kpi-pill--spendings">
          <p className="home-kpi-label">Dépenses</p>
          <p className="home-kpi-value">{formatMoney(totalSpendings)} €</p>
        </article>

        <article className="home-kpi-pill home-kpi-pill--balance">
          <p className="home-kpi-label">Balance</p>
          <p className="home-kpi-value">{formatMoney(totalBalance)} €</p>
        </article>
      </section>

      {/* Mes Jars */}
      <section className="home-section">
        <div className="home-section-header">
          <h2 className="home-section-title">Mes Jars</h2>
          <button
            type="button"
            className="chip-button"
            onClick={loadData}
            disabled={loading}
          >
            {loading ? "Rafraîchissement…" : "Rafraîchir"}
          </button>
        </div>

        <div className="home-jar-grid">
          {(Object.keys(totals.jars) as JarKey[]).map((key) => {
            const jar = totals.jars[key];
            const backendSplit = totals.split?.[key];
            const settingsSplit = customSplit?.[key];
            const effectiveSplit =
              settingsSplit != null
                ? settingsSplit
                : backendSplit != null
                ? backendSplit
                : 0;

            // Calcul de la progression (dépensé / alloué)
            const allocated = jar.revenues || 0;
            const spent = jar.spendings || 0;
            const progressPercent = allocated > 0 ? (spent / allocated) * 100 : 0;

            return (
              <article
                key={key}
                className="home-jar-card"
                style={{ backgroundColor: JAR_COLORS_SOFT[key] }}
              >
                <header className="home-jar-header">
                  <div className="home-jar-title-row">
                    <span
                      className="home-jar-dot"
                      style={{ backgroundColor: JAR_DOT_COLORS[key] }}
                    />
                    <span className="home-jar-code">{key}</span>
                  </div>
                  <div className="home-jar-percent">
                    {(effectiveSplit * 100).toFixed(1)}%
                  </div>
                </header>

                <p className="home-jar-name">{JAR_LABELS[key]}</p>

                <p className="home-jar-amount">
                  {formatMoney(jar.net)} <span>€</span>
                </p>

                {/* Barre de progression */}
                <div className="jar-progress-wrapper">
                  <div className="jar-progress-bg">
                    <div
                      className="jar-progress-fill"
                      style={{
                        width: `${Math.min(progressPercent, 100)}%`,
                        backgroundColor: JAR_DOT_COLORS[key],
                      }}
                    />
                  </div>
                </div>

                <p className="home-jar-spent">
                  Dépensé : {formatMoney(jar.spendings)} €
                </p>

                {/* Icône de tendance */}
                {jar.net > 0 && (
                  <div className="jar-trend-icon">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M2 10L6 6L9 9L14 4M14 4V8M14 4H10"
                        stroke={JAR_DOT_COLORS[key]}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
};

export default JarsView;