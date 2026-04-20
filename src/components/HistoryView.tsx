// src/components/HistoryView.tsx - VERSION MOBILE OPTIMISÉE
import React, { useState, useEffect, useMemo } from "react";
import { searchSpendings, searchRevenues, fetchTotals, updateSpending, updateRevenue, deleteSpending, deleteRevenue } from "../api";
import { SearchSpendingResult, SearchRevenueResult, JarKey } from "../types";

const JAR_KEYS: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];

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

  // ✅ NOUVEAU : État pour card expanded
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  // États pour l'édition inline
  const [editingSpendingRow, setEditingSpendingRow] = useState<SearchSpendingResult | null>(null);
  const [editingRevenueRow, setEditingRevenueRow] = useState<SearchRevenueResult | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  const startEditSpending = (row: SearchSpendingResult) => {
    setEditingSpendingRow(row);
    setEditingRevenueRow(null);
    setEditDraft({
      date: row.date,
      description: row.description,
      amount: row.amount,
      jar: row.jar,
      account: row.account,
      tags: row.tags || "",
    });
    setEditError(null);
  };

  const startEditRevenue = (row: SearchRevenueResult) => {
    setEditingRevenueRow(row);
    setEditingSpendingRow(null);
    setEditDraft({
      date: row.date,
      source: row.source,
      amount: row.amount,
      value: row.value || "",
      method: row.method || "",
      rate: row.rate || "",
      destination: row.destination || "",
      incomeType: row.incomeType || "",
      tags: row.tags || "",
    });
    setEditError(null);
  };

  const handleSaveSpending = async () => {
    if (!editingSpendingRow) return;
    if (!editingSpendingRow.rowIndex) {
      setEditError("rowIndex manquant — mettez à jour votre Google Apps Script pour activer l'édition.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateSpending(editingSpendingRow.rowIndex, {
        date: editDraft.date,
        description: editDraft.description,
        amount: parseFloat(editDraft.amount),
        jar: editDraft.jar,
        account: editDraft.account,
        tags: editDraft.tags || undefined,
      });
      setSpendings(prev => prev.map(s =>
        s === editingSpendingRow
          ? { ...s, ...editDraft, amount: parseFloat(editDraft.amount) }
          : s
      ));
      setEditingSpendingRow(null);
    } catch (e: any) {
      setEditError(e.message || "Erreur lors de la sauvegarde");
    } finally {
      setEditSaving(false);
    }
  };

  const handleSaveRevenue = async () => {
    if (!editingRevenueRow) return;
    if (!editingRevenueRow.rowIndex) {
      setEditError("rowIndex manquant — mettez à jour votre Google Apps Script pour activer l'édition.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateRevenue(editingRevenueRow.rowIndex, {
        date: editDraft.date,
        source: editDraft.source,
        amount: parseFloat(editDraft.amount) || undefined,
        value: editDraft.value || undefined,
        method: editDraft.method || undefined,
        rate: parseFloat(editDraft.rate) || undefined,
        destination: editDraft.destination || undefined,
        incomeType: editDraft.incomeType || undefined,
        tags: editDraft.tags || undefined,
      });
      setRevenues(prev => prev.map(r =>
        r === editingRevenueRow
          ? { ...r, ...editDraft, amount: parseFloat(editDraft.amount) }
          : r
      ));
      setEditingRevenueRow(null);
    } catch (e: any) {
      setEditError(e.message || "Erreur lors de la sauvegarde");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteSpending = async (row: SearchSpendingResult) => {
    if (!row.rowIndex) {
      alert("rowIndex manquant — mettez à jour votre Google Apps Script pour activer la suppression.");
      return;
    }
    if (!window.confirm(`Supprimer définitivement "${row.description}" (${row.amount} €) ?`)) return;
    try {
      await deleteSpending(row.rowIndex);
      setSpendings(prev => prev.filter(s => s !== row));
    } catch (e: any) {
      alert("Erreur suppression : " + (e.message || String(e)));
    }
  };

  const handleDeleteRevenue = async (row: SearchRevenueResult) => {
    if (!row.rowIndex) {
      alert("rowIndex manquant — mettez à jour votre Google Apps Script pour activer la suppression.");
      return;
    }
    if (!window.confirm(`Supprimer définitivement "${row.source}" (${row.amount}) ?`)) return;
    try {
      await deleteRevenue(row.rowIndex);
      setRevenues(prev => prev.filter(r => r !== row));
    } catch (e: any) {
      alert("Erreur suppression : " + (e.message || String(e)));
    }
  };

  const periodCutoff = useMemo(() => {
    if (periodFilter === "all") return null;
    const d = new Date();
    if (periodFilter === "30d") d.setDate(d.getDate() - 30);
    else if (periodFilter === "90d") d.setDate(d.getDate() - 90);
    else if (periodFilter === "year") d.setDate(d.getDate() - 365);
    return d;
  }, [periodFilter]);

  const filteredSpendings = useMemo(() =>
    spendings.filter((s) => {
      if (periodCutoff) {
        const dt = parseDate(s.date);
        if (!dt || dt < periodCutoff) return false;
      }
      if (jarFilter !== "all" && s.jar !== jarFilter) return false;
      if (accountFilter !== "all" && s.account !== accountFilter) return false;
      return true;
    }),
    [spendings, periodCutoff, jarFilter, accountFilter]
  );

  const filteredRevenues = useMemo(() =>
    revenues.filter((r) => {
      if (periodCutoff) {
        const dt = parseDate(r.date);
        if (!dt || dt < periodCutoff) return false;
      }
      if (typeFilter !== "all" && r.incomeType !== typeFilter) return false;
      if (destinationFilter !== "all" && r.destination !== destinationFilter) return false;
      if (methodFilter !== "all" && r.method !== methodFilter) return false;
      return true;
    }),
    [revenues, periodCutoff, typeFilter, destinationFilter, methodFilter]
  );

  const totalSpendingFiltered = useMemo(() =>
    filteredSpendings.reduce((sum, s) => sum + (s.amount || 0), 0),
    [filteredSpendings]
  );

  const totalRevenueFiltered = useMemo(() =>
    filteredRevenues.reduce((sum, r) => sum + (r.amount || 0), 0),
    [filteredRevenues]
  );

  const uniqueTypes = useMemo(() => Array.from(new Set(revenues.map((r) => r.incomeType).filter(Boolean))), [revenues]);
  const uniqueDestinations = useMemo(() => Array.from(new Set(revenues.map((r) => r.destination).filter(Boolean))), [revenues]);
  const uniqueMethods = useMemo(() => Array.from(new Set(revenues.map((r) => r.method).filter(Boolean))), [revenues]);
  const uniqueJars = useMemo(() => Array.from(new Set(spendings.map((s) => s.jar).filter(Boolean))), [spendings]);
  const uniqueAccounts = useMemo(() => Array.from(new Set(spendings.map((s) => s.account).filter(Boolean))), [spendings]);

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
          <div className="history-cards">
            {filteredSpendings.map((row, i) => (
              <div key={`${row.date}-${row.description}-${i}`} className="history-card">
                <div className="history-card-header">
                  <div className="history-card-main">
                    <span className="history-card-date">{row.date}</span>
                    <span className="history-card-description">{row.description}</span>
                  </div>
                  <span className="history-card-amount">-{formatAmount(row.amount)} €</span>
                </div>
                <div className="history-card-meta">
                  <span className="history-card-badge">{row.jar}</span>
                  <span className="history-card-badge">{row.account}</span>
                </div>

                {/* Formulaire d'édition inline */}
                {editingSpendingRow === row && (
                  <div className="history-card-edit-form">
                    <div className="edit-form-grid">
                      <label>Date
                        <input type="date" value={editDraft.date || ""} onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))} />
                      </label>
                      <label>Montant (€)
                        <input type="number" step="0.01" value={editDraft.amount || ""} onChange={e => setEditDraft(d => ({ ...d, amount: e.target.value }))} />
                      </label>
                      <label>Description
                        <input type="text" value={editDraft.description || ""} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))} />
                      </label>
                      <label>Jarre
                        <select value={editDraft.jar || ""} onChange={e => setEditDraft(d => ({ ...d, jar: e.target.value }))}>
                          {JAR_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </label>
                      <label>Compte
                        <input type="text" value={editDraft.account || ""} onChange={e => setEditDraft(d => ({ ...d, account: e.target.value }))} />
                      </label>
                      <label>Tags
                        <input type="text" value={editDraft.tags || ""} onChange={e => setEditDraft(d => ({ ...d, tags: e.target.value }))} placeholder="id1,id2,..." />
                      </label>
                    </div>
                    {editError && <p className="edit-form-error">{editError}</p>}
                    <div className="edit-form-actions">
                      <button type="button" className="edit-form-save" onClick={handleSaveSpending} disabled={editSaving}>
                        {editSaving ? "⏳ Sauvegarde…" : "💾 Enregistrer"}
                      </button>
                      <button type="button" className="edit-form-cancel" onClick={() => setEditingSpendingRow(null)}>
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                <div className="history-card-actions">
                  <button
                    type="button"
                    className="history-card-action-btn"
                    onClick={() => handleUseSpendingRow(row)}
                    disabled={!onUseEntry}
                  >
                    ↻ Utiliser
                  </button>
                  <button
                    type="button"
                    className="history-card-action-btn history-card-edit-btn"
                    onClick={() => editingSpendingRow === row ? setEditingSpendingRow(null) : startEditSpending(row)}
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    type="button"
                    className="history-card-action-btn history-card-delete-btn"
                    onClick={() => handleDeleteSpending(row)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ✅ CARDS REVENUS (Mobile-First) */}
        {mode === "revenue" && filteredRevenues.length > 0 && (
          <div className="history-cards">
            {filteredRevenues.map((row, i) => {
              const isExpanded = expandedCard === i;
              return (
                <div key={`${row.date}-${row.source}-${i}`} className="history-card">
                  <div className="history-card-header">
                    <div className="history-card-main">
                      <span className="history-card-date">{row.date}</span>
                      <span className="history-card-description">{row.source}</span>
                    </div>
                    <span className="history-card-amount revenue">+{formatAmount(row.amount)} {row.value}</span>
                  </div>
                  
                  <div className="history-card-meta">
                    <span className="history-card-badge">{row.method}</span>
                    {row.destination && <span className="history-card-badge">{row.destination}</span>}
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

                  {/* Formulaire d'édition inline */}
                  {editingRevenueRow === row && (
                    <div className="history-card-edit-form">
                      <div className="edit-form-grid">
                        <label>Date
                          <input type="date" value={editDraft.date || ""} onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))} />
                        </label>
                        <label>Montant
                          <input type="number" step="0.01" value={editDraft.amount || ""} onChange={e => setEditDraft(d => ({ ...d, amount: e.target.value }))} />
                        </label>
                        <label>Source
                          <input type="text" value={editDraft.source || ""} onChange={e => setEditDraft(d => ({ ...d, source: e.target.value }))} />
                        </label>
                        <label>Valeur (devise)
                          <input type="text" value={editDraft.value || ""} onChange={e => setEditDraft(d => ({ ...d, value: e.target.value }))} />
                        </label>
                        <label>Méthode
                          <input type="text" value={editDraft.method || ""} onChange={e => setEditDraft(d => ({ ...d, method: e.target.value }))} />
                        </label>
                        <label>Taux
                          <input type="number" step="0.000001" value={editDraft.rate || ""} onChange={e => setEditDraft(d => ({ ...d, rate: e.target.value }))} />
                        </label>
                        <label>Destination
                          <input type="text" value={editDraft.destination || ""} onChange={e => setEditDraft(d => ({ ...d, destination: e.target.value }))} />
                        </label>
                        <label>Type
                          <input type="text" value={editDraft.incomeType || ""} onChange={e => setEditDraft(d => ({ ...d, incomeType: e.target.value }))} />
                        </label>
                      </div>
                      {editError && <p className="edit-form-error">{editError}</p>}
                      <div className="edit-form-actions">
                        <button type="button" className="edit-form-save" onClick={handleSaveRevenue} disabled={editSaving}>
                          {editSaving ? "⏳ Sauvegarde…" : "💾 Enregistrer"}
                        </button>
                        <button type="button" className="edit-form-cancel" onClick={() => setEditingRevenueRow(null)}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="history-card-actions">
                    <button
                      type="button"
                      className="history-card-toggle-btn"
                      onClick={() => setExpandedCard(isExpanded ? null : i)}
                    >
                      {isExpanded ? "▲ Moins" : "▼ Plus"}
                    </button>
                    <button
                      type="button"
                      className="history-card-action-btn primary"
                      onClick={() => handleUseRevenueRow(row)}
                      disabled={!onUseEntry}
                    >
                      ↻ Utiliser
                    </button>
                    <button
                      type="button"
                      className="history-card-action-btn history-card-edit-btn"
                      onClick={() => editingRevenueRow === row ? setEditingRevenueRow(null) : startEditRevenue(row)}
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      type="button"
                      className="history-card-action-btn history-card-delete-btn"
                      onClick={() => handleDeleteRevenue(row)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
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
