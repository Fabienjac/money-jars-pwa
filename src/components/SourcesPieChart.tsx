// src/components/SourcesPieChart.tsx
import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

export interface SourceData {
  name: string;
  value: number;
}

interface SourcesPieChartProps {
  data: SourceData[];
  height?: number;
}

const COLORS = [
  "#007AFF", // Bleu
  "#34C759", // Vert
  "#FFD60A", // Jaune
  "#FF9500", // Orange
  "#AF52DE", // Violet
  "#5AC8FA", // Cyan
  "#FF3B30", // Rouge
  "#FF2D55", // Rose
];

export const SourcesPieChart: React.FC<SourcesPieChartProps> = ({
  data,
  height = 300,
}) => {
  // Trier par valeur décroissante
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  // Garder top 5 + regrouper les autres
  const topN = 5;
  const topData = sortedData.slice(0, topN);
  const others = sortedData.slice(topN);

  const chartData =
    others.length > 0
      ? [
          ...topData,
          {
            name: "Autres",
            value: others.reduce((sum, item) => sum + item.value, 0),
          },
        ]
      : topData;

  // Custom label
  const renderLabel = (entry: any) => {
    const percent = ((entry.value / entry.payload.total) * 100).toFixed(1);
    return `${entry.name} (${percent}%)`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            padding: "12px 16px",
            borderRadius: "12px",
            boxShadow: "var(--shadow-lg)",
            border: "1px solid var(--border-color)",
          }}
        >
          <p
            style={{
              margin: "0 0 6px",
              fontSize: "13px",
              fontWeight: "700",
              color: "var(--text-main)",
            }}
          >
            {data.name}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              fontWeight: "600",
              color: "var(--text-muted)",
            }}
          >
            {data.value.toFixed(2)} €
          </p>
        </div>
      );
    }
    return null;
  };

  // Calculer le total pour le label
  const total = chartData.reduce((sum, item) => sum + item.value, 0);
  const dataWithTotal = chartData.map((item) => ({ ...item, total }));

  return (
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
          margin: "0 0 20px",
          fontSize: "18px",
          fontWeight: "700",
          color: "var(--text-main)",
        }}
      >
        🥧 Répartition des revenus
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={dataWithTotal}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderLabel}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {dataWithTotal.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          marginTop: "16px",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          justifyContent: "center",
        }}
      >
        {chartData.map((item, index) => (
          <div
            key={item.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "var(--text-muted)",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "3px",
                backgroundColor: COLORS[index % COLORS.length],
              }}
            />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
