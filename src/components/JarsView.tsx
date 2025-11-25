// src/components/JarsView.tsx
import React, { useEffect, useState } from "react";
import { fetchTotals } from "../api";

// Types locaux alignés sur la réponse JSON de gsheetProxy
type JarTotals = {
  revenues: number;
  spendings: number;
  net: number;
  revPct: number;
};

type Totals = {
  jars: Record<string, JarTotals>;
  totalRevenues: number;
  split?: Record<string, number>;
};

const jarLabels: Record<string, string> = {
  NEC: "Nécessités",
  FFA: "Liberté financière",
  LTSS: "Épargne long terme",
  PLAY: "Fun / Play",
  EDUC: "Éducation",
  GIFT: "Don / Gift",
};

function formatAmount(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";
}

function getJarClass(jar: JarTotals): string {
  // Couleurs en fonction du solde
  if (jar.net < 0) return "jar-card jar-negative";
  if (jar.net >= 0 && jar.net < jar.revenues * 0.05) return "jar-card jar-warning";
  return "jar-card jar-positive";
}

const JarsView: React.FC = () => {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTotals() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTotals();
      // On loggue pour vérifier facilement dans la console du navigateur
      console.log("Jars totals from API:", data);
      // On force la forme attendue
      const safe: Totals = {
        jars: (data as any).jars || {},
        totalRevenues: Number((data as any).totalRevenues) || 0,
        split: (data as any).split || undefined,
      };
      setTotals(safe);
    } catch (e: any) {
      console.error("Erreur lors du chargement des jarres :", e);
      setError("Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTotals();
  }, []);

  const jarsEntries = totals ? Object.entries(totals.jars || {}) : [];
  const hasData = !!totals && jarsEntries.length > 0 && totals.totalRevenues > 0;

  return (
    <div className="page jars-page">
      <div className="card jars-header-card">
        <div className="card-header">
          <h2>Jarres</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={loadTotals}
            disabled={loading}
          >
            {loading ? "…" : "Rafraîchir"}
          </button>
        </div>

        <p className="card-subtitle">
          Total des revenus suivis :{" "}
          <span className="amount-strong">
            {totals ? formatAmount(totals.totalRevenues) : "—"}
          </span>
        </p>

        {error && (
          <p className="error-text" style={{ marginTop: "0.5rem" }}>
            {error}
          </p>
        )}
      </div>

      {!loading && !error && !hasData && (
        <div className="card jars-empty-card">
          <p>Aucune donnée de jarres pour le moment.</p>
        </div>
      )}

      {!error && hasData && (
        <div className="jars-grid">
          {jarsEntries.map(([code, jar]) => (
            <div key={code} className={getJarClass(jar)}>
              <div className="jar-header">
                <div>
                  <div className="jar-name">{jarLabels[code] || code}</div>
                  <div className="jar-code">{code}</div>
                </div>
                <div className="jar-pct">
                  {jar.revPct?.toFixed(0) ?? 0}
                  <span className="jar-pct-symbol">%</span>
                </div>
              </div>

              <div className="jar-row">
                <span>Alloué (revenus)</span>
                <span>{formatAmount(jar.revenues)}</span>
              </div>
              <div className="jar-row">
                <span>Dépensé</span>
                <span>{formatAmount(jar.spendings)}</span>
              </div>
              <div className="jar-row jar-row-balance">
                <span>Solde</span>
                <span className={jar.net < 0 ? "amount-negative" : ""}>
                  {formatAmount(jar.net)}
                </span>
              </div>

              <div className="jar-progress-wrapper">
                <div className="jar-progress-bg">
                  <div
                    className="jar-progress-fill"
                    style={{
                      width:
                        jar.revenues > 0
                          ? `${Math.max(
                              0,
                              Math.min(100, (jar.net / jar.revenues) * 100)
                            )}%`
                          : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default JarsView;
