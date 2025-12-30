// src/components/RecentTransactions.tsx
// VERSION OPTIMISÉE - Sans tri car déjà trié dans Google Sheets

import React, { useEffect, useState } from "react";
import { searchSpendings, searchRevenues } from "../api";

interface RecentTransactionsProps {
  mode: "spending" | "revenue";
  onSelect: (item: any) => void;
  maxResults?: number;
}

export const RecentTransactions: React.FC<RecentTransactionsProps> = ({
  mode,
  onSelect,
  maxResults = 3,
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecent = async () => {
      setLoading(true);
      try {
        let result;
        if (mode === "spending") {
          result = await searchSpendings("", maxResults);
        } else {
          result = await searchRevenues("", maxResults);
        }

        // ✅ SIMPLIFICATION : Pas de tri !
        // Les transactions sont déjà triées par ordre décroissant dans Google Sheets
        // grâce à insertRowAfter() qui insère les nouvelles en haut
        
        const recent = result.rows || [];
        
        console.log(`✅ ${recent.length} transactions récentes (déjà triées)`);
        
        setItems(recent);
      } catch (err) {
        console.error("Erreur chargement transactions récentes:", err);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRecent();
  }, [mode, maxResults]);

  if (loading) {
    return (
      <div style={{
        padding: "12px 20px",
        fontSize: "13px",
        color: "var(--text-muted)",
        textAlign: "center",
      }}>
        Chargement...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{
        padding: "12px 20px",
        fontSize: "13px",
        color: "var(--text-muted)",
        textAlign: "center",
      }}>
        Aucune transaction récente
      </div>
    );
  }

  return (
    <div style={{
      padding: "12px 20px",
      borderBottom: "1px solid var(--border-color)",
      background: "var(--bg-body)",
    }}>
      <p style={{
        margin: "0 0 10px 0",
        fontSize: "12px",
        fontWeight: "600",
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}>
        🕐 Récentes
      </p>
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}>
        {items.map((transaction, index) => {
          const isSpending = mode === "spending";

          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(transaction)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-card)",
                cursor: "pointer",
                transition: "all 0.2s",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-body)";
                e.currentTarget.style.borderColor = "#007AFF";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-card)";
                e.currentTarget.style.borderColor = "var(--border-color)";
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0,
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {isSpending ? transaction.description : transaction.source}
                </p>
                <div style={{
                  display: "flex",
                  gap: "8px",
                  marginTop: "4px",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}>
                  {isSpending ? (
                    <>
                      <span>{transaction.date}</span>
                      <span>•</span>
                      <span>{transaction.jar}</span>
                      <span>•</span>
                      <span>{transaction.account}</span>
                    </>
                  ) : (
                    <>
                      <span>{transaction.date}</span>
                      <span>•</span>
                      <span>{transaction.value}</span>
                      {transaction.incomeType && (
                        <>
                          <span>•</span>
                          <span>{transaction.incomeType}</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexShrink: 0,
              }}>
                <span style={{
                  fontSize: "15px",
                  fontWeight: "700",
                  color: isSpending ? "#FF3B30" : "#34C759",
                }}>
                  {transaction.amount?.toFixed(2) || "0.00"}€
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{ opacity: 0.5 }}
                >
                  <path
                    d="M6 12L10 8L6 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
