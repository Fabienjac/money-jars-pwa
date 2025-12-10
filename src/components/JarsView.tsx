import React, { useEffect, useState } from "react";
import { fetchTotals } from "../api";
import { TotalsResponse, JarKey, JarSetting } from "../types";

const JAR_LABELS: Record<JarKey, string> = {
  NEC: "Nécessités",
  FFA: "Liberté Financière",
  LTSS: "Épargne Long Terme",
  PLAY: "Fun / Play",
  EDUC: "Éducation",
  GIFT: "Don / Gift",
};

const JAR_COLORS: Record<JarKey, string> = {
  NEC: "#3b82f6",
  FFA: "#22c55e",
  LTSS: "#facc15",
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

/**
 * Charge les réglages (pourcentages des jars) depuis l’onglet Réglages.
 * On renvoie un map { NEC: 0.55, FFA: 0.1, ... } ou null si rien.
 */
function loadJarSplitFromSettings(): Record<JarKey, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(JAR_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JarSetting[];
    const map: Partial<Record<JarKey, number>> = {};
    parsed.forEach((j) => {
      const pct = Number(j.percent);
      if (!isNaN(pct)) {
        map[j.key] = pct / 100;
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
  const [customSplit, setCustomSplit] = useState<Record<JarKey, number> | null>(
    null
  );

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
    <main className="page jars-page">
      {/* Header style iOS */}
      <header className="dashboard-header">
        <div className="dashboard-titles">
          <p className="dashboard-eyebrow">Système des 6 Jars</p>
          <h1 className="dashboard-title">Mes Finances</h1>
        </div>
        {/* Le bouton thème est déjà dans App, donc ici rien */}
      </header>

      {/* KPIs globaux */}
      <section className="glass-card kpi-section">
        <div className="kpi-grid">
          <article className="kpi-card kpi-revenue">
            <p className="kpi-label">Revenus</p>
            <p className="kpi-value">{formatMoney(totalRevenues)} €</p>
          </article>
          <article className="kpi-card kpi-spending">
            <p className="kpi-label">Dépenses</p>
            <p className="kpi-value">{formatMoney(totalSpendings)} €</p>
          </article>
          <article className="kpi-card kpi-balance">
            <p className="kpi-label">Balance</p>
            <p className="kpi-value">{formatMoney(totalBalance)} €</p>
          </article>
        </div>
      </section>

      {/* Jars */}
      <section className="jars-section">
        <div className="section-header-inline">
          <h2 className="section-title">Mes Jars</h2>
          <button
            type="button"
            className="chip-button"
            onClick={loadData}
            disabled={loading}
          >
            {loading ? "Rafraîchissement…" : "Rafraîchir"}
          </button>
        </div>

        <div className="jars-list">
          {(Object.keys(totals.jars) as JarKey[]).map((key) => {
            const jar = totals.jars[key];
            const backendSplit = totals.split?.[key]; // 0–1
            const settingsSplit = customSplit?.[key]; // 0–1
            const effectiveSplit =
              settingsSplit != null
                ? settingsSplit
                : backendSplit != null
                ? backendSplit
                : 0;

            return (
              <article
                key={key}
                className="jar-card ios-card"
                style={{
                  boxShadow: `0 0 0 1px rgba(148,163,184,0.2), 0 18px 35px rgba(15,23,42,0.16)`,
                  borderTop: `4px solid ${JAR_COLORS[key]}`,
                }}
              >
                <header className="jar-card-header">
                  <div>
                    <p className="jar-key">{key}</p>
                    <h3 className="jar-name">{JAR_LABELS[key]}</h3>
                  </div>
                  <div className="jar-percent-chip">
                    {effectiveSplit * 100 ? (effectiveSplit * 100).toFixed(1) : "0.0"}{" "}
                    <span>%</span>
                  </div>
                </header>

                <dl className="jar-stats">
                  <div className="jar-stat-row">
                    <dt>Revenus</dt>
                    <dd>{formatMoney(jar.revenues)} €</dd>
                  </div>
                  <div className="jar-stat-row">
                    <dt>Dépensé</dt>
                    <dd>{formatMoney(jar.spendings)} €</dd>
                  </div>
                  <div className="jar-stat-row">
                    <dt>Solde</dt>
                    <dd className={jar.net < 0 ? "neg" : ""}>
                      {formatMoney(jar.net)} €
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
};

export default JarsView;
