// src/components/JarsView.tsx
import React, { useEffect, useMemo, useState } from "react";
import { fetchTotals } from "../api";
import { TotalsResponse } from "../types";

type JarKey = "NEC" | "FFA" | "LTSS" | "PLAY" | "EDUC" | "GIFT";

const JAR_LABELS: Record<JarKey, string> = {
  NEC: "Nécessités",
  FFA: "Liberté financière",
  LTSS: "Épargne long terme",
  PLAY: "Fun / Play",
  EDUC: "Éducation",
  GIFT: "Don / Gift",
};

const JAR_COLORS: Record<JarKey, string> = {
  NEC: "#2563eb",  // bleu
  FFA: "#16a34a",  // vert
  LTSS: "#7c3aed", // violet
  PLAY: "#f97316", // orange
  EDUC: "#e11d48", // rose/rouge
  GIFT: "#0ea5e9", // cyan
};

export default function JarsView() {
  const [data, setData] = useState<TotalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchTotals();
      setData(res);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const jarList = useMemo(() => {
    if (!data) return [];
    const jars = data.jars || {};
    return (Object.keys(jars) as JarKey[])
      .filter((k) => jars[k])
      .map((k) => ({
        key: k,
        label: JAR_LABELS[k],
        color: JAR_COLORS[k],
        ...jars[k],
      }));
  }, [data]);

  const maxAbsNet = useMemo(() => {
    if (!jarList.length) return 0;
    return Math.max(...jarList.map((j: any) => Math.abs(j.net || 0)));
  }, [jarList]);

  const formatMoney = (v: number | undefined) =>
    typeof v === "number" && !isNaN(v) ? `${v.toFixed(2)} €` : "—";

  return (
    <main className="container">
      <div className="page-header">
        <h2>Jarres</h2>
        <button
          type="button"
          className="secondary small"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Rafraîchissement…" : "Rafraîchir"}
        </button>
      </div>

      {error && (
        <p className="error-text" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      {data && (
        <p className="jars-summary">
          Total des revenus suivis :{" "}
          <strong>{formatMoney(data.totalRevenues)}</strong>
        </p>
      )}

      {/* Cartes jarre par jarre */}
      <div className="jars-grid">
        {jarList.map((jar: any) => {
          const rev = jar.revenues || 0;
          const spend = jar.spendings || 0;
          const net = jar.net || 0;
          const pct = jar.revPct || 0;

          const barWidth =
            maxAbsNet > 0 ? Math.round((Math.abs(net) / maxAbsNet) * 100) : 0;

          return (
            <article
              key={jar.key}
              className="jar-card"
              style={{ borderTopColor: jar.color }}
            >
              <header className="jar-card-header">
                <div>
                  <h3 className="jar-name">{jar.label}</h3>
                  <p className="jar-key">{jar.key}</p>
                </div>
                <span className="jar-pct">{pct.toFixed(1)} % du revenu</span>
              </header>

              <dl className="jar-stats">
                <div>
                  <dt>Alloué</dt>
                  <dd>{formatMoney(rev)}</dd>
                </div>
                <div>
                  <dt>Dépensé</dt>
                  <dd>{formatMoney(spend)}</dd>
                </div>
                <div>
                  <dt>Solde</dt>
                  <dd className={net < 0 ? "neg" : ""}>{formatMoney(net)}</dd>
                </div>
              </dl>

              {/* Mini “graphique” barre */}
              <div className="jar-bar-wrapper">
                <div className="jar-bar-bg" />
                <div
                  className={`jar-bar-fill ${net < 0 ? "neg" : ""}`}
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: jar.color,
                  }}
                />
              </div>
            </article>
          );
        })}
      </div>

      {!loading && !error && jarList.length === 0 && (
        <p style={{ marginTop: "1rem", color: "#777" }}>
          Aucune donnée de jarres pour le moment.
        </p>
      )}
    </main>
  );
}
