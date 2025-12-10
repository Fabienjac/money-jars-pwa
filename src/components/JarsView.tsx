import React, { useEffect, useState } from "react";
import { fetchTotals } from "../api";
import { TotalsResponse, JarKey } from "../types";

const jarLabels: Record<JarKey, string> = {
  NEC: "Nécessités",
  FFA: "Liberté Financière",
  LTSS: "Épargne Long Terme",
  PLAY: "Fun / Play",
  EDUC: "Éducation",
  GIFT: "Don / Gift",
};

const jarColors: Record<JarKey, string> = {
  NEC: "#4F7EFF",
  FFA: "#00A86B",
  LTSS: "#FFCC00",
  PLAY: "#FF8A00",
  EDUC: "#BB66FF",
  GIFT: "#00C2FF",
};

function formatMoney(value: number | null | undefined) {
  const v = typeof value === "number" && !isNaN(value) ? value : 0;
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const JarsView: React.FC = () => {
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <p>Aucune donnée de jarres pour le moment.</p>
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
    <main className="page">
      {/* En-tête */}
      <div className="section-header">
        <div>
          <p className="subtitle small">Système des 6 Jars</p>
          <h1 className="title">Mes Finances</h1>
        </div>
        <button
          type="button"
          className="secondary-btn small"
          onClick={loadData}
          disabled={loading}
        >
          {loading ? "⟳" : "Rafraîchir"}
        </button>
      </div>

      {/* Résumé global */}
      <section className="card glass summary">
        <div className="summary-box">
          <span className="summary-label">Revenus</span>
          <span className="summary-value green">
            {formatMoney(totalRevenues)} €
          </span>
        </div>

        <div className="summary-box">
          <span className="summary-label">Dépenses</span>
          <span className="summary-value red">
            {formatMoney(totalSpendings)} €
          </span>
        </div>

        <div className="summary-box">
          <span className="summary-label">Balance</span>
          <span
            className={
              "summary-value " + (totalBalance < 0 ? "red" : "purple")
            }
          >
            {formatMoney(totalBalance)} €
          </span>
        </div>
      </section>

      {/* Liste des Jars */}
      <h2 className="section-title">Mes Jars</h2>

      <section className="jars-container">
        {(Object.keys(totals.jars) as JarKey[]).map((jarKey) => {
          const jar = totals.jars[jarKey];
          const splitRaw = totals.split?.[jarKey] ?? 0; // 0–1 a priori
          const splitPct = splitRaw * 100;

          return (
            <article
              key={jarKey}
              className="jar-card glass"
              style={{ borderLeft: `6px solid ${jarColors[jarKey]}` }}
            >
              <header className="jar-header">
                <div>
                  <p className="jar-key">{jarKey}</p>
                  <h3 className="jar-title">{jarLabels[jarKey]}</h3>
                </div>
                <div className="jar-percent">
                  {splitPct.toFixed(1)} <span>%</span>
                </div>
              </header>

              <dl className="jar-values">
                <div className="jar-line">
                  <dt>Revenus</dt>
                  <dd>{formatMoney(jar.revenues)} €</dd>
                </div>

                <div className="jar-line">
                  <dt>Dépensé</dt>
                  <dd>{formatMoney(jar.spendings)} €</dd>
                </div>

                <div className="jar-line">
                  <dt>Solde</dt>
                  <dd className={jar.net < 0 ? "neg" : ""}>
                    {formatMoney(jar.net)} €
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </section>
    </main>
  );
};

export default JarsView;
