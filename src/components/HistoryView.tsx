// src/components/HistoryView.tsx - VERSION MOBILE OPTIMISÉE
import React, { useState, useEffect, useRef } from "react";
import { searchSpendings, searchRevenues, fetchTotals } from "../api";
import { SearchSpendingResult, SearchRevenueResult } from "../types";

type Mode = "spending" | "revenue";

export type HistoryUseEntry =
  | { kind: "spending"; row: SearchSpendingResult }
  | { kind: "revenue"; row: SearchRevenueResult };

interface HistoryViewProps {
  onUseEntry?: (entry: HistoryUseEntry) => void;
}

const formatAmount = (value: number | undefined | null) => {
  if (value == null || isNaN(value)) return "—";
  return value.toFixed(2);
};

const parseDate = (value: string): Date | null => {
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

type PeriodFilter = "all" | "30d" | "90d" | "year";

const HistoryView: React.FC<HistoryViewProps> = ({ onUseEntry }) => {
  const [mode, setMode] = useState<Mode>("revenue");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spendings, setSpendings] = useState<SearchSpendingResult[]>([]);
  const [revenues, setRevenues] = useState<SearchRevenueResult[]>([]);

  // États pour les vrais totaux
  const [totalRevenuesFromAPI, setTotalRevenuesFromAPI] = useState<number>(0);
  const [totalSpendingsFromAPI, setTotalSpendingsFromAPI] = useState<number>(0);

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [destinationFilter, setDestinationFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [jarFilter, setJarFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [groupByDay, setGroupByDay] = useState(false);

  // ✅ NOUVEAU : État pour card expanded
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchCurrentXRef = useRef<number>(0);

  // Charger les vrais totaux depuis l'API
  useEffect(() => {
    const loadTotals = async () => {
      try {
        const totals = await fetchTotals();
        setTotalRevenuesFromAPI(totals.totalRevenues || 0);
        
        const totalSpend = Object.values(totals.jars).reduce(
          (sum, jar) => sum + (jar.spendings || 0),
          0
        );
        setTotalSpendingsFromAPI(totalSpend);
      } catch (err) {
        console.error("Erreur chargement totaux:", err);
      }
    };
    
    loadTotals();
  }, []);

  useEffect(() => {
    handleSearch();
  }, [mode]);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);

    try {
      if (mode === "spending") {
        const res = await searchSpendings(query, 200);
        setSpendings(res.rows || []);
        setRevenues([]);
      } else {
        const res = await searchRevenues(query, 200);
        setRevenues(res.rows || []);
        setSpendings([]);
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erreur inconnue");
      setSpendings([]);
      setRevenues([]);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = (m: Mode) => {
    setMode(m);
    setSpendings([]);
    setRevenues([]);
    setQuery("");
  };

  const handleUseSpendingRow = (row: SearchSpendingResult) => {
    if (!onUseEntry) return;
    onUseEntry({ kind: "spending", row });
  };

  const handleUseRevenueRow = (row: SearchRevenueResult) => {
    if (!onUseEntry) return;
    onUseEntry({ kind: "revenue", row });
  };

  const now = new Date();

  // Filtres de période
  const filterByPeriod = (dateStr: string): boolean => {
    if (periodFilter === "all") return true;
    const dt = parseDate(dateStr);
    if (!dt) return false;
    const diff = now.getTime() - dt.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    if (periodFilter === "30d") return days <= 30;
    if (periodFilter === "90d") return days <= 90;
    if (periodFilter === "year") return days <= 365;
    return true;
  };

  const filteredSpendings = spendings
    .filter((s) => filterByPeriod(s.date))
    .filter((s) => jarFilter === "all" || s.jar === jarFilter)
    .filter((s) => accountFilter === "all" || s.account === accountFilter);

  const filteredRevenues = revenues
    .filter((r) => filterByPeriod(r.date))
    .filter((r) => typeFilter === "all" || r.incomeType === typeFilter)
    .filter((r) => destinationFilter === "all" || r.destination === destinationFilter)
    .filter((r) => methodFilter === "all" || r.method === methodFilter);

  const totalSpendingFiltered = filteredSpendings.reduce(
    (sum, s) => sum + (s.amount || 0),
    0
  );

  const totalRevenueFiltered = filteredRevenues.reduce(
    (sum, r) => sum + (r.amount || 0),
    0
  );

  const uniqueTypes = Array.from(new Set(revenues.map((r) => r.incomeType).filter(Boolean)));
  const uniqueDestinations = Array.from(new Set(revenues.map((r) => r.destination).filter(Boolean)));
  const uniqueMethods = Array.from(new Set(revenues.map((r) => r.method).filter(Boolean)));
  const uniqueJars = Array.from(new Set(spendings.map((s) => s.jar).filter(Boolean)));
  const uniqueAccounts = Array.from(new Set(spendings.map((s) => s.account).filter(Boolean)));

  const sortByDateDesc = <T extends { date: string }>(items: T[]) =>
    [...items].sort((a, b) => {
      const da = parseDate(a.date)?.getTime() ?? 0;
      const db = parseDate(b.date)?.getTime() ?? 0;
      return db - da;
    });

  const groupByDate = <T extends { date: string }>(items: T[]) => {
    const map = new Map<string, T[]>();
    items.forEach((item) => {
      const list = map.get(item.date) || [];
      list.push(item);
      map.set(item.date, list);
    });
    return Array.from(map.entries()).map(([date, rows]) => ({ date, rows }));
  };

  const sortedSpendings = sortByDateDesc(filteredSpendings);
  const sortedRevenues = sortByDateDesc(filteredRevenues);
  const spendingGroups = groupByDate(sortedSpendings);
  const revenueGroups = groupByDate(sortedRevenues);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    touchCurrentXRef.current = touch.clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchCurrentXRef.current = touch.clientX;
  };

  const handleTouchEnd = (onUse: () => void) => {
    if (touchStartXRef.current == null) return;
    const deltaX = touchCurrentXRef.current - touchStartXRef.current;
    touchStartXRef.current = null;
    if (deltaX > 80) {
      onUse();
    }
  };

  return (
    <main className="history-main">
      <div className="history-container">
        <h2 className="history-title">Historique</h2>

        {/* Mode Toggle */}
        <div className="mode-toggle">
          <button
            type="button"
            className={`mode-toggle-btn ${mode === "spending" ? "active" : ""}`}
            onClick={() => handleModeChange("spending")}
          >
            Dépenses
          </button>
          <button
            type="button"
            className={`mode-toggle-btn ${mode === "revenue" ? "active" : ""}`}
            onClick={() => handleModeChange("revenue")}
          >
            Revenus
          </button>
        </div>

        {/* Recherche */}
        <input
          type="text"
          className="search-input"
          placeholder="Recherche..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSearch()}
        />

        {/* Filtres */}
        <select
          className="filter-select"
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
        >
          <option value="all">Toute période</option>
          <option value="30d">30 derniers jours</option>
          <option value="90d">90 derniers jours</option>
          <option value="year">Cette année</option>
        </select>

        {mode === "revenue" && (
          <>
            <select
              className="filter-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">Tous les types</option>
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={destinationFilter}
              onChange={(e) => setDestinationFilter(e.target.value)}
            >
              <option value="all">Toutes les destinations</option>
              {uniqueDestinations.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              <option value="all">Toutes les méthodes</option>
              {uniqueMethods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </>
        )}

        {mode === "spending" && (
          <>
            <select
              className="filter-select"
              value={jarFilter}
              onChange={(e) => setJarFilter(e.target.value)}
            >
              <option value="all">Toutes les jarres</option>
              {uniqueJars.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
            >
              <option value="all">Tous les comptes</option>
              {uniqueAccounts.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </>
        )}

        <button
          type="button"
          className={`group-toggle ${groupByDay ? "active" : ""}`}
          onClick={() => setGroupByDay((prev) => !prev)}
        >
          {groupByDay ? "Affichage liste" : "Groupé par jour"}
        </button>

        <button
          type="button"
          className="search-btn"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? "Chargement..." : "Rechercher"}
        </button>

        {error && <p className="error-message">{error}</p>}

        {/* Totaux */}
        {mode === "spending" && (
          <div className="history-summary">
            <p><strong>Total dépenses (calculé par l'API) : {formatAmount(totalSpendingsFromAPI)} €</strong></p>
            {filteredSpendings.length > 0 && (
              <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                Total des lignes affichées : {formatAmount(totalSpendingFiltered)} €
              </p>
            )}
          </div>
        )}

        {mode === "revenue" && (
          <div className="history-summary">
            <p><strong>Total revenus (calculé par l'API) : {formatAmount(totalRevenuesFromAPI)} €</strong></p>
            {filteredRevenues.length > 0 && (
              <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                Total des lignes affichées (montant brut USD) : {formatAmount(totalRevenueFiltered)} USD/EUR
                {Math.abs(totalRevenueFiltered - totalRevenuesFromAPI) > 1 && (
                  <span style={{ color: "#f97316", marginLeft: "8px" }}>
                    ⚠️ La différence est normale car les lignes affichent le montant en USD, 
                    mais le total API calcule en EUR après conversion crypto
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {/* ✅ CARDS DÉPENSES (Mobile-First) */}
        {mode === "spending" && filteredSpendings.length > 0 && (
          <div className="history-cards-wrapper">
            {(groupByDay ? spendingGroups : [{ date: "", rows: sortedSpendings }]).map(
              ({ date, rows }) => (
                <section
                  key={date || "flat-spendings"}
                  className="history-day-section"
                  aria-label={date ? `Transactions du ${date}` : undefined}
                >
                  {date && <div className="history-day-header">{date}</div>}
                  <div className="history-cards">
                    {rows.map((row, i) => (
                      <div
                        key={`${row.date}-${row.description}-${i}`}
                        className="history-card swipeable"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={() => handleTouchEnd(() => handleUseSpendingRow(row))}
                        onTouchCancel={() => (touchStartXRef.current = null)}
                      >
                        <div className="history-card-header">
                          <div className="history-card-main">
                            <span className="history-card-date">{row.date}</span>
                            <span className="history-card-description">{row.description}</span>
                          </div>
                          <span className="history-card-amount">-{formatAmount(row.amount)} €</span>
                        </div>
                        <div className="history-card-meta">
                          <span className="history-card-badge accent">{row.jar}</span>
                          <span className="history-card-badge secondary">{row.account}</span>
                        </div>
                        <button
                          type="button"
                          className="history-card-action-btn full-width"
                          onClick={() => handleUseSpendingRow(row)}
                          disabled={!onUseEntry}
                        >
                          ↻ Utiliser
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )
            )}
          </div>
        )}

        {/* ✅ CARDS REVENUS (Mobile-First) */}
        {mode === "revenue" && filteredRevenues.length > 0 && (
          <div className="history-cards-wrapper">
            {(groupByDay ? revenueGroups : [{ date: "", rows: sortedRevenues }]).map(
              ({ date, rows }) => (
                <section
                  key={date || "flat-revenues"}
                  className="history-day-section"
                  aria-label={date ? `Revenus du ${date}` : undefined}
                >
                  {date && <div className="history-day-header">{date}</div>}
                  <div className="history-cards">
                    {rows.map((row, i) => {
                      const cardKey = `${date}-${row.date}-${row.source}-${i}`;
                      const isExpanded = expandedCard === cardKey;
                      return (
                        <div
                          key={cardKey}
                          className="history-card swipeable"
                          onTouchStart={handleTouchStart}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={() => handleTouchEnd(() => handleUseRevenueRow(row))}
                          onTouchCancel={() => (touchStartXRef.current = null)}
                        >
                          <div className="history-card-header">
                            <div className="history-card-main">
                              <span className="history-card-date">{row.date}</span>
                              <span className="history-card-description">{row.source}</span>
                            </div>
                            <span className="history-card-amount revenue">
                              +{formatAmount(row.amount)} {row.value}
                            </span>
                          </div>
                          
                          <div className="history-card-meta">
                            <span className="history-card-badge accent">{row.method}</span>
                            {row.destination && (
                              <span className="history-card-badge secondary">{row.destination}</span>
                            )}
                          </div>

                          {/* DétailsExpandableUTF */}
                          {isExpanded && (
                            <div className="history-card-details">
                              {row.cryptoQuantity && (
                                <div className="history-card-detail-row">
                                  <span>Crypto:</span>
                                  <span>{formatAmount(row.cryptoQuantity)}</span>
                                </div>
                              )}
                              {row.rate && (
                                <div className="history-card-detail-row">
                                  <span>Taux:</span>
                                  <span>{formatAmount(row.rate)}</span>
                                </div>
                              )}
                              {row.incomeType && (
                                <div className="history-card-detail-row">
                                  <span>Type:</span>
                                  <span>{row.incomeType}</span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="history-card-actions">
                            <button
                              type="button"
                              className="history-card-toggle-btn"
                              onClick={() => setExpandedCard(isExpanded ? null : cardKey)}
                            >
                              {isExpanded ? "▲ Moins" : "▼ Plus"}
                            </button>
                            <button
                              type="button"
                              className="history-card-action-btn primary full-width"
                              onClick={() => handleUseRevenueRow(row)}
                              disabled={!onUseEntry}
                            >
                              ↻ Utiliser
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )
            )}
          </div>
        )}

        {loading && (
          <p style={{ marginTop: "1rem", textAlign: "center", color: "var(--text-muted)" }}>
            Chargement des données…
          </p>
        )}

        {!loading && !error && spendings.length === 0 && revenues.length === 0 && (
          <p style={{ marginTop: "1rem", color: "#777", textAlign: "center" }}>
            Aucune donnée trouvée. Essayez d'élargir vos critères de recherche.
          </p>
        )}
      </div>
    </main>
  );
};

export default HistoryView;
