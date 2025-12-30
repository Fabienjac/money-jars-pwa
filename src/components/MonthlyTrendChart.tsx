// src/components/MonthlyTrendChart.tsx
import React from "react";
import { SearchSpendingResult } from "../types";

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
  console.log("📊 MonthlyTrendChart - Transactions reçues:", transactions?.length);

  // Vérifier que les transactions existent
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
          Aucune transaction à afficher
        </div>
        <div style={{ fontSize: "13px" }}>
          Ajoutez des transactions avec des tags pour voir le graphique
        </div>
      </div>
    );
  }

  // Grouper les transactions par mois
  const monthlyData = groupByMonth(transactions);
  
  console.log("📊 Données mensuelles:", monthlyData);

  if (monthlyData.length === 0) {
    return (
      <div style={{
        padding: "40px",
        textAlign: "center",
        color: "var(--text-muted)",
      }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
        <div style={{ fontSize: "16px", fontWeight: "600" }}>
          Impossible de grouper les transactions par mois
        </div>
      </div>
    );
  }

  // Dimensions du graphique
  const width = 800;
  const height = 400;
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Trouver min/max pour l'échelle
  const maxAmount = Math.max(...monthlyData.map(d => d.total));
  const minAmount = 0;

  // Échelle Y (montant)
  const scaleY = (value: number) => {
    const ratio = (value - minAmount) / (maxAmount - minAmount);
    return padding.top + chartHeight - (ratio * chartHeight);
  };

  // Échelle X (mois)
  const scaleX = (index: number) => {
    if (monthlyData.length === 1) {
      return padding.left + chartWidth / 2;
    }
    return padding.left + (index * chartWidth / (monthlyData.length - 1));
  };

  // Créer le path pour la ligne
  const linePath = monthlyData
    .map((data, index) => {
      const x = scaleX(index);
      const y = scaleY(data.total);
      return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  // Créer le path pour l'aire sous la ligne (gradient)
  const areaPath = `
    ${linePath}
    L ${scaleX(monthlyData.length - 1)} ${padding.top + chartHeight}
    L ${padding.left} ${padding.top + chartHeight}
    Z
  `;

  // Générer les graduations Y
  const yTicks = generateYTicks(minAmount, maxAmount, 5);

  // Formater les mois pour affichage
  const formatMonth = (monthStr: string) => {
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    } catch (e) {
      return monthStr;
    }
  };

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
          Tendance Mensuelle des Dépenses
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
              {tick.toLocaleString()}
            </text>
          </g>
        ))}

        {/* Grille verticale */}
        {monthlyData.map((data, i) => (
          <line
            key={i}
            x1={scaleX(i)}
            y1={padding.top}
            x2={scaleX(i)}
            y2={padding.top + chartHeight}
            stroke="#E5E5EA"
            strokeWidth="1"
            opacity="0.5"
          />
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
          Montant des Dépenses (€)
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
          Mois
        </text>

        {/* Gradient pour l'aire */}
        <defs>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#007AFF" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#007AFF" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Aire sous la ligne */}
        <path
          d={areaPath}
          fill="url(#areaGradient)"
        />

        {/* Ligne de tendance */}
        <path
          d={linePath}
          fill="none"
          stroke="#007AFF"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points sur la ligne */}
        {monthlyData.map((data, index) => {
          const x = scaleX(index);
          const y = scaleY(data.total);

          return (
            <g key={index}>
              {/* Point */}
              <circle
                cx={x}
                cy={y}
                r="5"
                fill="white"
                stroke="#007AFF"
                strokeWidth="3"
                style={{ cursor: "pointer" }}
              >
                <title>
                  {formatMonth(data.month)}: {data.total.toFixed(2)}€ ({data.count} transactions)
                </title>
              </circle>

              {/* Label mois */}
              <text
                x={x}
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
                x={x}
                y={padding.top + chartHeight + 35}
                textAnchor="middle"
                style={{
                  fontSize: "10px",
                  fill: "var(--text-muted)",
                }}
              >
                {formatMonth(data.month).split(' ')[1]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Légende sous le graphique */}
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
              padding: "8px 12px",
              borderRadius: "8px",
              background: "var(--bg-body)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              marginBottom: "2px",
            }}>
              {formatMonth(data.month)}
            </div>
            <div style={{
              fontSize: "16px",
              fontWeight: "700",
              color: "#007AFF",
            }}>
              {data.total.toFixed(2)}€
            </div>
            <div style={{
              fontSize: "10px",
              color: "var(--text-muted)",
              marginTop: "2px",
            }}>
              {data.count} transaction{data.count > 1 ? "s" : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Grouper les transactions par mois
 */
function groupByMonth(transactions: SearchSpendingResult[]): MonthlyData[] {
  const monthMap = new Map<string, { total: number; count: number }>();

  transactions.forEach(t => {
    try {
      const date = new Date(t.date);
      if (isNaN(date.getTime())) {
        console.warn("Date invalide:", t.date);
        return;
      }
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const current = monthMap.get(monthKey) || { total: 0, count: 0 };
      current.total += t.amount || 0;
      current.count += 1;

      monthMap.set(monthKey, current);
    } catch (e) {
      console.error("Erreur traitement transaction:", t, e);
    }
  });

  // Convertir en tableau et trier par date
  const result = Array.from(monthMap.entries())
    .map(([month, data]) => ({
      month,
      total: data.total,
      count: data.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return result;
}

/**
 * Générer les graduations de l'axe Y
 */
function generateYTicks(min: number, max: number, count: number): number[] {
  const range = max - min;
  const step = Math.ceil(range / count / 1000) * 1000; // Arrondir au millier
  
  if (step === 0) return [0, max];
  
  const ticks: number[] = [];

  for (let i = 0; i <= count; i++) {
    ticks.push(min + i * step);
  }

  return ticks;
}
