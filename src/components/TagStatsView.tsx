// src/components/TagStatsView.tsx
import React, { useState, useEffect } from "react";
import { fetchAllSpendingsCached, fetchAllRevenuesCached } from "../api";
import { SearchSpendingResult, SearchRevenueResult } from "../types";
import { TagFilter } from "./TagFilter";
import { TagPieChart } from "./TagPieChart";
import { AdvancedTagFilters, AdvancedFilterState } from "./AdvancedTagFilters";
import { AdvancedTagStats } from "./AdvancedTagStats";
import { ExportButton } from "./ExportButton";
import { calculateTagStats, filterByTags } from "../tagStatsUtils";
import { applyAdvancedFilters, DEFAULT_ADVANCED_FILTERS } from "../advancedTagFiltersUtils";
import { getTagById } from "../tagsUtils";
import { loadAccounts } from "../accountsUtils";
import { currencySymbol as curSym } from "../baseCurrency";
import { t as tr, useLang } from "../i18n";
import { computeReceivedByAccount } from "../accountStatsUtils";
import { accountKey, mergeAccountLines, sumByName } from "../accountMerge";

const TagStatsView: React.FC = () => {
  useLang();
  const [loading, setLoading] = useState(true);
  const [allTransactions, setAllTransactions] = useState<SearchSpendingResult[]>([]);
  const [allRevenues, setAllRevenues] = useState<SearchRevenueResult[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>(DEFAULT_ADVANCED_FILTERS);
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Tout l'historique : l'ancienne lecture s'arrêtait à 500 lignes et faussait les totaux au-delà
        const [spendRes, revRes] = await Promise.all([fetchAllSpendingsCached(), fetchAllRevenuesCached()]);
        setAllTransactions(spendRes);
        setAllRevenues(revRes);
      } catch (err) {
        console.error("Erreur chargement données:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);




  // Filtrer les transactions selon les tags sélectionnés
  const tagFilteredTransactions = filterByTags(allTransactions, selectedTags);

  // Appliquer les filtres avancés (période 30j / 90j / 6m / personnalisé, montant, jarres)
  const filteredTransactions = applyAdvancedFilters(tagFilteredTransactions, advancedFilters);

  // Calculer les stats sur les transactions filtrées
  const stats = calculateTagStats(filteredTransactions);

  // Nombre de jours dans la période sélectionnée (pour avg/jour)
  const periodDays = React.useMemo(() => {
    const f = advancedFilters;
    if (f.period === "all") {
      // Utiliser la plage réelle des transactions filtrées
      if (filteredTransactions.length === 0) return 30;
      const dates = filteredTransactions.map(t => new Date(t.date).getTime()).filter(n => !isNaN(n));
      if (dates.length === 0) return 30;
      const earliest = Math.min(...dates);
      const latest = Math.max(...dates);
      return Math.max(1, Math.round((latest - earliest) / 86400000) + 1);
    }
    if (f.period === "custom" && f.customStartDate && f.customEndDate) {
      const ms = new Date(f.customEndDate).getTime() - new Date(f.customStartDate).getTime();
      return Math.max(1, Math.round(ms / 86400000) + 1);
    }
    const map: Record<string, number> = { "30d": 30, "90d": 90, "6m": 182, "year": 365 };
    return map[f.period] ?? 30;
  }, [advancedFilters, filteredTransactions]);

  // Total de toutes les dépenses filtrées
  const totalAmount = filteredTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

  // Dépenses sans aucune étiquette : absentes du graphique par étiquette, signalées en dessous
  const untagged = filteredTransactions.filter((t) => !t.tags || !t.tags.split(",").some((x) => x.trim()));
  const untaggedCount = untagged.length;
  const untaggedAmount = untagged.reduce((sum, t) => sum + (t.amount || 0), 0);

  // --- Par compte de dépense : reçus (revenus → destination) et dépensés par tag ---
  // « Keystone » (destination d'un revenu) et « KEYSTONE » (compte d'une dépense) sont le même compte : fusion sans
  // tenir compte de la casse ni des espaces.
  const receivedByAccount = computeReceivedByAccount(allRevenues, advancedFilters);
  const spentByAccount = sumByName(filteredTransactions, (s) => s.account, (s) => s.amount);
  const settingsAccounts = loadAccounts();
  const accountReportRows = mergeAccountLines(
    [
      ...settingsAccounts.map((a) => ({ name: a.name, received: 0, spent: 0 })),
      ...allTransactions.map((s) => ({ name: s.account, received: 0, spent: 0 })),
      ...Object.entries(receivedByAccount).map(([name, received]) => ({ name, received, spent: 0 })),
      ...Object.entries(spentByAccount).map(([name, spent]) => ({ name, received: 0, spent })),
    ],
    settingsAccounts.map((a) => a.name)
  ).map((m) => ({
    accountName: m.name,
    totalReceived: m.received,
    totalSpent: m.spent,
    tagStats: calculateTagStats(filteredTransactions.filter((s) => accountKey(s.account) === m.key)),
  }));

  if (loading) {
    return (
      <main className="page">
        <div style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
            {tr("stats.loading")}
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
        <h2 style={{ margin: 0 }}>{tr("stats.title")}</h2>
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
              {tr("stats.totalSpent")}
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#FF3B30" }}>
              {totalAmount.toFixed(2)}{curSym()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
              {tr("stats.transactions")}
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main)" }}>
              {filteredTransactions.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
              {tr("stats.tagsUsed")}
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main)" }}>
              {stats.length}
            </div>
          </div>
        </div>
      </div>

      {/* Par compte de dépense : reçus + dépensés par tag (période = filtre ci‑dessus) */}
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
          marginBottom: "8px",
          color: "var(--text-main)",
        }}>
          {tr("stats.byAccount")}
        </h3>
        <p style={{
          fontSize: "12px",
          color: "var(--text-muted)",
          marginBottom: "16px",
        }}>
          {tr("stats.byAccountHint")}
        </p>
        {accountReportRows.length === 0 ? (
          <p style={{ fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic" }}>
            {tr("stats.noAccountData")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {accountReportRows.map((row) => (
              <div
                key={row.accountName}
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-body)",
                }}
              >
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                  marginBottom: "12px",
                }}>
                  <span style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>
                    {row.accountName}
                  </span>
                  <div style={{ display: "flex", gap: "16px", alignItems: "baseline" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{tr("stats.received")}</div>
                      <div style={{ fontSize: "18px", fontWeight: "700", color: "#34C759" }}>
                        {row.totalReceived.toFixed(2)} {curSym()}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{tr("stats.spent")}</div>
                      <div style={{ fontSize: "18px", fontWeight: "700", color: "#FF3B30" }}>
                        {row.totalSpent.toFixed(2)} {curSym()}
                      </div>
                    </div>
                  </div>
                </div>
                {row.tagStats.length > 0 && (
                  <div style={{
                    borderTop: "1px solid var(--border-color)",
                    paddingTop: "12px",
                  }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", marginBottom: "8px" }}>
                      {tr("stats.detailByTag")}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {row.tagStats.map((t) => (
                        <span
                          key={t.tagId}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "8px",
                            background: `${t.color}18`,
                            border: `1px solid ${t.color}40`,
                            fontSize: "12px",
                            fontWeight: "600",
                            color: t.color,
                          }}
                        >
                          {t.emoji} {t.tagName} · {t.totalAmount.toFixed(2)} {curSym()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
            {tr("stats.visual")}
          </h3>
          <TagPieChart stats={stats} totalSpent={totalAmount} />
          <p className="stats-overlap-note">{tr("stats.overlapNote")}</p>
          {untaggedCount > 0 && (
            <p className="stats-overlap-note">{tr("stats.untagged", { amount: `${untaggedAmount.toFixed(2)} ${curSym()}`, n: untaggedCount })}</p>
          )}
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
            {tr("stats.detailsByTag")}
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
            {showAdvancedStats ? tr("stats.advHide") : tr("stats.advShow")}
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
              {tr("stats.noTagged")}
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
                      {tr(stat.count > 1 ? "stats.txN" : "stats.tx1", { n: stat.count })}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: "20px",
                      fontWeight: "700",
                      color: "#FF3B30",
                      marginBottom: "2px",
                    }}>
                      {stat.totalAmount.toFixed(2)}{curSym()}
                    </div>
                    <div style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "var(--text-muted)",
                      marginBottom: "2px",
                    }}>
                      ≈ {(stat.totalAmount / periodDays).toFixed(1)} {curSym()}/j
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
                      width: `${Math.min(100, stat.percentage)}%`,
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
              {tr("stats.noneFound")}
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
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {/* Ligne 1 : description + montant */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{
                      flex: 1,
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "var(--text-main)",
                      wordBreak: "break-word",
                    }}>
                      {transaction.description || "—"}
                    </div>
                    <div style={{
                      fontSize: "15px",
                      fontWeight: "700",
                      color: "#FF3B30",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}>
                      {transaction.amount?.toFixed(2)}{curSym()}
                    </div>
                  </div>

                  {/* Ligne 2 : date • jarre • compte */}
                  <div style={{ display: "flex", gap: "6px", fontSize: "12px", color: "var(--text-muted)", flexWrap: "wrap" }}>
                    <span>{transaction.date}</span>
                    <span>•</span>
                    <span>{transaction.jar}</span>
                    <span>•</span>
                    <span>{transaction.account}</span>
                  </div>

                  {/* Ligne 3 : tags */}
                  {tagIds.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: 2 }}>
                      {tagIds.map(tagId => {
                        const tag = getTagById(tagId);
                        if (!tag) return null;
                        return (
                          <div key={tagId} style={{
                            padding: "3px 8px",
                            borderRadius: "20px",
                            background: `${tag.color}18`,
                            border: `1px solid ${tag.color}50`,
                            fontSize: "11px",
                            fontWeight: "600",
                            color: tag.color,
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}>
                            <span>{tag.emoji}</span>
                            <span>{tag.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                {tr("stats.moreTx", { n: filteredTransactions.length - 50 })}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
};

export default TagStatsView;
