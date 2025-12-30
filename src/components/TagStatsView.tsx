// src/components/TagStatsView.tsx
import React, { useState, useEffect } from "react";
import { searchSpendings } from "../api";
import { SearchSpendingResult } from "../types";
import { TagFilter } from "./TagFilter";
import { TagPieChart } from "./TagPieChart";
import { AdvancedTagFilters, AdvancedFilterState } from "./AdvancedTagFilters";
import { AdvancedTagStats } from "./AdvancedTagStats";
import { ExportButton } from "./ExportButton";
import { calculateTagStats, filterByTags } from "../tagStatsUtils";
import { applyAdvancedFilters, DEFAULT_ADVANCED_FILTERS } from "../advancedTagFiltersUtils";
import { getTagById } from "../tagsUtils";

const TagStatsView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [allTransactions, setAllTransactions] = useState<SearchSpendingResult[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>(DEFAULT_ADVANCED_FILTERS);
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);

  // Charger toutes les transactions au montage

  useEffect(() => {
    const loadTransactions = async () => {
      setLoading(true);
      try {
        const res = await searchSpendings("", 500);
      
        // ← AJOUTER CE LOG
        console.log("🔥 DEBUG Frontend:", {
          total: res.rows?.length,
          premier: res.rows?.[0],
          tags: res.rows?.[0]?.tags
        });
      
        setAllTransactions(res.rows || []);
      } catch (err) {
        console.error("Erreur:", err);
      } finally {
        setLoading(false);
      }
    };
    loadTransactions();
  }, []);




  // Filtrer les transactions selon les tags sélectionnés
  const tagFilteredTransactions = filterByTags(allTransactions, selectedTags);
  
  // Appliquer les filtres avancés
  const filteredTransactions = applyAdvancedFilters(tagFilteredTransactions, advancedFilters);

  // Calculer les stats sur les transactions filtrées
  const stats = calculateTagStats(filteredTransactions);

  // Total de toutes les dépenses filtrées
  const totalAmount = filteredTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

  if (loading) {
    return (
      <main className="page">
        <div style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
            Chargement des données...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page" style={{ maxWidth: "1000px", margin: "0 auto" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "20px",
      }}>
        <h2 style={{ margin: 0 }}>📊 Statistiques par tags</h2>
        {stats.length > 0 && (
          <ExportButton
            stats={stats}
            transactions={filteredTransactions}
          />
        )}
      </div>

      {/* Filtre de tags */}
      <TagFilter
        selectedTags={selectedTags}
        onSelectionChange={setSelectedTags}
      />

      {/* Filtres avancés */}
      <div style={{ marginTop: "16px" }}>
        <AdvancedTagFilters
          filters={advancedFilters}
          onChange={setAdvancedFilters}
          onReset={() => setAdvancedFilters(DEFAULT_ADVANCED_FILTERS)}
        />
      </div>

      {/* Résumé global */}
      <div style={{
        marginTop: "20px",
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid var(--border-color)",
        background: "var(--bg-card)",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
        }}>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Total dépensé
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#FF3B30" }}>
              {totalAmount.toFixed(2)}€
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Transactions
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main)" }}>
              {filteredTransactions.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Tags utilisés
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main)" }}>
              {stats.length}
            </div>
          </div>
        </div>
      </div>

      {/* Graphique en camembert */}
      {stats.length > 0 && (
        <div style={{
          marginTop: "20px",
          padding: "20px",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          background: "var(--bg-card)",
        }}>
          <h3 style={{ 
            fontSize: "16px", 
            fontWeight: "700", 
            marginBottom: "20px",
            color: "var(--text-main)",
            textAlign: "center",
          }}>
            📊 Répartition visuelle
          </h3>
          <TagPieChart stats={stats} />
        </div>
      )}

      {/* Statistiques par tag */}
      <div style={{ marginTop: "20px" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}>
          <h3 style={{ 
            margin: 0,
            fontSize: "16px", 
            fontWeight: "700", 
            color: "var(--text-main)",
          }}>
            Détails par tag
          </h3>
          <button
            type="button"
            onClick={() => setShowAdvancedStats(!showAdvancedStats)}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: showAdvancedStats ? "#007AFF" : "var(--bg-body)",
              color: showAdvancedStats ? "white" : "var(--text-main)",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            {showAdvancedStats ? "📊 Stats visibles" : "📈 Voir stats avancées"}
          </button>
        </div>

        {/* Stats avancées */}
        {showAdvancedStats && stats.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <AdvancedTagStats
              stats={stats}
              allTransactions={filteredTransactions}
            />
          </div>
        )}

        {stats.length === 0 ? (
          <div style={{
            padding: "40px",
            textAlign: "center",
            border: "1px solid var(--border-color)",
            borderRadius: "12px",
            background: "var(--bg-card)",
          }}>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", fontStyle: "italic" }}>
              Aucune transaction avec des tags
            </p>
          </div>
        ) : (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}>
            {stats.map(stat => (
              <div
                key={stat.tagId}
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-card)",
                }}
              >
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "12px",
                }}>
                  <span style={{ fontSize: "28px" }}>{stat.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: "15px",
                      fontWeight: "700",
                      color: "var(--text-main)",
                      marginBottom: "2px",
                    }}>
                      {stat.tagName}
                    </div>
                    <div style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                    }}>
                      {stat.count} transaction{stat.count > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: "20px",
                      fontWeight: "700",
                      color: "#FF3B30",
                      marginBottom: "2px",
                    }}>
                      {stat.totalAmount.toFixed(2)}€
                    </div>
                    <div style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: stat.color,
                    }}>
                      {stat.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Barre de progression */}
                <div style={{
                  width: "100%",
                  height: "8px",
                  borderRadius: "4px",
                  background: "var(--bg-body)",
                  overflow: "hidden",
                }}>
                  <div
                    style={{
                      width: `${stat.percentage}%`,
                      height: "100%",
                      background: stat.color,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Liste des transactions filtrées */}
      <div style={{ marginTop: "30px" }}>
        <h3 style={{ 
          fontSize: "16px", 
          fontWeight: "700", 
          marginBottom: "12px",
          color: "var(--text-main)",
        }}>
          Transactions ({filteredTransactions.length})
        </h3>

        {filteredTransactions.length === 0 ? (
          <div style={{
            padding: "40px",
            textAlign: "center",
            border: "1px solid var(--border-color)",
            borderRadius: "12px",
            background: "var(--bg-card)",
          }}>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", fontStyle: "italic" }}>
              Aucune transaction trouvée
            </p>
          </div>
        ) : (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}>
            {filteredTransactions.slice(0, 50).map((transaction, idx) => {
              const tagIds = transaction.tags 
                ? transaction.tags.split(',').map(t => t.trim()) 
                : [];
              
              return (
                <div
                  key={idx}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "10px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-card)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "var(--text-main)",
                      marginBottom: "4px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {transaction.description}
                    </div>
                    <div style={{
                      display: "flex",
                      gap: "8px",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                    }}>
                      <span>{transaction.date}</span>
                      <span>•</span>
                      <span>{transaction.jar}</span>
                      <span>•</span>
                      <span>{transaction.account}</span>
                    </div>
                  </div>

                  {/* Tags */}
                  <div style={{
                    display: "flex",
                    gap: "6px",
                    flexWrap: "wrap",
                  }}>
                    {tagIds.map(tagId => {
                      const tag = getTagById(tagId);
                      if (!tag) return null;

                      return (
                        <div
                          key={tagId}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "6px",
                            background: `${tag.color}20`,
                            border: `1px solid ${tag.color}40`,
                            fontSize: "11px",
                            fontWeight: "600",
                            color: tag.color,
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span>{tag.emoji}</span>
                          <span>{tag.name}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{
                    fontSize: "16px",
                    fontWeight: "700",
                    color: "#FF3B30",
                    whiteSpace: "nowrap",
                  }}>
                    {transaction.amount?.toFixed(2)}€
                  </div>
                </div>
              );
            })}
            
            {filteredTransactions.length > 50 && (
              <p style={{
                textAlign: "center",
                fontSize: "12px",
                color: "var(--text-muted)",
                padding: "12px",
              }}>
                ... et {filteredTransactions.length - 50} transaction(s) de plus
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
};

export default TagStatsView;
