// src/components/AnalyticsDashboard.tsx
import React, { useEffect, useState } from "react";
import { fetchAnalytics, AnalyticsResponse } from "../api";
import { MonthlyChart } from "./MonthlyChart";
import { SourcesPieChart } from "./SourcesPieChart";
import { JarEvolutionChart } from "./JarEvolutionChart";
import { TrendBadge } from "./TrendBadge";

export const AnalyticsDashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAnalytics();
      setAnalytics(data);
    } catch (err: any) {
      console.error("Erreur chargement analytics:", err);
      setError(err?.message || "Erreur lors du chargement des analyses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading && !analytics) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Chargement des analyses…</p>
      </div>
    );
  }

  if (error && !analytics) {
    return (
      <div style={{ padding: "20px" }}>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const { monthlyData, sourcesData, jarEvolution, trends } = analytics;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        marginTop: "24px",
      }}
    >
      {/* Badges de tendance */}
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          borderRadius: "20px",
          padding: "20px",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <h3
          style={{
            margin: "0 0 16px",
            fontSize: "18px",
            fontWeight: "700",
            color: "var(--text-main)",
          }}
        >
          📈 Tendances du mois
        </h3>
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                margin: "0 0 6px",
                fontWeight: "600",
              }}
            >
              Revenus
            </p>
            <TrendBadge
              current={trends.revenues.current}
              previous={trends.revenues.previous}
            />
          </div>
          <div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                margin: "0 0 6px",
                fontWeight: "600",
              }}
            >
              Dépenses
            </p>
            <TrendBadge
              current={trends.spendings.current}
              previous={trends.spendings.previous}
            />
          </div>
        </div>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            margin: "12px 0 0",
          }}
        >
          Comparaison {trends.currentMonth} vs {trends.previousMonth}
        </p>
      </div>

      {/* Graphique mensuel */}
      <MonthlyChart data={monthlyData} height={250} />

      {/* Répartition par source */}
      {sourcesData.length > 0 && (
        <SourcesPieChart data={sourcesData} height={300} />
      )}

      {/* Évolution des jarres */}
      <JarEvolutionChart data={jarEvolution} height={300} />

      {/* Bouton rafraîchir */}
      <button
        onClick={loadAnalytics}
        disabled={loading}
        style={{
          alignSelf: "center",
          padding: "12px 24px",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          background: "var(--bg-card)",
          color: "var(--text-main)",
          fontSize: "14px",
          fontWeight: "600",
          cursor: "pointer",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {loading ? "Actualisation…" : "🔄 Actualiser les analyses"}
      </button>
    </div>
  );
};
