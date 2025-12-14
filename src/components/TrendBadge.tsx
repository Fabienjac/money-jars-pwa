// src/components/TrendBadge.tsx
import React from "react";

interface TrendBadgeProps {
  current: number;
  previous: number;
  label?: string;
  showValue?: boolean;
}

export const TrendBadge: React.FC<TrendBadgeProps> = ({
  current,
  previous,
  label,
  showValue = true,
}) => {
  // Calculer la différence en %
  const percentChange =
    previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;

  const isPositive = percentChange > 0;
  const isNeutral = Math.abs(percentChange) < 0.1;

  // Couleurs
  const bgColor = isNeutral
    ? "rgba(128, 128, 128, 0.1)"
    : isPositive
    ? "rgba(52, 199, 89, 0.1)"
    : "rgba(239, 68, 68, 0.1)";

  const textColor = isNeutral
    ? "#6e6e73"
    : isPositive
    ? "#16a34a"
    : "#ef4444";

  const borderColor = isNeutral
    ? "rgba(128, 128, 128, 0.2)"
    : isPositive
    ? "rgba(52, 199, 89, 0.3)"
    : "rgba(239, 68, 68, 0.3)";

  // Icône flèche
  const arrow = isNeutral ? "→" : isPositive ? "↗" : "↘";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        borderRadius: "12px",
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        fontSize: "13px",
        fontWeight: "600",
        color: textColor,
      }}
    >
      <span style={{ fontSize: "16px", lineHeight: 1 }}>{arrow}</span>
      {showValue && (
        <span>
          {isPositive && "+"}
          {percentChange.toFixed(1)}%
        </span>
      )}
      {label && <span style={{ opacity: 0.8 }}>{label}</span>}
    </div>
  );
};

// Version mini pour les cartes de jarres
export const TrendBadgeMini: React.FC<TrendBadgeProps> = ({
  current,
  previous,
}) => {
  const percentChange =
    previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;

  const isPositive = percentChange > 0;
  const isNeutral = Math.abs(percentChange) < 0.1;

  if (isNeutral) return null;

  const arrow = isPositive ? "↗" : "↘";
  const color = isPositive ? "#16a34a" : "#ef4444";

  return (
    <div
      style={{
        position: "absolute",
        top: "12px",
        right: "12px",
        display: "flex",
        alignItems: "center",
        gap: "3px",
        padding: "4px 8px",
        borderRadius: "8px",
        backgroundColor: isPositive
          ? "rgba(52, 199, 89, 0.15)"
          : "rgba(239, 68, 68, 0.15)",
        fontSize: "11px",
        fontWeight: "700",
        color: color,
        backdropFilter: "blur(10px)",
      }}
    >
      <span>{arrow}</span>
      <span>
        {isPositive && "+"}
        {Math.abs(percentChange).toFixed(0)}%
      </span>
    </div>
  );
};
