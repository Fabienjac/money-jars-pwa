// src/components/MonthlyTrendChart.tsx
import React from "react";
import { SearchSpendingResult } from "../types";

import { formatMoney } from "../baseCurrency";
import { t as tr, useLang, localeTag } from "../i18n";
import { axisScale, fillMonthKeys, labelStep, monthKeyOf, ratioOf } from "../monthlyChart";

interface MonthlyTrendChartProps {
  transactions: SearchSpendingResult[];
}

interface MonthlyData {
  month: string;
  total: number;
  count: number;
}

export const MonthlyTrendChart: React.FC<MonthlyTrendChartProps> = ({
  transactions,
}) => {
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
          {tr("chart.addTagged")}
        </div>
      </div>
    );
  }

  const monthlyData = groupByMonth(transactions);

  if (monthlyData.length === 0) {
    return (
      <div style={{
        padding: "40px",
        textAlign: "center",
        color: "var(--text-muted)",
      }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
        <div style={{ fontSize: "16px", fontWeight: "600" }}>
          {tr("chart.cannotGroupMonth")}
        </div>
      </div>
    );
  }

  // Dimensions petites : sur un téléphone le graphique est réduit à la largeur de l'écran, les textes restent lisibles.
  const width = 480;
  const height = 270;
  const padding = { top: 34, right: 22, bottom: 46, left: 62 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Échelle Y : plafonnée si un mois dépasse très nettement les autres
  const scale = axisScale(monthlyData.map((d) => d.total));
  const yTicks = scale.ticks;
  const scaleY = (value: number) => padding.top + chartHeight - ratioOf(value, scale.max) * chartHeight;

  const scaleX = (index: number) => {
    if (monthlyData.length === 1) return padding.left + chartWidth / 2;
    return padding.left + (index * chartWidth / (monthlyData.length - 1));
  };

  const linePath = monthlyData
    .map((data, index) => `${index === 0 ? "M" : "L"} ${scaleX(index)} ${scaleY(data.total)}`)
    .join(" ");
  const areaPath = `${linePath} L ${scaleX(monthlyData.length - 1)} ${padding.top + chartHeight} L ${scaleX(0)} ${padding.top + chartHeight} Z`;

  const formatMonth = (monthStr: string) => {
    try {
      const [year, month] = monthStr.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString(localeTag(), { month: "short", year: "numeric" });
    } catch (e) {
      return monthStr;
    }
  };
  const step = labelStep(monthlyData.length);
  const countLabel = (n: number) => tr(n > 1 ? "stats.txN" : "stats.tx1", { n });
  const grandTotal = monthlyData.reduce((sum, d) => sum + d.total, 0);
  const grandCount = monthlyData.reduce((sum, d) => sum + d.count, 0);
  const cappedMonths = scale.overflow
    .map((i) => `${formatMonth(monthlyData[i].month)} (${formatMoney(monthlyData[i].total, undefined, 0)})`)
    .join(", ");

  return (
    <div className="mchart">
      <h4 className="mchart-title">{tr("chart.trendTitle")}</h4>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={tr("chart.trendTitle")}
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
        <line x1={padding.left} y1={padding.top + chartHeight} x2={width - padding.right} y2={padding.top + chartHeight} stroke="var(--text-light)" strokeWidth="1.5" />

        <defs>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#007AFF" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#007AFF" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGradient)" />
        <path d={linePath} fill="none" stroke="#007AFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {monthlyData.map((data, index) => {
          const x = scaleX(index);
          const y = scaleY(data.total);
          const over = scale.overflow.includes(index);
          const [mShort, mYear] = formatMonth(data.month).split(" ");
          const showLabel = index % step === 0;
          const showYear = index === 0 || data.month.endsWith("-01");
          return (
            <g key={data.month}>
              <circle cx={x} cy={y} r={data.count === 0 ? 3 : 4.5} fill="var(--bg-card)" stroke={data.count === 0 ? "var(--text-light)" : "#007AFF"} strokeWidth="2.5">
                <title>{formatMonth(data.month)} : {formatMoney(data.total, undefined, 2)} ({countLabel(data.count)})</title>
              </circle>
              {over && (
                <>
                  {/* Cassure : l'axe est coupé ici, la vraie valeur est écrite au-dessus */}
                  <path d={`M ${x - 9} ${y + 12} l 6 -4 l 6 4 l 6 -4`} fill="none" stroke="var(--bg-card)" strokeWidth="4" />
                  <path d={`M ${x - 9} ${y + 12} l 6 -4 l 6 4 l 6 -4`} fill="none" stroke="#007AFF" strokeWidth="1.5" />
                  <text
                    x={Math.min(Math.max(x, padding.left + 24), width - padding.right - 24)}
                    y={y - 10}
                    textAnchor="middle"
                    style={{ fontSize: "11px", fontWeight: 700, fill: "var(--text-main)" }}
                  >
                    {formatMoney(data.total, undefined, 0)}
                  </text>
                </>
              )}
              {showLabel && (
                <>
                  <text x={x} y={padding.top + chartHeight + 17} textAnchor="middle" style={{ fontSize: "11px", fill: "var(--text-muted)" }}>{mShort}</text>
                  {showYear && (
                    <text x={x} y={padding.top + chartHeight + 31} textAnchor="middle" style={{ fontSize: "10px", fill: "var(--text-light)" }}>{mYear}</text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>

      {scale.capped && (
        <p className="mchart-note">{tr("chart.capped", { months: cappedMonths })}</p>
      )}

      <table className="mchart-table">
        <thead>
          <tr>
            <th>{tr("chart.month")}</th>
            <th className="num">{tr("chart.total")}</th>
            <th className="num">{tr("chart.colTx")}</th>
          </tr>
        </thead>
        <tbody>
          {monthlyData.map((data) => (
            <tr key={data.month} className={data.count === 0 ? "empty" : undefined}>
              <td>{formatMonth(data.month)}</td>
              <td className="num strong">{data.count === 0 ? "—" : formatMoney(data.total, undefined, 2)}</td>
              <td className="num">{data.count === 0 ? "—" : data.count}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>{tr("chart.total")}</td>
            <td className="num strong">{formatMoney(grandTotal, undefined, 2)}</td>
            <td className="num">{grandCount}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

/**
 * Grouper les transactions par mois, en gardant les mois sans saisie (total 0).
 */
function groupByMonth(transactions: SearchSpendingResult[]): MonthlyData[] {
  const monthMap = new Map<string, { total: number; count: number }>();

  transactions.forEach(t => {
    const date = new Date(t.date);
    if (isNaN(date.getTime())) return;
    const monthKey = monthKeyOf(date);
    const current = monthMap.get(monthKey) || { total: 0, count: 0 };
    current.total += t.amount || 0;
    current.count += 1;
    monthMap.set(monthKey, current);
  });

  return fillMonthKeys(Array.from(monthMap.keys())).map((month) => ({
    month,
    total: monthMap.get(month)?.total ?? 0,
    count: monthMap.get(month)?.count ?? 0,
  }));
}
