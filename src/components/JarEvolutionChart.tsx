// src/components/JarEvolutionChart.tsx
import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { JarKey } from "../types";

export interface JarEvolutionData {
  month: string; // "Jan 2025"
  NEC?: number;
  FFA?: number;
  LTSS?: number;
  PLAY?: number;
  EDUC?: number;
  GIFT?: number;
}

interface JarEvolutionChartProps {
  data: JarEvolutionData[];
  height?: number;
  selectedJars?: JarKey[]; // Filtrer les jarres à afficher
}

const JAR_COLORS: Record<JarKey, string> = {
  NEC: "#007AFF",
  FFA: "#34C759",
  LTSS: "#FFD60A",
  PLAY: "#FF9500",
  EDUC: "#AF52DE",
  GIFT: "#5AC8FA",
};

export const JarEvolutionChart: React.FC<JarEvolutionChartProps> = ({
  data,
  height = 300,
  selectedJars = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"],
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
            maxWidth: "200px",
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
            {payload.map((entry: any, index: number) => (
              <div
                key={index}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "3px",
                    backgroundColor: entry.color,
                  }}
                />
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                  }}
                >
                  {entry.name}:{" "}
                  <strong style={{ color: "var(--text-main)" }}>
                    {entry.value.toFixed(2)} €
                  </strong>
                </span>
              </div>
            ))}
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
        📈 Évolution des jarres
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
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
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              paddingTop: "16px",
              fontSize: "13px",
              fontWeight: "600",
            }}
          />
          {selectedJars.includes("NEC") && (
            <Line
              type="monotone"
              dataKey="NEC"
              stroke={JAR_COLORS.NEC}
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
          {selectedJars.includes("FFA") && (
            <Line
              type="monotone"
              dataKey="FFA"
              stroke={JAR_COLORS.FFA}
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
          {selectedJars.includes("LTSS") && (
            <Line
              type="monotone"
              dataKey="LTSS"
              stroke={JAR_COLORS.LTSS}
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
          {selectedJars.includes("PLAY") && (
            <Line
              type="monotone"
              dataKey="PLAY"
              stroke={JAR_COLORS.PLAY}
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
          {selectedJars.includes("EDUC") && (
            <Line
              type="monotone"
              dataKey="EDUC"
              stroke={JAR_COLORS.EDUC}
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
          {selectedJars.includes("GIFT") && (
            <Line
              type="monotone"
              dataKey="GIFT"
              stroke={JAR_COLORS.GIFT}
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
