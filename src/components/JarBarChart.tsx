// src/components/JarBarChart.tsx
import React from "react";
import { SearchSpendingResult } from "../types";

import { formatMoney } from "../baseCurrency";
import { t as tr, useLang, localeTag, JAR_LABELS as I18N_JARS } from "../i18n";
import { axisScale, fillMonthKeys, labelStep, monthKeyOf, ratioOf } from "../monthlyChart";

interface JarBarChartProps {
  transactions: SearchSpendingResult[];
}

interface MonthlyJarData {
  month: string;
  jars: {
    [jarKey: string]: number;
  };
  total: number;
}

const JAR_COLORS: { [key: string]: string } = {
  NEC: "#007AFF",    // Bleu
  FFA: "#34C759",    // Vert
  LTSS: "#FFD60A",   // Jaune
  PLAY: "#FF9500",   // Orange
  EDUC: "#AF52DE",   // Violet
  GIFT: "#5AC8FA",   // Cyan
};

export const JarBarChart: React.FC<JarBarChartProps> = ({ transactions }) => {
  useLang();

  if (!transactions || transactions.length === 0) {
    return (
      <div style={{
        padding: "40px",
        textAlign: "center",
        color: "var(--text-muted)",
        border: "2px dashed var(--border-color)",
        borderRadius: "12px",
      }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
        <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>
          {tr("chart.noTx")}
        </div>
        <div style={{ fontSize: "13px" }}>
          {tr("chart.addToSee")}
        </div>
      </div>
    );
  }

  const monthlyData = groupByMonthAndJar(transactions);

  if (monthlyData.length === 0) {
    return (
      <div style={{
        padding: "40px",
        textAlign: "center",
        color: "var(--text-muted)",
      }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
        <div style={{ fontSize: "16px", fontWeight: "600" }}>
          {tr("chart.cannotGroup")}
        </div>
      </div>
    );
  }

  // Dimensions petites : sur un téléphone le graphique est réduit à la largeur de l'écran, les textes restent lisibles.
  const width = 480;
  const height = 290;
  const padding = { top: 34, right: 14, bottom: 46, left: 62 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const baseY = padding.top + chartHeight;

  // Échelle Y : plafonnée si un mois dépasse très nettement les autres
  const scale = axisScale(monthlyData.map((d) => d.total));
  const yTicks = scale.ticks;
  const scaleY = (value: number) => baseY - ratioOf(value, scale.max) * chartHeight;

  const barGroupWidth = chartWidth / monthlyData.length;
  const barWidth = Math.min(40, barGroupWidth * 0.72);
  const step = labelStep(monthlyData.length);
  const showTotals = monthlyData.length <= 12;

  const formatMonth = (monthStr: string) => {
    try {
      const [year, month] = monthStr.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString(localeTag(), { month: "short", year: "numeric" });
    } catch (e) {
      return monthStr;
    }
  };
  const jarName = (jar: string) => I18N_JARS[jar as keyof typeof I18N_JARS] || jar;

  const usedJars = getUsedJars(monthlyData);
  const grandTotal = monthlyData.reduce((sum, d) => sum + d.total, 0);
  const cappedMonths = scale.overflow
    .map((i) => `${formatMonth(monthlyData[i].month)} (${formatMoney(monthlyData[i].total, undefined, 0)})`)
    .join(", ");

  return (
    <div className="mchart">
      <h4 className="mchart-title">{tr("chart.jarByMonth")}</h4>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={tr("chart.jarByMonth")}
        style={{ maxWidth: width * 1.6, height: "auto", display: "block", margin: "0 auto" }}
      >
        {/* Grille horizontale et graduations */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={padding.left} y1={scaleY(tick)} x2={width - padding.right} y2={scaleY(tick)} stroke="var(--border-color)" strokeWidth="1" />
            <text x={padding.left - 8} y={scaleY(tick)} textAnchor="end" dominantBaseline="middle" style={{ fontSize: "11px", fill: "var(--text-muted)" }}>
              {formatMoney(tick, undefined, 0)}
            </text>
          </g>
        ))}

        {/* Axe X */}
        <line x1={padding.left} y1={baseY} x2={width - padding.right} y2={baseY} stroke="var(--text-light)" strokeWidth="1.5" />

        {/* Barres empilées par mois */}
        {monthlyData.map((data, monthIndex) => {
          const x = padding.left + monthIndex * barGroupWidth + (barGroupWidth - barWidth) / 2;
          const cx = x + barWidth / 2;
          const over = scale.overflow.includes(monthIndex);
          const [mShort, mYear] = formatMonth(data.month).split(" ");
          const showLabel = monthIndex % step === 0;
          const showYear = monthIndex === 0 || data.month.endsWith("-01");
          let cumulative = 0;

          return (
            <g key={data.month}>
              {usedJars.map((jar) => {
                const amount = data.jars[jar] || 0;
                if (amount <= 0) return null;
                const yBottom = scaleY(cumulative);
                cumulative += amount;
                const yTop = scaleY(cumulative);   // coupé au haut de l'axe
                if (yBottom - yTop <= 0.2) return null;
                return (
                  <rect key={jar} x={x} y={yTop} width={barWidth} height={yBottom - yTop} fill={JAR_COLORS[jar] || "#999"} stroke="var(--bg-card)" strokeWidth="1">
                    <title>{formatMonth(data.month)} - {jarName(jar)} : {formatMoney(amount, undefined, 2)}</title>
                  </rect>
                );
              })}

              {over && (
                /* Cassure : la barre est coupée ici, le vrai total est écrit au-dessus */
                <path
                  d={`M ${x - 3} ${padding.top + 14} l ${barWidth / 4 + 1} -5 l ${barWidth / 4 + 1} 5 l ${barWidth / 4 + 1} -5 l ${barWidth / 4 + 1} 5`}
                  fill="none"
                  stroke="var(--bg-card)"
                  strokeWidth="4"
                />
              )}

              {(over || (showTotals && data.total > 0)) && (
                <text
                  x={cx}
                  y={scaleY(data.total) - 5}
                  textAnchor="middle"
                  style={{ fontSize: "10px", fontWeight: 700, fill: "var(--text-main)" }}
                >
                  {formatMoney(data.total, undefined, 0)}
                </text>
              )}

              {showLabel && (
                <>
                  <text x={cx} y={baseY + 17} textAnchor="middle" style={{ fontSize: "11px", fill: "var(--text-muted)" }}>{mShort}</text>
                  {showYear && (
                    <text x={cx} y={baseY + 31} textAnchor="middle" style={{ fontSize: "10px", fill: "var(--text-light)" }}>{mYear}</text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Légende sous le graphique */}
      <div className="mchart-legend">
        {usedJars.map((jar) => (
          <span key={jar} className="mchart-legend-item">
            <span className="mchart-swatch" style={{ background: JAR_COLORS[jar] || "#999" }} />
            {jarName(jar)}
          </span>
        ))}
      </div>

      {scale.capped && (
        <p className="mchart-note">{tr("chart.capped", { months: cappedMonths })}</p>
      )}

      <table className="mchart-table mchart-table--jars">
        <thead>
          <tr>
            <th>{tr("chart.month")}</th>
            <th className="num">{tr("chart.total")}</th>
          </tr>
        </thead>
        <tbody>
          {monthlyData.map((data) => {
            const parts = usedJars.filter((j) => (data.jars[j] || 0) > 0);
            return (
              <React.Fragment key={data.month}>
                <tr className={`mchart-main${data.total === 0 ? " empty" : ""}${parts.length > 0 ? " has-sub" : ""}`}>
                  <td>{formatMonth(data.month)}</td>
                  <td className="num strong">{data.total === 0 ? "—" : formatMoney(data.total, undefined, 2)}</td>
                </tr>
                {parts.length > 0 && (
                  <tr className="mchart-sub">
                    <td colSpan={2}>
                      {parts.map((jar) => (
                        <span key={jar} className="mchart-chip">
                          <b style={{ color: JAR_COLORS[jar] }}>{jar}</b> {formatMoney(data.jars[jar], undefined, 0)}
                        </span>
                      ))}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="mchart-main has-sub">
            <td>{tr("chart.total")}</td>
            <td className="num strong">{formatMoney(grandTotal, undefined, 2)}</td>
          </tr>
          <tr className="mchart-sub">
            <td colSpan={2}>
              {usedJars.map((jar) => (
                <span key={jar} className="mchart-chip">
                  <b style={{ color: JAR_COLORS[jar] }}>{jar}</b> {formatMoney(monthlyData.reduce((s, d) => s + (d.jars[jar] || 0), 0), undefined, 0)}
                </span>
              ))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

/**
 * Grouper par mois et par jarre, en gardant les mois sans saisie (total 0).
 */
function groupByMonthAndJar(transactions: SearchSpendingResult[]): MonthlyJarData[] {
  const monthMap = new Map<string, { [jarKey: string]: number }>();

  transactions.forEach(t => {
    const date = new Date(t.date);
    if (isNaN(date.getTime())) return;
    const monthKey = monthKeyOf(date);
    const jar = t.jar?.toUpperCase() || "AUTRE";
    const monthData = monthMap.get(monthKey) ?? {};
    monthData[jar] = (monthData[jar] || 0) + (t.amount || 0);
    monthMap.set(monthKey, monthData);
  });

  return fillMonthKeys(Array.from(monthMap.keys())).map((month) => {
    const jars = monthMap.get(month) ?? {};
    return { month, jars, total: Object.values(jars).reduce((sum, val) => sum + val, 0) };
  });
}

/**
 * Obtenir les jarres utilisées (triées par importance)
 */
function getUsedJars(monthlyData: MonthlyJarData[]): string[] {
  const jarTotals = new Map<string, number>();

  monthlyData.forEach(month => {
    Object.entries(month.jars).forEach(([jar, amount]) => {
      jarTotals.set(jar, (jarTotals.get(jar) || 0) + amount);
    });
  });

  return Array.from(jarTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([jar]) => jar);
}
