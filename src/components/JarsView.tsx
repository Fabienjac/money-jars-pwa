// src/components/JarsView.tsx - VERSION MODERNE GLASSMORPHISM
import React, { useEffect, useMemo, useState } from "react";
import { fetchTotals } from "../api";
import { TotalsResponse } from "../types";

type JarKey = "NEC" | "FFA" | "LTSS" | "PLAY" | "EDUC" | "GIFT";

const JAR_META: Record<
  JarKey,
  { label: string; short: string; color: string; bgColor: string }
> = {
  NEC: {
    label: "Nécessités",
    short: "NEC",
    color: "#3b82f6",
    bgColor: "#dbeafe",
  },
  FFA: {
    label: "Liberté Financière",
    short: "FFA",
    color: "#10b981",
    bgColor: "#d1fae5",
  },
  LTSS: {
    label: "Épargne Long Terme",
    short: "LTSS",
    color: "#a855f7",
    bgColor: "#f3e8ff",
  },
  PLAY: {
    label: "Fun / Play",
    short: "PLAY",
    color: "#f59e0b",
    bgColor: "#fef3c7",
  },
  EDUC: {
    label: "Éducation",
    short: "EDUC",
    color: "#ec4899",
    bgColor: "#fce7f3",
  },
  GIFT: {
    label: "Don / Gift",
    short: "GIFT",
    color: "#06b6d4",
    bgColor: "#cffafe",
  },
};

const DONUT_RADIUS = 58;
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS;

function formatMoney(v: number | undefined | null) {
  if (v == null || isNaN(v)) return "0,00 €";
  return v.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
}

function formatPct(v: number | undefined | null) {
  if (v == null || isNaN(v)) return "0,0 %";
  return `${v.toFixed(1)} %`;
}

export default function JarsView() {
  const [data, setData] = useState<TotalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animate, setAnimate] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      setAnimate(false);
      const res = await fetchTotals();
      setData(res);
      setTimeout(() => setAnimate(true), 100);
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

  const totalRevenues = data?.totalRevenues ?? 0;

  const jarList = useMemo(() => {
    if (!data || !data.jars) return [];
    return (Object.keys(JAR_META) as JarKey[])
      .map((key) => {
        const raw = data.jars?.[key];
        if (!raw) return null;
        return {
          key,
          ...JAR_META[key],
          revenues: raw.revenues ?? 0,
          spendings: raw.spendings ?? 0,
          net: raw.net ?? 0,
        };
      })
      .filter(Boolean) as Array<{
        key: JarKey;
        label: string;
        short: string;
        color: string;
        bgColor: string;
        revenues: number;
        spendings: number;
        net: number;
      }>;
  }, [data]);

  const maxRevenue = useMemo(() => {
    if (!jarList.length) return 0;
    return Math.max(...jarList.map((j) => j.revenues));
  }, [jarList]);

  const donutSegments = useMemo(() => {
    if (!jarList.length || totalRevenues <= 0) return [];
    let acc = 0;
    return jarList.map((jar) => {
      const value = Math.max(0, jar.revenues);
      const part = value / totalRevenues;
      const length = part * DONUT_CIRC;
      const seg = {
        key: jar.key,
        color: jar.color,
        length,
        offset: DONUT_CIRC - acc,
      };
      acc += length;
      return seg;
    });
  }, [jarList, totalRevenues]);

  return (
    <main className="jars-page">
      <div className="page-header">
        <h2>Mes Jars</h2>
        <button
          type="button"
          className="secondary"
          onClick={load}
          disabled={loading}
        >
          {loading ? "⟳" : "Rafraîchir"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {/* Hero Section */}
      <section className="glass-card jars-hero">
        <div className="jars-hero-header">
          <p className="jars-hero-label">Total des revenus suivis</p>
          <p className="jars-hero-total">{formatMoney(totalRevenues)}</p>
        </div>

        <div className="jars-hero-body">
          {/* Donut Chart */}
          <div className="donut-wrapper">
            <svg
              className="donut-svg"
              viewBox="0 0 200 200"
              role="img"
              aria-label="Répartition des revenus par jarre"
            >
              <circle className="donut-bg" cx="100" cy="100" r={DONUT_RADIUS} />

              {donutSegments.map((seg) => (
                <circle
                  key={seg.key}
                  className={`donut-segment ${animate ? "donut-segment-animate" : ""}`}
                  cx="100"
                  cy="100"
                  r={DONUT_RADIUS}
                  stroke={seg.color}
                  strokeDasharray={`${seg.length} ${DONUT_CIRC}`}
                  strokeDashoffset={animate ? seg.offset - seg.length : DONUT_CIRC}
                />
              ))}

              <text x="100" y="94" textAnchor="middle" className="donut-center-label">
                TOTAL
              </text>
              <text x="100" y="118" textAnchor="middle" className="donut-center-value">
                {totalRevenues > 0 ? formatMoney(totalRevenues) : "0,00 €"}
              </text>
            </svg>
          </div>

          {/* Legend */}
          <ul className="donut-legend">
            {(Object.keys(JAR_META) as JarKey[]).map((key) => {
              const meta = JAR_META[key];
              const jar = jarList.find((j) => j.key === key);
              const part =
                totalRevenues > 0 && jar
                  ? (jar.revenues / totalRevenues) * 100
                  : data?.split?.[key]
                  ? data.split[key] * 100
                  : 0;
              return (
                <li key={key} className="donut-legend-item">
                  <span
                    className="donut-legend-dot"
                    style={{ backgroundColor: meta.color }}
                  />
                  <div className="donut-legend-text">
                    <span className="donut-legend-label">{meta.label}</span>
                    <span className="donut-legend-pct">{formatPct(part)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Cartes des Jarres - Style moderne avec couleurs */}
      <section className="jars-grid">
        {jarList.map((jar) => {
          const { key, label, short, color, bgColor, revenues, spendings, net } = jar;
          
          let pct = 0;
          if (totalRevenues > 0) {
            pct = (revenues / totalRevenues) * 100;
          } else if (data?.split && data.split[key] != null) {
            pct = data.split[key] * 100;
          }

          const progress = maxRevenue > 0 ? (revenues / maxRevenue) * 100 : 0;

          return (
            <article
              key={key}
              className="jar-card"
              style={{
                "--jar-color": color,
                "--jar-bg": bgColor,
              } as React.CSSProperties}
            >
              <header className="jar-card-header">
                <div>
                  <p className="jar-key">{short}</p>
                  <h3 className="jar-name">{label}</h3>
                </div>
                <div className="jar-pct">
                  {formatPct(pct)}
                  <span className="jar-pct-label">du revenu</span>
                </div>
              </header>

              <dl className="jar-stats">
                <div>
                  <dt>Alloué (revenus)</dt>
                  <dd>{formatMoney(revenues)}</dd>
                </div>
                <div>
                  <dt>Dépensé</dt>
                  <dd>{formatMoney(spendings)}</dd>
                </div>
                <div>
                  <dt>Solde disponible</dt>
                  <dd className={net < 0 ? "neg" : ""}>{formatMoney(net)}</dd>
                </div>
              </dl>

              <div className="jar-progress-row">
                <span>Utilisation</span>
                <span className="jar-progress-pct">
                  {revenues > 0
                    ? `${Math.round((spendings / revenues) * 100)} %`
                    : "—"}
                </span>
              </div>

              <div className="jar-bar-wrapper">
                <div
                  className={`jar-bar-fill ${spendings > revenues ? "neg" : ""}`}
                  style={{
                    width: `${Math.min((spendings / revenues) * 100 || 0, 100)}%`,
                  }}
                />
              </div>
            </article>
          );
        })}

        {!loading && !error && jarList.length === 0 && (
          <p style={{ 
            marginTop: "1rem", 
            color: "var(--text-muted)",
            gridColumn: "1 / -1",
            textAlign: "center",
            padding: "2rem"
          }}>
            Aucune donnée de jarres pour le moment.
          </p>
        )}
      </section>
    </main>
  );
}