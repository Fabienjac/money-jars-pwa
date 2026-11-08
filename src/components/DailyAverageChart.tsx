// Courbe « dépense moyenne par jour » (glissante sur 30 jours, par semaine) avec une 2e courbe optionnelle pour une
// étiquette (alimentation). Les points viennent de rollingAverageSeries (src/lifestyle.ts).
import React from "react";
import { currencySymbol as curSym, formatMoney, formatPercent } from "../baseCurrency";
import { monthShort } from "../i18n";
import type { RollingPoint } from "../lifestyle";

const toPoints = (pts: readonly RollingPoint[]) =>
  pts.map((p) => {
    const [y, m, d] = p.date.split("-").map(Number);
    return { avg: p.avg, date: new Date(y, m - 1, d) };
  });

const DailyAverageChart: React.FC<{ points: readonly RollingPoint[]; overlay?: readonly RollingPoint[] }> = ({ points, overlay = [] }) => {
  const chartPoints = toPoints(points);
  const tagOverlayPoints = toPoints(overlay);

  if (chartPoints.length < 2) return null;

  const W = 340, H = 130;
  const PL = 36, PR = 10, PT = 8, PB = 22;
  const CW = W - PL - PR;
  const CH = H - PT - PB;

  // Combiner les deux séries pour déterminer min/max de l'axe Y
  const allValues = [
    ...chartPoints.map(p => p.avg),
    ...(tagOverlayPoints.length > 0 ? tagOverlayPoints.map(p => p.avg) : []),
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;
  const yMin = Math.max(0, minVal - range * 0.1);
  const yMax = maxVal + range * 0.1;
  const yRange = yMax - yMin || 1;

  const toX = (i: number) => PL + (i / (chartPoints.length - 1)) * CW;
  const toY = (v: number) => PT + CH - ((v - yMin) / yRange) * CH;

  // Pour l'overlay, les points peuvent avoir un nombre différent — on les aligne sur l'axe X du chart principal
  const toXOverlay = tagOverlayPoints.length > 1
    ? (i: number) => PL + (i / (tagOverlayPoints.length - 1)) * CW
    : toX;

  const linePath = chartPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.avg).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${toX(chartPoints.length - 1).toFixed(1)} ${(PT + CH).toFixed(1)} L ${toX(0).toFixed(1)} ${(PT + CH).toFixed(1)} Z`;

  // Overlay tag
  const overlayLinePath = tagOverlayPoints.length >= 2
    ? tagOverlayPoints
        .map((p, i) => `${i === 0 ? "M" : "L"} ${toXOverlay(i).toFixed(1)} ${toY(p.avg).toFixed(1)}`)
        .join(" ")
    : null;

  // Labels de mois sur l'axe X
  const monthLabels: { x: number; label: string }[] = [];
  let lastMonth = -1;
  chartPoints.forEach((p, i) => {
    const m = p.date.getMonth();
    if (m !== lastMonth) {
      const x = Math.min(toX(i), W - PR - 12);
      // Dernier mois à peine entamé : son libellé chevaucherait le précédent, on ne l'affiche pas
      const prev = monthLabels[monthLabels.length - 1];
      if (!prev || x - prev.x >= 32) monthLabels.push({ x, label: monthShort(m) });
      lastMonth = m;
    }
  });

  // 3 labels sur l'axe Y
  const yLabelValues = [yMin + yRange * 0.05, yMin + yRange * 0.5, yMin + yRange * 0.95];

  // Couleur overlay (vert lime pour alimentaire)
  const OVERLAY_COLOR = "#84CC16";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF2D78" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#FF2D78" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Lignes de grille horizontales */}
      {yLabelValues.map((v, i) => (
        <line
          key={i}
          x1={PL} y1={toY(v).toFixed(1)}
          x2={W - PR} y2={toY(v).toFixed(1)}
          stroke="rgba(0,0,0,0.06)"
          strokeWidth="1"
        />
      ))}

      {/* Aire sous la courbe */}
      <path d={areaPath} fill="url(#chartAreaGrad)" />

      {/* Ligne principale */}
      <path
        d={linePath}
        fill="none"
        stroke="#FF2D78"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Overlay tag */}
      {overlayLinePath && (
        <path
          d={overlayLinePath}
          fill="none"
          stroke={OVERLAY_COLOR}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 2"
        />
      )}

      {/* Points de données (un sur deux + dernier) */}
      {chartPoints.map((p, i) => {
        if (i % 2 !== 0 && i !== chartPoints.length - 1) return null;
        const isLast = i === chartPoints.length - 1;
        return (
          <circle
            key={i}
            cx={toX(i).toFixed(1)}
            cy={toY(p.avg).toFixed(1)}
            r={isLast ? 4.5 : 2.5}
            fill={isLast ? "#FF2D78" : "rgba(255,45,120,0.45)"}
            stroke={isLast ? "#fff" : "none"}
            strokeWidth={isLast ? 2 : 0}
          />
        );
      })}

      {/* Dernier point overlay */}
      {overlayLinePath && tagOverlayPoints.length > 0 && (
        <circle
          cx={toXOverlay(tagOverlayPoints.length - 1).toFixed(1)}
          cy={toY(tagOverlayPoints[tagOverlayPoints.length - 1].avg).toFixed(1)}
          r="3.5"
          fill={OVERLAY_COLOR}
          stroke="#fff"
          strokeWidth="1.5"
        />
      )}

      {/* Labels axe Y */}
      {yLabelValues.map((v, i) => (
        <text
          key={i}
          x={PL - 4}
          y={toY(v) + 3.5}
          textAnchor="end"
          fontSize="9"
          fill="#AEAEB2"
        >
          {formatMoney(v, undefined, 0)}
        </text>
      ))}

      {/* Labels axe X */}
      {monthLabels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={H - 5}
          textAnchor="middle"
          fontSize="9"
          fill="#AEAEB2"
        >
          {l.label}
        </text>
      ))}
    </svg>
  );
};

export default DailyAverageChart;
