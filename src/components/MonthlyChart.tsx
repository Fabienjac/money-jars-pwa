// src/components/MonthlyChart.tsx
import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface MonthlyData {
  month: string; // "Jan 2025"
  revenues: number;
  spendings: number;
}

interface MonthlyChartProps {
  data: MonthlyData[];
  height?: number;
}

export const MonthlyChart: React.FC<MonthlyChartProps> = ({
  data,
  height = 300,
}) => {
  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
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
              margin: "0 0 8px",
              fontSize: "13px",
              fontWeight: "700",
              color: "var(--text-main)",
            }}
          >
            {payload[0].payload.month}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "3px",
                  backgroundColor: "#16a34a",
                }}
              />
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                Revenus:{" "}
                <strong style={{ color: "var(--text-main)" }}>
                  {payload[0].value.toFixed(2)} €
                </strong>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "3px",
                  backgroundColor: "#ef4444",
                }}
              />
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                Dépenses:{" "}
                <strong style={{ color: "var(--text-main)" }}>
                  {payload[1].value.toFixed(2)} €
                </strong>
              </span>
            </div>
            <div
              style={{
                marginTop: "6px",
                paddingTop: "6px",
                borderTop: "1px solid var(--border-color)",
                fontSize: "12px",
                fontWeight: "600",
                color: "var(--text-main)",
              }}
            >
              Solde: {(payload[0].value - payload[1].value).toFixed(2)} €
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

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
        📊 Évolution mensuelle
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
          <XAxis
            dataKey="month"
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            axisLine={{ stroke: "var(--border-color)" }}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            axisLine={{ stroke: "var(--border-color)" }}
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
          <Legend
            wrapperStyle={{
              paddingTop: "16px",
              fontSize: "13px",
              fontWeight: "600",
            }}
          />
          <Bar
            dataKey="revenues"
            fill="#16a34a"
            name="Revenus"
            radius={[8, 8, 0, 0]}
          />
          <Bar
            dataKey="spendings"
            fill="#ef4444"
            name="Dépenses"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
