// src/components/JarsView.tsx
import React, { useEffect, useState } from "react";
import { fetchTotals } from "../api";
import type { TotalsResponse } from "../types";

const JAR_ORDER: Array<keyof TotalsResponse["jars"]> = [
  "NEC",
  "FFA",
  "LTSS",
  "PLAY",
  "EDUC",
  "GIFT",
];

const JAR_LABELS: Record<keyof TotalsResponse["jars"], string> = {
  NEC: "Nécessités",
  FFA: "Liberté financière",
  LTSS: "Épargne long terme",
  PLAY: "Fun / Play",
  EDUC: "Éducation",
  GIFT: "Don / Gift",
};

const JAR_COLORS: Record<keyof TotalsResponse["jars"], string> = {
  NEC: "#3b82f6",  // bleu
  FFA: "#22c55e",  // vert
  LTSS: "#a855f7", // violet
  PLAY: "#fb923c", // orange
  EDUC: "#ec4899", // rose
  GIFT: "#06b6d4", // turquoise
};

function formatAmount(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "0,00 €";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  return `${(value * 100).toFixed(0)} %`;
}

type State =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: TotalsResponse }
  | { status: "error"; message: string };

const JarsView: React.FC = () => {
  const [state, setState] = useState<State>({ status: "idle" });

  const load = async () => {
    try {
      setState({ status: "loading" });
      const data = await fetchTotals();
      setState({ status: "ready", data });
    } catch (e: any) {
      console.error(e);
      setState({
        status: "error",
        message: e?.message || "Erreur inconnue",
      });
    }
  };

  useEffect(() => {
    if (state.status === "idle") {
      void load();
    }
  }, [state.status]);

  const isLoading = state.status === "loading" || state.status === "idle";

  const totalRevenues =
    state.status === "ready" ? state.data.totalRevenues || 0 : 0;

  return (
    <div className="card jars-card">
      <div className="jars-header">
        <h2 className="card-title">Jarres</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={load}
          disabled={isLoading}
        >
          {isLoading ? "Chargement..." : "Rafraîchir"}
        </button>
      </div>

      {state.status === "error" && (
        <p className="error-text">Erreur : {state.message}</p>
      )}

      {/* SECTION: DONUT + TOTAL */}
      <div className="jars-top">
        <div className="jars-total">
          <p className="jars-total-label">Total des revenus suivis :</p>
          <p className="jars-total-value">{formatAmount(totalRevenues)}</p>
        </div>

        {state.status === "ready" && totalRevenues > 0 && (
          <JarDonut
            totalRevenues={totalRevenues}
            jars={state.data.jars}
          />
        )}
      </div>

      {/* LISTE DES JARRES */}
      {state.status === "ready" && totalRevenues > 0 ? (
        <div className="jars-grid">
          {JAR_ORDER.map((key) => {
            const jar = state.data.jars[key];
            if (!jar) return null;

            const color = JAR_COLORS[key];
            const rev = jar.revenues || 0;
            const spent = jar.spendings || 0;
            const net = jar.net || 0;
            const targetPct = state.data.split?.[key] ?? jar.revPct ?? 0;
            const usedPct = rev > 0 ? Math.min(Math.max(net / rev, -1), 1) : 0;

            // couleur de barre en fonction du solde
            let barClass = "jar-progress-bar-positive";
            if (net < 0) {
              barClass = "jar-progress-bar-negative";
            } else if (Math.abs(net) < rev * 0.05) {
              barClass = "jar-progress-bar-warning";
            }

            return (
              <article
                key={key}
                className="jar-card"
                style={{ ["--jar-color" as any]: color }}
              >
                <header className="jar-card-header">
                  <div>
                    <h3 className="jar-card-title">{JAR_LABELS[key]}</h3>
                    <p className="jar-card-sub">
                      {key} · {formatPercent(jar.revPct)}
                    </p>
                  </div>
                  <span className="jar-pill">
                    {formatPercent(targetPct)} du revenu
                  </span>
                </header>

                <dl className="jar-metrics">
                  <div className="jar-metric">
                    <dt>Alloué (revenus)</dt>
                    <dd>{formatAmount(rev)}</dd>
                  </div>
                  <div className="jar-metric">
                    <dt>Dépensé</dt>
                    <dd>{formatAmount(spent)}</dd>
                  </div>
                  <div className="jar-metric">
                    <dt>Solde</dt>
                    <dd className={net < 0 ? "amount-negative" : ""}>
                      {formatAmount(net)}
                    </dd>
                  </div>
                </dl>

                <div className="jar-progress">
                  <div className="jar-progress-top">
                    <span>Solde vs alloué</span>
                    <span className="jar-progress-legend">
                      {rev > 0 ? `${(usedPct * 100).toFixed(0)} %` : "—"}
                    </span>
                  </div>
                  <div className="jar-progress-track">
                    <div
                      className={`jar-progress-bar ${barClass}`}
                      style={{
                        ["--jar-progress" as any]: `${
                          Math.max(0, Math.min(1, usedPct)) * 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        !isLoading &&
        state.status !== "error" && (
          <p className="empty-text">
            Aucune donnée de jarres pour le moment.
          </p>
        )
      )}
    </div>
  );
};

export default JarsView;

/* ---------- Donut SVG ---------- */

type JarDonutProps = {
  totalRevenues: number;
  jars: TotalsResponse["jars"];
};

const JarDonut: React.FC<JarDonutProps> = ({ totalRevenues, jars }) => {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  const segments = JAR_ORDER.map((key) => {
    const jar = jars[key];
    if (!jar) return null;
    const value = Math.max(jar.revenues || 0, 0);
    const fraction =
      totalRevenues > 0 ? Math.max(0, Math.min(1, value / totalRevenues)) : 0;
    return {
      key,
      color: JAR_COLORS[key],
      fraction,
    };
  }).filter(Boolean) as Array<{
    key: keyof TotalsResponse["jars"];
    color: string;
    fraction: number;
  }>;

  let cumulative = 0;

  return (
    <div className="jar-donut-wrapper">
      <svg
        viewBox="0 0 120 120"
        className="jar-donut"
        aria-hidden="true"
        role="img"
      >
        <circle
          className="jar-donut-track"
          cx="60"
          cy="60"
          r={radius}
          fill="transparent"
        />
        {segments.map((seg) => {
          const dash = seg.fraction * circumference;
          const dashArray = `${dash} ${circumference - dash}`;
          const offset = -cumulative * circumference;
          cumulative += seg.fraction;

          return (
            <circle
              key={seg.key}
              className="jar-donut-segment"
              cx="60"
              cy="60"
              r={radius}
              fill="transparent"
              stroke={seg.color}
              strokeWidth={10}
              strokeDasharray={dashArray}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      <div className="jar-donut-center">
        <span className="jar-donut-center-label">Total</span>
        <span className="jar-donut-center-value">
          {formatAmount(totalRevenues)}
        </span>
      </div>

      <ul className="jar-donut-legend">
        {segments.map((seg) => (
          <li key={seg.key} className="jar-donut-legend-item">
            <span
              className="jar-donut-legend-dot"
              style={{ backgroundColor: seg.color }}
            />
            <span className="jar-donut-legend-label">
              {JAR_LABELS[seg.key]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};