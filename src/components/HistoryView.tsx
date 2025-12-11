// src/components/HistoryView.tsx - VERSION CORRIGÉE
import React, { useState, useEffect } from "react";
import { searchSpendings, searchRevenues } from "../api";
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

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [destinationFilter, setDestinationFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [jarFilter, setJarFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");

  // Charger automatiquement au montage du composant
  useEffect(() => {
    handleSearch();
  }, [mode]); // Recharger quand on change de mode

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
    setError(null);
    // Les données seront chargées automatiquement par useEffect
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

  const matchPeriod = (dateStr: string): boolean => {
    if (periodFilter === "all") return true;
    const d = parseDate(dateStr);
    if (!d) return true;

    const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);

    switch (periodFilter) {
      case "30d":
        return diffDays <= 30;
      case "90d":
        return diffDays <= 90;
      case "year":
        return diffDays <= 365;
      default:
        return true;
    }
  };

  const filteredSpendings = spendings.filter((row) => {
    if (!matchPeriod(row.date)) return false;
    if (jarFilter !== "all" && row.jar !== jarFilter) return false;
    if (accountFilter !== "all" && row.account !== accountFilter) return false;
    return true;
  });

  const filteredRevenues = revenues.filter((row) => {
    if (!matchPeriod(row.date)) return false;
    if (typeFilter !== "all" && row.incomeType !== typeFilter) return false;
    if (destinationFilter !== "all" && row.destination !== destinationFilter) return false;
    if (methodFilter !== "all" && row.method !== methodFilter) return false;
    return true;
  });

  const totalSpending = filteredSpendings.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const totalRevenueEUR = filteredRevenues.reduce((sum, row) => sum + (row.amountEUR ?? 0), 0);
  const totalRevenueUSD = filteredRevenues.reduce((sum, row) => sum + (row.amountUSD ?? 0), 0);

  // Options pour les filtres - TOUJOURS basées sur les données NON filtrées
  const destinationOptions = Array.from(
    new Set(revenues.map((r) => r.destination).filter((x): x is string => Boolean(x)))
  );

  const typeOptions = Array.from(
    new Set(revenues.map((r) => r.incomeType).filter((x): x is string => Boolean(x)))
  );

  const methodOptions = Array.from(
    new Set(revenues.map((r) => r.method).filter((x): x is string => Boolean(x)))
  );

  const jarOptions = Array.from(
    new Set(spendings.map((s) => s.jar).filter((x): x is string => Boolean(x)))
  );

  const accountOptions = Array.from(
    new Set(spendings.map((s) => s.account).filter((x): x is string => Boolean(x)))
  );

  return (
    <main className="page">
      <div className="history-card">
        <h2>Historique</h2>

        {/* Toggle dépenses / revenus */}
        <div className="toggle-row">
          <label>
            <input type="radio" checked={mode === "spending"} onChange={() => handleModeChange("spending")} />
            Dépenses
          </label>
          <label>
            <input type="radio" checked={mode === "revenue"} onChange={() => handleModeChange("revenue")} />
            Revenus
          </label>
        </div>

        {/* Champ de recherche */}
        <div className="field-group">
          <input
            type="text"
            placeholder="Recherche…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
        </div>

        {/* Filtres avancés */}
        <div className="history-filters-column">
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}>
            <option value="all">Toute période</option>
            <option value="30d">30 derniers jours</option>
            <option value="90d">90 derniers jours</option>
            <option value="year">12 derniers mois</option>
          </select>

          {mode === "revenue" && (
            <>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">Tous les types</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <select value={destinationFilter} onChange={(e) => setDestinationFilter(e.target.value)}>
                <option value="all">Toutes les destinations</option>
                {destinationOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
                <option value="all">Toutes les méthodes</option>
                {methodOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </>
          )}

          {mode === "spending" && (
            <>
              <select value={jarFilter} onChange={(e) => setJarFilter(e.target.value)}>
                <option value="all">Toutes les jarres</option>
                {jarOptions.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>

              <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                <option value="all">Tous les comptes</option>
                {accountOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <button type="button" className="primary-btn" onClick={handleSearch} disabled={loading}>
          {loading ? "Recherche…" : "Rechercher"}
        </button>

        {error && <p style={{ color: "red", marginTop: "1rem" }}>{error}</p>}

        {/* Résumé chiffré */}
        {mode === "spending" && filteredSpendings.length > 0 && (
          <p className="history-summary">
            Total dépensé sur la période filtrée : <strong>{formatAmount(totalSpending)} €</strong>
          </p>
        )}

        {mode === "revenue" && filteredRevenues.length > 0 && (
          <p className="history-summary">
            Total revenus filtrés : <strong>{formatAmount(totalRevenueEUR)} €</strong> (
            {formatAmount(totalRevenueUSD)} $)
          </p>
        )}

        {/* Tableau DEPENSES */}
        {mode === "spending" && filteredSpendings.length > 0 && (
          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Jarre</th>
                  <th>Compte</th>
                  <th>Montant</th>
                  <th>Description</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSpendings.map((row, i) => (
                  <tr key={`${row.date}-${row.description}-${i}`}>
                    <td>{row.date}</td>
                    <td>{row.jar}</td>
                    <td>{row.account}</td>
                    <td>{formatAmount(row.amount)}</td>
                    <td>{row.description}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-btn small"
                        onClick={() => handleUseSpendingRow(row)}
                        disabled={!onUseEntry}
                      >
                        Utiliser
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tableau REVENUS */}
        {mode === "revenue" && filteredRevenues.length > 0 && (
          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>€</th>
                  <th>$</th>
                  <th>Méthode</th>
                  <th>Taux</th>
                  <th>Destination</th>
                  <th>Type</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRevenues.map((row, i) => (
                  <tr key={`${row.date}-${row.source}-${i}`}>
                    <td>{row.date}</td>
                    <td>{row.source}</td>
                    <td>{formatAmount(row.amountEUR)}</td>
                    <td>{formatAmount(row.amountUSD)}</td>
                    <td>{row.method}</td>
                    <td>{formatAmount(row.rate)}</td>
                    <td>{row.destination}</td>
                    <td>{row.incomeType}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-btn small"
                        onClick={() => handleUseRevenueRow(row)}
                        disabled={!onUseEntry}
                      >
                        Utiliser
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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