// src/components/JarBarChart.tsx
import React from "react";
import { SearchSpendingResult } from "../types";

import { currencySymbol as curSym, formatMoney, formatPercent } from "../baseCurrency";
import { t as tr, useLang, localeTag, JAR_LABELS as I18N_JARS } from "../i18n";
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
  console.log("📊 JarBarChart - Transactions reçues:", transactions?.length);

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

  // Grouper par mois et par jar
  const monthlyData = groupByMonthAndJar(transactions);

  console.log("📊 Données mensuelles par jar:", monthlyData);

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

  // Dimensions
  const width = 900;
  const height = 450;
  const padding = { top: 40, right: 200, bottom: 80, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Trouver le max pour l'échelle Y
  const maxAmount = Math.max(...monthlyData.map(d => d.total));

  // Échelle Y
  const scaleY = (value: number) => {
    const ratio = value / maxAmount;
    return padding.top + chartHeight - (ratio * chartHeight);
  };

  // Largeur des barres
  const barGroupWidth = chartWidth / monthlyData.length;
  const barWidth = Math.min(50, barGroupWidth * 0.8);

  // Générer graduations Y
  const yTicks = generateYTicks(0, maxAmount, 5);

  // Formater les mois
  const formatMonth = (monthStr: string) => {
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString(localeTag(), { month: 'short', year: 'numeric' });
    } catch (e) {
      return monthStr;
    }
  };

  // Obtenir les jars utilisés
  const usedJars = getUsedJars(monthlyData);

  return (
    <div style={{
      width: "100%",
      overflowX: "auto",
      padding: "20px 0",
    }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: "100%", height: "auto" }}
      >
        {/* Titre */}
        <text
          x={width / 2}
          y={20}
          textAnchor="middle"
          style={{
            fontSize: "18px",
            fontWeight: "700",
            fill: "var(--text-main)",
          }}
        >
          {tr("chart.jarByMonth")}
        </text>

        {/* Grille horizontale */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              y1={scaleY(tick)}
              x2={width - padding.right}
              y2={scaleY(tick)}
              stroke="#E5E5EA"
              strokeWidth="1"
            />
            <text
              x={padding.left - 10}
              y={scaleY(tick)}
              textAnchor="end"
              alignmentBaseline="middle"
              style={{
                fontSize: "12px",
                fill: "var(--text-muted)",
              }}
            >
              {formatMoney(tick, undefined, 0)}
            </text>
          </g>
        ))}

        {/* Axe X */}
        <line
          x1={padding.left}
          y1={padding.top + chartHeight}
          x2={width - padding.right}
          y2={padding.top + chartHeight}
          stroke="#8E8E93"
          strokeWidth="2"
        />

        {/* Axe Y */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + chartHeight}
          stroke="#8E8E93"
          strokeWidth="2"
        />

        {/* Label axe Y */}
        <text
          x={20}
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90, 20, ${height / 2})`}
          style={{
            fontSize: "14px",
            fontWeight: "600",
            fill: "var(--text-muted)",
          }}
        >
          {tr("chart.amount", { cur: curSym() })}
        </text>

        {/* Label axe X */}
        <text
          x={width / 2}
          y={height - 10}
          textAnchor="middle"
          style={{
            fontSize: "14px",
            fontWeight: "600",
            fill: "var(--text-muted)",
          }}
        >
          {tr("chart.month")}
        </text>

        {/* Barres empilées par mois */}
        {monthlyData.map((data, monthIndex) => {
          const x = padding.left + monthIndex * barGroupWidth + (barGroupWidth - barWidth) / 2;
          let yOffset = 0;

          return (
            <g key={monthIndex}>
              {/* Barres empilées pour chaque jar */}
              {usedJars.map((jar) => {
                const amount = data.jars[jar] || 0;
                if (amount === 0) return null;

                const barHeight = (amount / maxAmount) * chartHeight;
                const y = padding.top + chartHeight - yOffset - barHeight;

                const barElement = (
                  <rect
                    key={jar}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    fill={JAR_COLORS[jar] || "#999"}
                    stroke="white"
                    strokeWidth="1"
                    style={{ cursor: "pointer" }}
                  >
                    <title>
                      {formatMonth(data.month)} - {I18N_JARS[jar as keyof typeof I18N_JARS] || jar}: {formatMoney(amount, undefined, 2)}
                    </title>
                  </rect>
                );

                yOffset += barHeight;
                return barElement;
              })}

              {/* Label du mois */}
              <text
                x={x + barWidth / 2}
                y={padding.top + chartHeight + 20}
                textAnchor="middle"
                style={{
                  fontSize: "11px",
                  fill: "var(--text-muted)",
                }}
              >
                {formatMonth(data.month).split(' ')[0]}
              </text>
              <text
                x={x + barWidth / 2}
                y={padding.top + chartHeight + 35}
                textAnchor="middle"
                style={{
                  fontSize: "10px",
                  fill: "var(--text-muted)",
                }}
              >
                {formatMonth(data.month).split(' ')[1]}
              </text>

              {/* Total au-dessus de la barre */}
              <text
                x={x + barWidth / 2}
                y={scaleY(data.total) - 5}
                textAnchor="middle"
                style={{
                  fontSize: "10px",
                  fontWeight: "700",
                  fill: "var(--text-main)",
                }}
              >
                {formatMoney(data.total, undefined, 0)}
              </text>
            </g>
          );
        })}

        {/* Légende */}
        <g transform={`translate(${width - padding.right + 20}, ${padding.top})`}>
          <text
            x={0}
            y={0}
            style={{
              fontSize: "13px",
              fontWeight: "700",
              fill: "var(--text-main)",
            }}
          >
            {tr("chart.jars")}
          </text>
          {usedJars.map((jar, i) => (
            <g key={jar} transform={`translate(0, ${25 + i * 25})`}>
              <rect
                x={0}
                y={-10}
                width={15}
                height={15}
                fill={JAR_COLORS[jar] || "#999"}
                rx={3}
              />
              <text
                x={22}
                y={0}
                alignmentBaseline="middle"
                style={{
                  fontSize: "12px",
                  fill: "var(--text-main)",
                }}
              >
                {I18N_JARS[jar as keyof typeof I18N_JARS] || jar}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Stats sous le graphique */}
      <div style={{
        marginTop: "20px",
        display: "flex",
        flexWrap: "wrap",
        gap: "16px",
        justifyContent: "center",
      }}>
        {monthlyData.map((data, index) => (
          <div
            key={index}
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              background: "var(--bg-body)",
              border: "1px solid var(--border-color)",
              minWidth: "140px",
            }}
          >
            <div style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              marginBottom: "6px",
              fontWeight: "600",
            }}>
              {formatMonth(data.month)}
            </div>
            <div style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#FF3B30",
              marginBottom: "8px",
            }}>
              {formatMoney(data.total, undefined, 2)}
            </div>
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}>
              {usedJars.map(jar => {
                const amount = data.jars[jar] || 0;
                if (amount === 0) return null;
                return (
                  <div
                    key={jar}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "11px",
                    }}
                  >
                    <span style={{
                      color: JAR_COLORS[jar],
                      fontWeight: "600",
                    }}>
                      {jar}
                    </span>
                    <span style={{
                      color: "var(--text-muted)",
                    }}>
                      {formatMoney(amount, undefined, 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Grouper par mois et par jar
 */
function groupByMonthAndJar(transactions: SearchSpendingResult[]): MonthlyJarData[] {
  const monthMap = new Map<string, { [jarKey: string]: number }>();

  transactions.forEach(t => {
    try {
      const date = new Date(t.date);
      if (isNaN(date.getTime())) {
        console.warn("Date invalide:", t.date);
        return;
      }

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const jar = t.jar?.toUpperCase() || 'AUTRE';
      const amount = t.amount || 0;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {});
      }

      const monthData = monthMap.get(monthKey)!;
      monthData[jar] = (monthData[jar] || 0) + amount;
    } catch (e) {
      console.error("Erreur traitement transaction:", t, e);
    }
  });

  // Convertir en tableau
  const result = Array.from(monthMap.entries())
    .map(([month, jars]) => {
      const total = Object.values(jars).reduce((sum, val) => sum + val, 0);
      return {
        month,
        jars,
        total,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  return result;
}

/**
 * Obtenir les jars utilisés (triés par importance)
 */
function getUsedJars(monthlyData: MonthlyJarData[]): string[] {
  const jarTotals = new Map<string, number>();

  monthlyData.forEach(month => {
    Object.entries(month.jars).forEach(([jar, amount]) => {
      jarTotals.set(jar, (jarTotals.get(jar) || 0) + amount);
    });
  });

  // Trier par montant total décroissant
  return Array.from(jarTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([jar]) => jar);
}

/**
 * Générer graduations Y
 */
function generateYTicks(min: number, max: number, count: number): number[] {
  const range = max - min;
  const step = Math.ceil(range / count / 100) * 100; // Arrondir à 100

  if (step === 0) return [0, max];

  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) {
    ticks.push(min + i * step);
  }

  return ticks;
}
