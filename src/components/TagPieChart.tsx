// src/components/TagPieChart.tsx
import React from "react";
import { TagStat } from "../types";

interface TagPieChartProps {
  stats: TagStat[];
}

export const TagPieChart: React.FC<TagPieChartProps> = ({ stats }) => {
  if (stats.length === 0) {
    return (
      <div style={{
        width: "100%",
        height: "400px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontSize: "14px",
      }}>
        Aucune donnée à afficher
      </div>
    );
  }

  // Grande taille pour prendre toute la largeur
  const size = 500;
  const radius = 180;
  const centerX = size / 2;
  const centerY = size / 2;
  const holeRadius = radius * 0.45; // Trou du donut

  // Calculer le total
  const total = stats.reduce((sum, stat) => sum + stat.totalAmount, 0);

  // Calculer les angles pour chaque segment
  let currentAngle = -90; // Commencer en haut (12h)
  
  const segments = stats.map(stat => {
    const angle = (stat.percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    const midAngle = startAngle + angle / 2;
    
    currentAngle = endAngle;
    
    return {
      ...stat,
      startAngle,
      endAngle,
      angle,
      midAngle,
    };
  });

  // Fonction pour convertir angle en coordonnées
  const polarToCartesian = (angle: number, r: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: centerX + r * Math.cos(rad),
      y: centerY + r * Math.sin(rad),
    };
  };

  // Créer le path d'un segment avec trou
  const createArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(startAngle, radius);
    const end = polarToCartesian(endAngle, radius);
    const startInner = polarToCartesian(startAngle, holeRadius);
    const endInner = polarToCartesian(endAngle, holeRadius);
    
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
    
    return `
      M ${start.x} ${start.y}
      A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}
      L ${endInner.x} ${endInner.y}
      A ${holeRadius} ${holeRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y}
      Z
    `;
  };

  return (
    <div>
      {/* Graphique pleine largeur */}
      <div style={{ 
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}>
        <svg
          id="tag-pie-chart"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ 
            width: "100%",
            height: "auto",
            maxWidth: `${size}px`,
          }}
        >
          {/* Segments du camembert */}
          {segments.map((segment, index) => {
            const path = createArc(segment.startAngle, segment.endAngle);
            
            // Position pour le label (à 65% du rayon)
            const labelRadius = radius * 0.65;
            const labelPos = polarToCartesian(segment.midAngle, labelRadius);
            
            return (
              <g key={index}>
                <path
                  d={path}
                  fill={segment.color}
                  stroke="white"
                  strokeWidth="3"
                  style={{ 
                    cursor: "pointer",
                    transition: "opacity 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "0.85";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                  }}
                >
                  <title>
                    {segment.tagName}: {segment.totalAmount.toFixed(2)}€ ({segment.percentage.toFixed(1)}%)
                  </title>
                </path>
                
                {/* Emoji si segment > 4% */}
                {segment.percentage > 4 && (
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    style={{
                      fontSize: "28px",
                      pointerEvents: "none",
                    }}
                  >
                    {segment.emoji}
                  </text>
                )}
                
                {/* Pourcentage si segment > 7% */}
                {segment.percentage > 7 && (
                  <text
                    x={labelPos.x}
                    y={labelPos.y + 30}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    style={{
                      fontSize: "18px",
                      fontWeight: "700",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                      fill: "white",
                      pointerEvents: "none",
                    }}
                  >
                    {segment.percentage.toFixed(1)}%
                  </text>
                )}
              </g>
            );
          })}

          {/* Cercle blanc au centre (trou du donut) */}
          <circle
            cx={centerX}
            cy={centerY}
            r={holeRadius}
            fill="white"
          />

          {/* Texte au centre */}
          <text
            x={centerX}
            y={centerY - 15}
            textAnchor="middle"
            style={{
              fontSize: "18px",
              fontWeight: "600",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
              fill: "var(--text-muted)",
            }}
          >
            Total
          </text>
          <text
            x={centerX}
            y={centerY + 25}
            textAnchor="middle"
            style={{
              fontSize: "36px",
              fontWeight: "700",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
              fill: "var(--text-main)",
            }}
          >
            {total.toFixed(0)}€
          </text>
        </svg>
      </div>

      {/* Légende - VISIBLE dans l'app */}
      <div
        id="tag-legend"
        style={{
          marginTop: "30px",
          display: "grid", // Visible maintenant
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
        }}
      >
        {stats.map((stat, index) => (
          <div
            key={index}
            className="tag-legend-item"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px",
              borderRadius: "8px",
              background: "var(--bg-body)",
              border: "1px solid var(--border-color)",
            }}
          >
            {/* Carré de couleur avec emoji */}
            <div
              className="tag-legend-color"
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "8px",
                background: stat.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                flexShrink: 0,
              }}
            >
              {stat.emoji}
            </div>
            
            {/* Infos */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="tag-legend-name"
                style={{
                  fontSize: "14px",
                  fontWeight: "700",
                  color: stat.color,
                  marginBottom: "3px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {stat.tagName}
              </div>
              <div
                className="tag-legend-stats"
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  fontWeight: "600",
                }}
              >
                {stat.percentage.toFixed(1)}% • {stat.totalAmount.toFixed(0)}€
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
