// src/components/JarsView.tsx
import React, { useEffect, useMemo, useState } from "react";
import { fetchTotals } from "../api";
import { TotalsResponse } from "../types";

type JarKey = "NEC" | "FFA" | "LTSS" | "PLAY" | "EDUC" | "GIFT";

const JAR_META: Record<
  JarKey,
  { label: string; short: string; color: string }
> = {
  NEC: {
    label: "Nécessités",
    short: "NEC",
    color: "#2563eb",
  },
  FFA: {
    label: "Liberté financière",
    short: "FFA",
    color: "#16a34a",
  },
  LTSS: {
    label: "Épargne long terme",
    short: "LTSS",
    color: "#7c3aed",
  },
  PLAY: {
    label: "Fun / Play",
    short: "PLAY",
    color: "#f97316",
  },
  EDUC: {
    label: "Éducation",
    short: "EDUC",
    color: "#e11d48",
  },
  GIFT: {
    label: "Don / Gift",
    short: "GIFT",
    color: "#0ea5e9",
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
      // on déclenche l’animation juste après le rendu
      setTimeout(() => setAnimate(true), 40);
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
      .filter(Boolean) as Array<
      {
        key: JarKey;
        label: string;
        short: string;
        color: string;
        revenues: number;
        spendings: number;
        net: number;
      }
    >;
  }, [data]);

  const maxNetAbs = useMemo(() => {
    if (!jarList.length) return 0;
    return Math.max(...jarList.map((j) => Math.abs(j.net)));
  }, [jarList]);

  // Données pour le donut (répartition par jarre)
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

  // Barres : pour l’instant “par jarre” (alloc / dépensé),
  // qu’on branchera plus tard sur de vraies données mensuelles.
  const barData = useMemo(() => {
    if (!jarList.length) return [];
    const maxAllocated = Math.max(...jarList.map((j) => j.revenues || 0)) || 1;
    return jarList.map((j) => ({
      key: j.key,
      label: j.label,
      color: j.color,
      allocated: j.revenues,
      spent: j.spendings,
      allocatedPct: (j.revenues / maxAllocated) * 100,
      spentPct: (j.spendings / maxAllocated) * 100,
    }));
  }, [jarList]);

  return (
    <main className="container jars-page">
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

      {/* Bloc principal : total + donut + légende */}
      <section className="glass-card jars-hero">
        <div className="jars-hero-header">
          <p className="jars-hero-label">Total des revenus suivis :</p>
          <p className="jars-hero-total">
            {totalRevenues > 0 ? formatMoney(totalRevenues) : "0,00 €"}
          </p>
        </div>

        <div className="jars-hero-body">
          <div className="donut-wrapper">
            <svg
              className="donut-svg"
              viewBox="0 0 200 200"
              role="img"
              aria-label="Répartition des revenus par jarre"
            >
              {/* cercle de fond */}
              <circle
                className="donut-bg"
                cx="100"
                cy="100"
                r={DONUT_RADIUS}
              />

              {/* segments */}
              {donutSegments.map((seg) => (
                <circle
                  key={seg.key}
                  className={`donut-segment ${
                    animate ? "donut-segment-animate" : ""
                  }`}
                  cx="100"
                  cy="100"
                  r={DONUT_RADIUS}
                  stroke={seg.color}
                  strokeDasharray={`${seg.length} ${DONUT_CIRC}`}
                  strokeDashoffset={
                    animate ? seg.offset - seg.length : DONUT_CIRC
                  }
                />
              ))}

              {/* centre : libellé + total */}
              <text
                x="100"
                y="94"
                textAnchor="middle"
                className="donut-center-label"
              >
                Total
              </text>
              <text
                x="100"
                y="118"
                textAnchor="middle"
                className="donut-center-value"
              >
                {totalRevenues > 0 ? formatMoney(totalRevenues) : "0,00 €"}
              </text>
            </svg>
          </div>

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
                    <span className="donut-legend-pct">
                      {formatPct(part)} du revenu
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Graphique barres (alloc / dépensé) */}
      {barData.length > 0 && (
        <section className="glass-card jars-bars">
          <header className="jars-bars-header">
            <h3>Vue synthétique par jarre</h3>
            <p>Montants cumulés alloués vs dépensés.</p>
          </header>

          <div className="jars-bars-grid">
            {barData.map((row) => (
              <div key={row.key} className="jars-bar-row">
                <div className="jars-bar-label">{row.label}</div>
                <div className="jars-bar-tracks">
                  <div className="jars-bar-track">
                    <div
                      className="jars-bar-fill jars-bar-fill-allocated"
                      style={{
                        width: `${Math.min(row.allocatedPct, 100)}%`,
                        backgroundColor: row.color,
                      }}
                    />
                  </div>
                  <div className="jars-bar-track jars-bar-track-spent">
                    <div
                      className="jars-bar-fill jars-bar-fill-spent"
                      style={{
                        width: `${Math.min(row.spentPct, 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="jars-bar-values">
                  <span>{formatMoney(row.allocated)}</span>
                  <span>Dépensé : {formatMoney(row.spent)}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="jars-bars-hint">
            On pourra ensuite brancher ce bloc sur une vraie vue mensuelle à
            partir de l’historique.
          </p>
        </section>
      )}

      {/* Cartes détaillées jarre par jarre */}
      <section className="jars-grid">
        {jarList.map((jar) => {
          const { key, label, short, color, revenues, spendings, net } = jar;
          let pct = 0;
          if (totalRevenues > 0) {
            pct = (revenues / totalRevenues) * 100;
          } else if (data?.split && data.split[key] != null) {
            pct = data.split[key] * 100;
          }

          const progress =
            maxNetAbs > 0 ? Math.max(0, (Math.abs(net) / maxNetAbs) * 100) : 0;

          return (
            <article
              key={key}
              className="jar-card glass-card"
              style={{
                borderTopColor: color,
              }}
            >
              <header className="jar-card-header">
                <div>
                  <h3 className="jar-name">{label}</h3>
                  <p className="jar-key">{short}</p>
                </div>
                <div className="jar-pct">
                  {formatPct(pct)}{" "}
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
                  <dt>Solde</dt>
                  <dd className={net < 0 ? "neg" : ""}>
                    {formatMoney(net)}
                  </dd>
                </div>
              </dl>

              <div className="jar-progress-row">
                <span>Solde vs alloué</span>
                <span className="jar-progress-pct">
                  {revenues > 0
                    ? `${Math.round((net / revenues) * 100)} %`
                    : "—"}
                </span>
              </div>

              <div className="jar-bar-wrapper">
                <div className="jar-bar-bg" />
                <div
                  className={`jar-bar-fill ${net < 0 ? "neg" : ""}`}
                  style={{
                    width: `${Math.min(progress, 100)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </article>
          );
        })}

        {!loading && !error && jarList.length === 0 && (
          <p style={{ marginTop: "1rem", color: "#777" }}>
            Aucune donnée de jarres pour le moment.
          </p>
        )}
      </section>
    </main>
  );
}
