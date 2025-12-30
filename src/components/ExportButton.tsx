// src/components/ExportButton.tsx
import React, { useState } from "react";
import { TagStat, SearchSpendingResult } from "../types";
import { exportStatsToCSV, exportTransactionsToCSV, exportChartToPNG } from "../exportUtils";

interface ExportButtonProps {
  stats: TagStat[];
  transactions: SearchSpendingResult[];
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  stats,
  transactions,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const handleExportStats = () => {
    exportStatsToCSV(stats, transactions);
    setShowMenu(false);
  };

  const handleExportTransactions = () => {
    exportTransactionsToCSV(transactions);
    setShowMenu(false);
  };

  const handleExportChart = () => {
    // Chercher le SVG du graphique par ID
    const svgElement = document.getElementById('tag-pie-chart') as SVGSVGElement;
    
    if (!svgElement) {
      console.error("SVG non trouvé avec ID 'tag-pie-chart'");
      alert("Graphique non trouvé. Assurez-vous qu'il est affiché.");
      setShowMenu(false);
      return;
    }

    console.log("SVG trouvé, export en cours...");
    exportChartToPNG(svgElement, "tags_chart");
    setShowMenu(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        style={{
          padding: "10px 16px",
          borderRadius: "10px",
          border: "none",
          background: "linear-gradient(135deg, #34C759 0%, #30B350 100%)",
          color: "white",
          fontSize: "14px",
          fontWeight: "700",
          cursor: "pointer",
          boxShadow: "0 4px 10px rgba(52, 199, 89, 0.3)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span>📥</span>
        <span>Exporter</span>
      </button>

      {showMenu && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowMenu(false)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
            }}
          />

          {/* Menu */}
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              minWidth: "220px",
              padding: "8px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)",
              zIndex: 1000,
            }}
          >
            <button
              type="button"
              onClick={handleExportStats}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                textAlign: "left",
                fontSize: "14px",
                fontWeight: "600",
                color: "var(--text-main)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-body)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ fontSize: "20px" }}>📊</span>
              <div>
                <div>Statistiques CSV</div>
                <div style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}>
                  Stats par tag
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleExportTransactions}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                textAlign: "left",
                fontSize: "14px",
                fontWeight: "600",
                color: "var(--text-main)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-body)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ fontSize: "20px" }}>📝</span>
              <div>
                <div>Transactions CSV</div>
                <div style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}>
                  {transactions.length} transaction{transactions.length > 1 ? "s" : ""}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleExportChart}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                textAlign: "left",
                fontSize: "14px",
                fontWeight: "600",
                color: "var(--text-main)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-body)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ fontSize: "20px" }}>🖼️</span>
              <div>
                <div>Graphique PNG</div>
                <div style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}>
                  Avec légende
                </div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
