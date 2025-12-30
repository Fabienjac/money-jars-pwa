// src/components/AdvancedTagStats.tsx
import React from "react";
import { TagStat } from "../types";
import { SearchSpendingResult } from "../types";
import { MonthlyTrendChart } from "./MonthlyTrendChart";
import { JarBarChart } from "./JarBarChart";

interface AdvancedTagStatsProps {
  stats: TagStat[];
  allTransactions: SearchSpendingResult[];
}

export const AdvancedTagStats: React.FC<AdvancedTagStatsProps> = ({
  stats,
  allTransactions,
}) => {
  // Calculer le top 10 des dépenses
  const top10 = [...allTransactions]
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 10);

  // Calculer la moyenne par tag
  const avgByTag = stats.map(stat => ({
    ...stat,
    average: stat.count > 0 ? stat.totalAmount / stat.count : 0,
  }));

  // Calculer les stats du mois actuel vs précédent
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const currentMonthTransactions = allTransactions.filter(t => {
    const date = new Date(t.date);
    return date >= currentMonthStart;
  });

  const previousMonthTransactions = allTransactions.filter(t => {
    const date = new Date(t.date);
    return date >= previousMonthStart && date <= previousMonthEnd;
  });

  const currentMonthTotal = currentMonthTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  const previousMonthTotal = previousMonthTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  
  const monthDiff = currentMonthTotal - previousMonthTotal;
  const monthDiffPercent = previousMonthTotal > 0 
    ? ((monthDiff / previousMonthTotal) * 100) 
    : 0;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "20px",
    }}>
      {/* Graphique de tendance mensuelle */}
      <div style={{
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid var(--border-color)",
        background: "var(--bg-card)",
      }}>
        <MonthlyTrendChart transactions={allTransactions} />
      </div>

      {/* Graphique des dépenses par jarre par mois */}
      <div style={{
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid var(--border-color)",
        background: "var(--bg-card)",
      }}>
        <JarBarChart transactions={allTransactions} />
      </div>

      {/* Comparaison mois actuel vs précédent */}
      <div style={{
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid var(--border-color)",
        background: "var(--bg-card)",
      }}>
        <h4 style={{
          margin: "0 0 16px 0",
          fontSize: "15px",
          fontWeight: "700",
          color: "var(--text-main)",
        }}>
          📊 Comparaison mensuelle
        </h4>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
        }}>
          <div>
            <div style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "4px",
            }}>
              Mois actuel
            </div>
            <div style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#FF3B30",
            }}>
              {currentMonthTotal.toFixed(2)}€
            </div>
            <div style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              marginTop: "2px",
            }}>
              {currentMonthTransactions.length} transaction{currentMonthTransactions.length > 1 ? "s" : ""}
            </div>
          </div>

          <div>
            <div style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "4px",
            }}>
              Mois précédent
            </div>
            <div style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "var(--text-muted)",
            }}>
              {previousMonthTotal.toFixed(2)}€
            </div>
            <div style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              marginTop: "2px",
            }}>
              {previousMonthTransactions.length} transaction{previousMonthTransactions.length > 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Différence */}
        <div style={{
          marginTop: "16px",
          padding: "12px",
          borderRadius: "8px",
          background: monthDiff > 0 
            ? "rgba(255, 59, 48, 0.1)" 
            : "rgba(52, 199, 89, 0.1)",
          border: monthDiff > 0 
            ? "1px solid rgba(255, 59, 48, 0.3)" 
            : "1px solid rgba(52, 199, 89, 0.3)",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{
              fontSize: "13px",
              fontWeight: "600",
              color: monthDiff > 0 ? "#FF3B30" : "#34C759",
            }}>
              {monthDiff > 0 ? "📈 Augmentation" : "📉 Diminution"}
            </span>
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontSize: "16px",
                fontWeight: "700",
                color: monthDiff > 0 ? "#FF3B30" : "#34C759",
              }}>
                {monthDiff > 0 ? "+" : ""}{monthDiff.toFixed(2)}€
              </div>
              <div style={{
                fontSize: "12px",
                color: monthDiff > 0 ? "#FF3B30" : "#34C759",
              }}>
                {monthDiffPercent > 0 ? "+" : ""}{monthDiffPercent.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top 10 des dépenses */}
      <div style={{
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid var(--border-color)",
        background: "var(--bg-card)",
      }}>
        <h4 style={{
          margin: "0 0 12px 0",
          fontSize: "15px",
          fontWeight: "700",
          color: "var(--text-main)",
        }}>
          🏆 Top 10 des dépenses
        </h4>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}>
          {top10.map((transaction, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 12px",
                borderRadius: "8px",
                background: "var(--bg-body)",
              }}
            >
              <div style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: index < 3 
                  ? "linear-gradient(135deg, #FFD60A 0%, #FFCC00 100%)" 
                  : "var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: "700",
                color: index < 3 ? "#000" : "var(--text-muted)",
                flexShrink: 0,
              }}>
                {index + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {transaction.description}
                </div>
                <div style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}>
                  {transaction.date} • {transaction.jar}
                </div>
              </div>
              <div style={{
                fontSize: "15px",
                fontWeight: "700",
                color: "#FF3B30",
                whiteSpace: "nowrap",
              }}>
                {transaction.amount?.toFixed(2)}€
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Moyenne par tag */}
      <div style={{
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid var(--border-color)",
        background: "var(--bg-card)",
      }}>
        <h4 style={{
          margin: "0 0 12px 0",
          fontSize: "15px",
          fontWeight: "700",
          color: "var(--text-main)",
        }}>
          📊 Moyenne par transaction (par tag)
        </h4>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}>
          {avgByTag.map(stat => (
            <div
              key={stat.tagId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px",
                borderRadius: "8px",
                background: "var(--bg-body)",
              }}
            >
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}>
                <span style={{ fontSize: "24px" }}>{stat.emoji}</span>
                <div>
                  <div style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "var(--text-main)",
                  }}>
                    {stat.tagName}
                  </div>
                  <div style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                  }}>
                    {stat.count} transaction{stat.count > 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontSize: "16px",
                  fontWeight: "700",
                  color: stat.color,
                }}>
                  {stat.average.toFixed(2)}€
                </div>
                <div style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}>
                  par transaction
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
