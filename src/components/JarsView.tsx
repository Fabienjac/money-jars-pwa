import React, { useEffect, useMemo, useState } from "react";
import { fetchTotals } from "../api";
import { TotalsResponse } from "../types";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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
  NEC: "#2563eb",
  FFA: "#16a34a",
  LTSS: "#7c3aed",
  PLAY: "#f97316",
  EDUC: "#e11d48",
  GIFT: "#0ea5e9",
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

  const totalRevenues = data?.totalRevenues ?? 0;

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
    typeof v === "number" && !isNaN(v) ? `${v.toFixed(2)} €` : "0.00 €";

  const formatPct = (v: number | undefined) =>
    typeof v === "number" && !isNaN(v) ? `${v.toFixed(1)} %` : "0.0 %";


  // --------------------------------------------
  // 🎯 1. Donut chart : répartition revenus par jarre
  // --------------------------------------------
  const pieData = useMemo(() => {
    if (!totalRevenues || !jarList.length) return [];
    return jarList.map((jar) => ({
      name: jar.label,
      value: jar.revenues || 0,
      color: jar.color,
    }));
  }, [jarList, totalRevenues]);


  // --------------------------------------------
  // 🎯 2. Bar chart mensuel : revenus + dépenses
  // --------------------------------------------
  const monthlyData = useMemo(() => {
    if (!data?.monthly) return [];

    return Object.entries(data.monthly).map(([month, m]) => ({
      month,
      revenues: m.revenues || 0,
      NEC: m.NEC || 0,
      PLAY: m.PLAY || 0,
      EDUC: m.EDUC || 0,
      FFA: m.FFA || 0,
      LTSS: m.LTSS || 0,
      GIFT: m.GIFT || 0,
    }));
  }, [data]);


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
          <strong>
            {totalRevenues > 0 ? formatMoney(totalRevenues) : "—"}
          </strong>
        </p>
      )}

      {/* ------------------------------------------------
         🎨 Donut Chart — Répartition des revenus
      ------------------------------------------------ */}
      {pieData.length > 0 && (
        <div className="chart-block">
          <h3>Répartition du revenu total</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ------------------------------------------------
         📊 Bar Chart — Revenus & Dépenses mensuelles
      ------------------------------------------------ */}
      {monthlyData.length > 0 && (
        <div className="chart-block">
          <h3>Revenus & dépenses par mois</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={monthlyData} margin={{ top: 20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />

              <Bar dataKey="revenues" stackId="a" fill="#0f172a" name="Revenus" />

              {/* Dépenses par jarre */}
              {(["NEC", "PLAY", "EDUC", "FFA", "LTSS", "GIFT"] as JarKey[]).map(
                (j) => (
                  <Bar
                    key={j}
                    dataKey={j}
                    stackId="b"
                    name={`${JAR_LABELS[j]} dépensé`}
                    fill={JAR_COLORS[j]}
                  />
                )
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ------------------------------------------------
          🟦 Cartes Jarres (ton bloc existant)
      ------------------------------------------------ */}
      <div className="jars-grid">
        {jarList.map((jar: any) => {
          const rev = jar.revenues || 0;
          const spend = jar.spendings || 0;
          const net = jar.net || 0;

          let pct = 0;
          if (totalRevenues > 0) {
            pct = (rev / totalRevenues) * 100;
          } else if (data?.split && data.split[jar.key] != null) {
            pct = data.split[jar.key as JarKey] * 100;
          } else if (typeof jar.revPct === "number") {
            pct = jar.revPct;
          }

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
                <span className="jar-pct">
                  {formatPct(pct)} <span>du revenu</span>
                </span>
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
