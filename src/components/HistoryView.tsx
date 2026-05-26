// src/components/HistoryView.tsx - VERSION REFACTORISÉE (Features 4 & 5)
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  searchSpendings, searchRevenues,
  updateSpending, updateRevenue,
  deleteSpending, deleteRevenue,
} from "../api";
import { SearchSpendingResult, SearchRevenueResult, JarKey } from "../types";
import { calculateTagStats } from "../tagStatsUtils";
import { getTagById, loadTags, tagsFromString, tagsToString } from "../tagsUtils";
import { loadAccounts } from "../accountsUtils";
import { getAccounts } from "../api";
import { Account } from "../types";

// ── Constants ────────────────────────────────────────────────────────────────

const JAR_KEYS: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];

const JAR_COLORS: Record<JarKey, string> = {
  NEC: "#007AFF", FFA: "#34C759", LTSS: "#FFD60A",
  PLAY: "#FF9500", EDUC: "#AF52DE", GIFT: "#5AC8FA",
};

const JAR_EMOJI: Record<JarKey, string> = {
  NEC: "🏠", FFA: "💰", LTSS: "🎯", PLAY: "🎉", EDUC: "📚", GIFT: "🎁",
};

// ── Types ────────────────────────────────────────────────────────────────────

type Mode = "spending" | "revenue";
type MainTab = "history" | "report";
type PeriodFilter = "all" | "month" | "prevmonth" | "90d" | "year";

export type HistoryUseEntry =
  | { kind: "spending"; row: SearchSpendingResult }
  | { kind: "revenue"; row: SearchRevenueResult };

interface HistoryViewProps {
  onUseEntry?: (entry: HistoryUseEntry) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (value: number | undefined | null, dec = 2) => {
  if (value == null || isNaN(value)) return "—";
  return value.toFixed(dec);
};

const parseDate = (v: string): Date | null => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const fmtDate = (v: string): string => {
  const d = parseDate(v);
  if (!d) return v;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
};

const getYearMonth = (dateStr: string) => dateStr?.slice(0, 7) ?? "";

// ── Component ────────────────────────────────────────────────────────────────

const HistoryView: React.FC<HistoryViewProps> = ({ onUseEntry }) => {

  // ── Tab & mode ────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>("history");
  const [mode, setMode] = useState<Mode>("spending");

  // ── History data ──────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spendings, setSpendings] = useState<SearchSpendingResult[]>([]);
  const [revenues, setRevenues] = useState<SearchRevenueResult[]>([]);

  // ── Filters ───────────────────────────────────────────────────────
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [jarFilter, setJarFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [destinationFilter, setDestinationFilter] = useState("all");

  // ── Card & edit state ─────────────────────────────────────────────
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<SearchSpendingResult | SearchRevenueResult | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [accountsList, setAccountsList] = useState<Account[]>(loadAccounts());

  // ── Report tab state ──────────────────────────────────────────────
  const now = new Date();
  const [reportMonth, setReportMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSpendings, setReportSpendings] = useState<SearchSpendingResult[]>([]);
  const [reportRevenues, setReportRevenues] = useState<SearchRevenueResult[]>([]);
  const [reportGenerated, setReportGenerated] = useState(false);

  // ── Search (debounced) ────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, m: Mode) => {
    setLoading(true);
    setError(null);
    try {
      if (m === "spending") {
        const res = await searchSpendings(q, 300);
        setSpendings(res.rows || []);
        setRevenues([]);
      } else {
        const res = await searchRevenues(q, 300);
        setRevenues(res.rows || []);
        setSpendings([]);
      }
    } catch (e: any) {
      setError(e.message || "Erreur inconnue");
      setSpendings([]);
      setRevenues([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Charger les comptes depuis le Sheet au montage
  useEffect(() => {
    getAccounts().then(accs => { if (accs.length > 0) setAccountsList(accs); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = query === "" ? 0 : 400;
    debounceRef.current = setTimeout(() => doSearch(query, mode), delay);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [mode, query, doSearch]);

  // ── Computed filters ──────────────────────────────────────────────
  const periodRange = useMemo((): { start: Date; end: Date } | null => {
    const now = new Date();
    if (periodFilter === "all") return null;
    if (periodFilter === "month") {
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    }
    if (periodFilter === "prevmonth") {
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
      };
    }
    if (periodFilter === "90d") {
      const s = new Date(now); s.setDate(s.getDate() - 90);
      return { start: s, end: now };
    }
    // year
    const s = new Date(now); s.setMonth(s.getMonth() - 12);
    return { start: s, end: now };
  }, [periodFilter]);

  // Label lisible pour la période active
  const periodLabel = useMemo(() => {
    if (!periodRange) return null;
    const now = new Date();
    if (periodFilter === "month")
      return now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    if (periodFilter === "prevmonth") {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return prev.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    }
    return null;
  }, [periodFilter, periodRange]);

  const filteredSpendings = useMemo(() =>
    spendings.filter(s => {
      if (periodRange) {
        const dt = parseDate(s.date);
        if (!dt || dt < periodRange.start || dt > periodRange.end) return false;
      }
      if (jarFilter !== "all" && s.jar !== jarFilter) return false;
      if (accountFilter !== "all" && s.account !== accountFilter) return false;
      return true;
    }),
    [spendings, periodRange, jarFilter, accountFilter]
  );

  const filteredRevenues = useMemo(() =>
    revenues.filter(r => {
      if (periodRange) {
        const dt = parseDate(r.date);
        if (!dt || dt < periodRange.start || dt > periodRange.end) return false;
      }
      if (typeFilter !== "all" && r.incomeType !== typeFilter) return false;
      if (destinationFilter !== "all" && r.destination !== destinationFilter) return false;
      return true;
    }),
    [revenues, periodRange, typeFilter, destinationFilter]
  );

  // On garde seulement les valeurs reconnues comme JarKey pour éviter que des données
  // parasites (tags, valeurs erronées) ne polluent le filtre jarre
  const uniqueJars = useMemo(() =>
    Array.from(new Set(spendings.map(s => s.jar).filter(Boolean)))
      .filter(j => JAR_KEYS.includes(j as JarKey)),
    [spendings]
  );
  const uniqueAccounts = useMemo(() => Array.from(new Set(spendings.map(s => s.account).filter(Boolean))), [spendings]);
  const uniqueTypes = useMemo(() => Array.from(new Set(revenues.map(r => r.incomeType).filter(Boolean))), [revenues]);
  const uniqueDestinations = useMemo(() => Array.from(new Set(revenues.map(r => r.destination).filter(Boolean))), [revenues]);

  const totalFiltered = useMemo(() =>
    mode === "spending"
      ? filteredSpendings.reduce((s, r) => s + (r.amount || 0), 0)
      : filteredRevenues.reduce((s, r) => s + (r.amount || 0), 0),
    [mode, filteredSpendings, filteredRevenues]
  );

  // ── Edit helpers ──────────────────────────────────────────────────
  const isSpendingRow = (row: any): row is SearchSpendingResult => "jar" in row;

  const startEdit = (row: SearchSpendingResult | SearchRevenueResult) => {
    setEditingRow(row);
    setEditError(null);
    if (isSpendingRow(row)) {
      setEditDraft({ date: row.date, description: row.description, amount: row.amount, jar: row.jar, account: row.account, tags: row.tags || "" });
    } else {
      setEditDraft({ date: row.date, source: row.source, amount: row.amount, value: row.value || "", method: row.method || "", rate: row.rate || "", destination: row.destination || "", incomeType: row.incomeType || "", tags: row.tags || "" });
    }
  };

  const cancelEdit = () => { setEditingRow(null); setEditError(null); };

  const handleSave = async () => {
    if (!editingRow) return;
    setEditSaving(true); setEditError(null);
    try {
      if (isSpendingRow(editingRow)) {
        if (!editingRow.rowIndex) throw new Error("rowIndex manquant — mettez à jour votre Apps Script.");
        await updateSpending(editingRow.rowIndex, {
          date: editDraft.date, description: editDraft.description,
          amount: parseFloat(editDraft.amount), jar: editDraft.jar,
          account: editDraft.account, tags: editDraft.tags || undefined,
        });
        setSpendings(prev => prev.map(s => s === editingRow ? { ...s, ...editDraft, amount: parseFloat(editDraft.amount) } : s));
      } else {
        if (!editingRow.rowIndex) throw new Error("rowIndex manquant — mettez à jour votre Apps Script.");
        await updateRevenue(editingRow.rowIndex, {
          date: editDraft.date, source: editDraft.source,
          amount: parseFloat(editDraft.amount) || undefined,
          value: editDraft.value || undefined, method: editDraft.method || undefined,
          rate: parseFloat(editDraft.rate) || undefined,
          destination: editDraft.destination || undefined,
          incomeType: editDraft.incomeType || undefined,
          tags: editDraft.tags || undefined,
        });
        setRevenues(prev => prev.map(r => r === editingRow ? { ...r, ...editDraft, amount: parseFloat(editDraft.amount) } : r));
      }
      setEditingRow(null);
    } catch (e: any) {
      setEditError(e.message || "Erreur de sauvegarde");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteSpending = async (row: SearchSpendingResult) => {
    if (!row.rowIndex) { alert("rowIndex manquant"); return; }
    if (!window.confirm(`Supprimer "${row.description}" (${row.amount} €) ?`)) return;
    try {
      await deleteSpending(row.rowIndex);
      setSpendings(prev => prev.filter(s => s !== row));
      setExpandedCard(null);
    } catch (e: any) { alert("Erreur : " + (e.message || String(e))); }
  };

  const handleDeleteRevenue = async (row: SearchRevenueResult) => {
    if (!row.rowIndex) { alert("rowIndex manquant"); return; }
    if (!window.confirm(`Supprimer "${row.source}" (${row.amount}) ?`)) return;
    try {
      await deleteRevenue(row.rowIndex);
      setRevenues(prev => prev.filter(r => r !== row));
      setExpandedCard(null);
    } catch (e: any) { alert("Erreur : " + (e.message || String(e))); }
  };

  // ── Report generation ─────────────────────────────────────────────
  const generateReport = async () => {
    setReportLoading(true);
    try {
      const [spRes, revRes] = await Promise.all([
        searchSpendings("", 500),
        searchRevenues("", 300),
      ]);
      setReportSpendings((spRes.rows || []).filter(s => getYearMonth(s.date) === reportMonth));
      setReportRevenues((revRes.rows || []).filter(r => getYearMonth(r.date) === reportMonth));
      setReportGenerated(true);
    } catch (e: any) {
      alert("Erreur génération rapport : " + e.message);
    } finally {
      setReportLoading(false);
    }
  };

  const reportTotalSpendings = useMemo(() => reportSpendings.reduce((s, r) => s + (r.amount || 0), 0), [reportSpendings]);
  const reportTotalRevenues = useMemo(() => reportRevenues.reduce((s, r) => s + (r.amount || 0), 0), [reportRevenues]);

  const reportByJar = useMemo(() => {
    const map: Record<string, number> = {};
    reportSpendings.forEach(s => { map[s.jar] = (map[s.jar] || 0) + (s.amount || 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [reportSpendings]);

  const reportTopDescriptions = useMemo(() => {
    const map: Record<string, number> = {};
    reportSpendings.forEach(s => { map[s.description] = (map[s.description] || 0) + (s.amount || 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [reportSpendings]);

  const reportSubscriptions = useMemo(() =>
    reportSpendings.filter(s => s.subscription && s.subscription !== ""),
    [reportSpendings]
  );

  /** Nombre de jours dans le mois du rapport */
  const reportDaysInMonth = useMemo(() => {
    const [y, m] = reportMonth.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }, [reportMonth]);

  /** Stats par tag pour le rapport + avg/jour */
  const reportTagStats = useMemo(() => {
    const stats = calculateTagStats(reportSpendings);
    return stats.map(s => ({
      ...s,
      avgPerDay: reportDaysInMonth > 0 ? s.totalAmount / reportDaysInMonth : 0,
    }));
  }, [reportSpendings, reportDaysInMonth]);

  // ── Styles ────────────────────────────────────────────────────────

  const tabBarStyle: React.CSSProperties = {
    display: "flex",
    background: "rgba(116,116,128,0.12)",
    borderRadius: 10,
    padding: 2,
  };

  const tabBtnStyle = (active: boolean, accent = "#1d1d1f"): React.CSSProperties => ({
    flex: 1,
    padding: "8px 0",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
    background: active ? "var(--bg-card)" : "transparent",
    color: active ? accent : "var(--text-muted)",
    boxShadow: active ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
  });

  const pillStyle = (active: boolean, color = "#007AFF"): React.CSSProperties => ({
    flexShrink: 0,
    padding: "6px 14px",
    borderRadius: 20,
    border: `1.5px solid ${active ? color : "var(--border-color)"}`,
    background: active ? `${color}18` : "var(--bg-card)",
    color: active ? color : "var(--text-muted)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  const actionBtnStyle = (variant: "primary" | "edit" | "delete" | "ghost"): React.CSSProperties => {
    const map = {
      primary: { bg: "#EAF3FF", color: "#007AFF" },
      edit:    { bg: "#FFF5E6", color: "#FF9500" },
      delete:  { bg: "#FFEDED", color: "#FF3B30" },
      ghost:   { bg: "rgba(0,0,0,0.04)", color: "var(--text-muted)" },
    };
    const c = map[variant];
    return { flex: "1 1 auto", padding: "9px 10px", borderRadius: 10, border: "none", background: c.bg, color: c.color, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "center" };
  };

  // ── Render helpers ────────────────────────────────────────────────

  const renderPills = (
    items: { label: string; value: string }[],
    current: string,
    onChange: (v: string) => void,
    color = "#007AFF",
    sectionLabel?: string
  ) => (
    <div>
      {sectionLabel && (
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          {sectionLabel}
        </div>
      )}
      {/* pills-scroll: classe CSS pour le scroll horizontal cross-platform */}
      <div className="pills-scroll">
        {items.map(item => (
          <button key={item.value} style={pillStyle(current === item.value, color)} onClick={() => onChange(item.value)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );

  const renderEditForm = (row: SearchSpendingResult | SearchRevenueResult) => {
    const isSpending = isSpendingRow(row);
    return (
      <div style={{ borderTop: "1px solid var(--border-color)", padding: 16, background: "rgba(0,0,0,0.02)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {/* Common */}
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Date
            <input type="date" value={editDraft.date || ""} onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))}
              style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Montant
            <input type="number" step="0.01" value={editDraft.amount || ""} onChange={e => setEditDraft(d => ({ ...d, amount: e.target.value }))}
              style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
          </label>

          {isSpending ? (<>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)", gridColumn: "1 / -1" }}>
              Description
              <input type="text" value={editDraft.description || ""} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Jarre
              <select value={editDraft.jar || ""} onChange={e => setEditDraft(d => ({ ...d, jar: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }}>
                {JAR_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Compte
              <select value={editDraft.account || ""} onChange={e => setEditDraft(d => ({ ...d, account: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }}>
                {accountsList.map(a => <option key={a.id} value={a.name}>{a.icon} {a.name}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)", gridColumn: "1 / -1" }}>
              Tags
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, background: "var(--bg-card)", minHeight: 42 }}>
                {loadTags().filter(t => t.favori !== false).map(tag => {
                  const selected = tagsFromString(editDraft.tags || "").includes(tag.id);
                  return (
                    <button key={tag.id} type="button"
                      onClick={() => {
                        const cur = tagsFromString(editDraft.tags || "");
                        const next = selected ? cur.filter(id => id !== tag.id) : [...cur, tag.id];
                        setEditDraft(d => ({ ...d, tags: tagsToString(next) }));
                      }}
                      style={{ padding: "4px 10px", borderRadius: 20, border: `1.5px solid ${tag.color}`, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                        background: selected ? tag.color : "transparent", color: selected ? "#fff" : tag.color }}>
                      {tag.emoji} {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </>) : (<>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)", gridColumn: "1 / -1" }}>
              Source
              <input type="text" value={editDraft.source || ""} onChange={e => setEditDraft(d => ({ ...d, source: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Méthode
              <input type="text" value={editDraft.method || ""} onChange={e => setEditDraft(d => ({ ...d, method: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Destination
              <input type="text" value={editDraft.destination || ""} onChange={e => setEditDraft(d => ({ ...d, destination: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Taux
              <input type="number" step="0.000001" value={editDraft.rate || ""} onChange={e => setEditDraft(d => ({ ...d, rate: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Type
              <input type="text" value={editDraft.incomeType || ""} onChange={e => setEditDraft(d => ({ ...d, incomeType: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
          </>)}
        </div>
        {editError && <p style={{ color: "#FF3B30", fontSize: 13, marginBottom: 10 }}>⚠️ {editError}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={actionBtnStyle("primary")} onClick={handleSave} disabled={editSaving}>
            {editSaving ? "⏳ Sauvegarde…" : "💾 Enregistrer"}
          </button>
          <button style={actionBtnStyle("ghost")} onClick={cancelEdit}>Annuler</button>
        </div>
      </div>
    );
  };

  const renderSpendingCard = (row: SearchSpendingResult, idx: number) => {
    const cardKey = `sp-${row.rowIndex ?? idx}`;
    const isExpanded = expandedCard === cardKey;
    const isEditing = editingRow === row;
    const jarColor = JAR_COLORS[row.jar as JarKey] || "#aaa";
    const jarEmoji = JAR_EMOJI[row.jar as JarKey] || "💸";

    return (
      <div key={cardKey} style={{ background: "var(--bg-card)", borderRadius: 16, boxShadow: isExpanded || isEditing ? "var(--shadow-md)" : "var(--shadow-sm)", overflow: "hidden", transition: "box-shadow 0.2s" }}>
        {/* Card header — tappable */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
          onClick={() => { if (!isEditing) setExpandedCard(isExpanded ? null : cardKey); }}
        >
          <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `${jarColor}20`, fontSize: 20, flexShrink: 0 }}>
            {jarEmoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.description}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmtDate(row.date)}</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: `${jarColor}20`, color: jarColor }}>{row.jar}</span>
              {row.account && <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 6, background: "rgba(0,0,0,0.05)", color: "var(--text-muted)" }}>{row.account}</span>}
              {row.subscription && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, background: "#AF52DE20", color: "#AF52DE" }}>🔄 {row.subscription}</span>}
              {row.tags && row.tags.split(",").slice(0, 3).map(t => t.trim()).filter(Boolean).map(t => (
                <span key={t} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, background: "rgba(0,0,0,0.05)", color: "var(--text-muted)" }}>#{t}</span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: "#FF3B30" }}>-{fmt(row.amount)}€</span>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{isExpanded ? "▲" : "▼"}</div>
          </div>
        </div>

        {/* Edit form */}
        {isEditing && renderEditForm(row)}

        {/* Expanded actions */}
        {isExpanded && !isEditing && (
          <div style={{ borderTop: "1px solid var(--border-color)", padding: "12px 16px" }}>
            {row.tags && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {row.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                  <span key={t} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(0,0,0,0.05)", color: "var(--text-muted)" }}>#{t}</span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {onUseEntry && (
                <button style={actionBtnStyle("primary")} onClick={() => onUseEntry({ kind: "spending", row })}>↻ Réutiliser</button>
              )}
              <button style={actionBtnStyle("edit")} onClick={() => startEdit(row)}>✏️ Modifier</button>
              <button style={actionBtnStyle("delete")} onClick={() => handleDeleteSpending(row)}>🗑️</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRevenueCard = (row: SearchRevenueResult, idx: number) => {
    const cardKey = `rev-${row.rowIndex ?? idx}`;
    const isExpanded = expandedCard === cardKey;
    const isEditing = editingRow === row;

    return (
      <div key={cardKey} style={{ background: "var(--bg-card)", borderRadius: 16, boxShadow: isExpanded || isEditing ? "var(--shadow-md)" : "var(--shadow-sm)", overflow: "hidden", transition: "box-shadow 0.2s" }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
          onClick={() => { if (!isEditing) setExpandedCard(isExpanded ? null : cardKey); }}
        >
          <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "#E8FAF0", fontSize: 20, flexShrink: 0 }}>
            💵
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.source}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmtDate(row.date)}</span>
              {row.method && <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 6, background: "rgba(0,0,0,0.05)", color: "var(--text-muted)" }}>{row.method}</span>}
              {row.destination && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: "#34C75920", color: "#34C759" }}>{row.destination}</span>}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: "#34C759" }}>+{fmt(row.amount)}€</span>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{isExpanded ? "▲" : "▼"}</div>
          </div>
        </div>

        {isEditing && renderEditForm(row)}

        {isExpanded && !isEditing && (
          <div style={{ borderTop: "1px solid var(--border-color)", padding: "12px 16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {row.cryptoQuantity > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>Crypto</span>
                  <span style={{ fontWeight: 600 }}>{fmt(row.cryptoQuantity, 8)}</span>
                </div>
              )}
              {row.rate > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>Taux</span>
                  <span style={{ fontWeight: 600 }}>{fmt(row.rate, 4)}</span>
                </div>
              )}
              {row.incomeType && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>Type</span>
                  <span style={{ fontWeight: 600 }}>{row.incomeType}</span>
                </div>
              )}
              {row.value && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>Valeur</span>
                  <span style={{ fontWeight: 600 }}>{row.value}</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {onUseEntry && (
                <button style={actionBtnStyle("primary")} onClick={() => onUseEntry({ kind: "revenue", row })}>↻ Réutiliser</button>
              )}
              <button style={actionBtnStyle("edit")} onClick={() => startEdit(row)}>✏️ Modifier</button>
              <button style={actionBtnStyle("delete")} onClick={() => handleDeleteRevenue(row)}>🗑️</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Report section ────────────────────────────────────────────────

  const renderReport = () => {
    const balance = reportTotalRevenues - reportTotalSpendings;
    const monthLabel = (() => {
      try { return new Date(reportMonth + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); }
      catch { return reportMonth; }
    })();

    return (
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Month picker card */}
        <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-sm)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
            Rapport mensuel
          </div>
          {/* Navigation mois */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => {
                const [y, m] = reportMonth.split("-").map(Number);
                const d = new Date(y, m - 2, 1);
                setReportMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                setReportGenerated(false);
              }}
              style={{ width: 40, height: 40, borderRadius: 10, border: "1.5px solid var(--border-color)", background: "var(--bg-card)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--text-main)" }}
            >‹</button>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-main)", textTransform: "capitalize" }}>
                {monthLabel}
              </div>
              {/* Picker natif en backup (invisible mais accessible) */}
              <input
                type="month"
                value={reportMonth}
                onChange={e => { setReportMonth(e.target.value); setReportGenerated(false); }}
                style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
              />
            </div>
            <button
              onClick={() => {
                const [y, m] = reportMonth.split("-").map(Number);
                const d = new Date(y, m, 1);
                const nowM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
                const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                if (next <= nowM) { setReportMonth(next); setReportGenerated(false); }
              }}
              style={{ width: 40, height: 40, borderRadius: 10, border: "1.5px solid var(--border-color)", background: "var(--bg-card)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: (() => { const [y,m] = reportMonth.split("-").map(Number); const d = new Date(y,m,1); const nowM = new Date(); return d > nowM ? "var(--text-muted)" : "var(--text-main)"; })() }}
            >›</button>
          </div>
          <button
            onClick={generateReport}
            disabled={reportLoading}
            style={{ width: "100%", padding: "12px", background: "#007AFF", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
          >
            {reportLoading ? "⏳ Chargement…" : "📊 Générer le rapport"}
          </button>
        </div>

        {reportGenerated && (<>
          {/* Summary */}
          <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-sm)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
              Résumé · {monthLabel}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div style={{ padding: "14px", background: "#FFEDED", borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: "#FF3B30", fontWeight: 700, marginBottom: 6 }}>DÉPENSES</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#FF3B30", lineHeight: 1 }}>{fmt(reportTotalSpendings)} €</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{reportSpendings.length} transactions</div>
              </div>
              <div style={{ padding: "14px", background: "#E8FAF0", borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: "#34C759", fontWeight: 700, marginBottom: 6 }}>REVENUS</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#34C759", lineHeight: 1 }}>{fmt(reportTotalRevenues)} €</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{reportRevenues.length} transactions</div>
              </div>
            </div>
            <div style={{ padding: "14px", background: balance >= 0 ? "#EAF3FF" : "#FFF5E6", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 500 }}>Balance du mois</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: balance >= 0 ? "#007AFF" : "#FF9500" }}>
                {balance >= 0 ? "+" : ""}{fmt(balance)} €
              </span>
            </div>
          </div>

          {/* By jar */}
          {reportByJar.length > 0 && (
            <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
                Répartition par jarre
              </div>
              {reportByJar.map(([jar, amount]) => {
                const pct = reportTotalSpendings > 0 ? (amount / reportTotalSpendings) * 100 : 0;
                const color = JAR_COLORS[jar as JarKey] || "#ccc";
                const emoji = JAR_EMOJI[jar as JarKey] || "💰";
                return (
                  <div key={jar} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{emoji} {jar}</span>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{fmt(amount)} €</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: "var(--border-color)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Top transactions */}
          {reportTopDescriptions.length > 0 && (
            <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
                Top dépenses
              </div>
              {reportTopDescriptions.map(([desc, amount], idx) => (
                <div key={desc} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 0", borderBottom: idx < reportTopDescriptions.length - 1 ? "1px solid var(--border-color)" : "none" }}>
                  {/* Numéro */}
                  <span style={{ width: 24, height: 24, borderRadius: 12, background: "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0, marginTop: 1 }}>
                    {idx + 1}
                  </span>
                  {/* Libellé — prend tout l'espace disponible, peut passer à la ligne */}
                  <span style={{ flex: 1, fontSize: 14, color: "var(--text-main)", lineHeight: 1.4, wordBreak: "break-word", minWidth: 0 }}>
                    {desc}
                  </span>
                  {/* Montant — toujours collé à droite, jamais tronqué */}
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#FF3B30", flexShrink: 0, whiteSpace: "nowrap", paddingLeft: 8 }}>
                    {fmt(amount)} €
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Tag avg/day */}
          {reportTagStats.length > 0 && (
            <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                🏷️ Dépenses par tag
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>
                Moyenne / jour sur {reportDaysInMonth} jours
              </div>
              {reportTagStats.map(tag => {
                const barMax = reportTagStats[0]?.totalAmount || 1;
                return (
                  <div key={tag.tagId} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 15, flexShrink: 0, width: 20, textAlign: "center" }}>{tag.emoji}</span>
                      <span style={{ fontSize: 13, color: "var(--text-main)", flex: 1, fontWeight: 600 }}>{tag.tagName}</span>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#FF3B30" }}>{fmt(tag.totalAmount)} €</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>
                          ≈ {fmt(tag.avgPerDay, 1)} €/j
                        </span>
                      </div>
                    </div>
                    <div style={{ height: 5, background: "var(--border-color)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${(tag.totalAmount / barMax) * 100}%`, background: tag.color, borderRadius: 3, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Subscriptions */}
          {reportSubscriptions.length > 0 && (
            <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
                🔄 Abonnements actifs
              </div>
              {reportSubscriptions.map((sub, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: idx < reportSubscriptions.length - 1 ? "1px solid var(--border-color)" : "none" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-main)" }}>{sub.description}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                      {sub.subscription} · {sub.jar}
                    </div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#FF3B30" }}>{fmt(sub.amount)} €</span>
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {reportSpendings.length === 0 && reportRevenues.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Aucune transaction</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Aucune donnée pour {monthLabel}</div>
            </div>
          )}
        </>)}
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────────

  return (
    <main style={{ background: "var(--bg-body)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", paddingBottom: 32 }}>

        {/* Header */}
        <div style={{ padding: "20px 20px 0", display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-main)", letterSpacing: -0.5 }}>
            Rapports
          </h2>
          {/* Main tab bar */}
          <div style={tabBarStyle}>
            <button style={tabBtnStyle(mainTab === "history")} onClick={() => setMainTab("history")}>
              📋 Historique
            </button>
            <button style={tabBtnStyle(mainTab === "report", "#007AFF")} onClick={() => setMainTab("report")}>
              📊 Rapport mensuel
            </button>
          </div>
        </div>

        <div style={{ height: 20 }} />

        {/* ═══ HISTORY TAB ═══ */}
        {mainTab === "history" && (<>
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Mode toggle */}
            <div style={tabBarStyle}>
              <button
                style={tabBtnStyle(mode === "spending", "#FF3B30")}
                onClick={() => { setMode("spending"); setQuery(""); setExpandedCard(null); cancelEdit(); setPeriodFilter("all"); setJarFilter("all"); setAccountFilter("all"); }}
              >
                💸 Dépenses
              </button>
              <button
                style={tabBtnStyle(mode === "revenue", "#34C759")}
                onClick={() => { setMode("revenue"); setQuery(""); setExpandedCard(null); cancelEdit(); setPeriodFilter("all"); setTypeFilter("all"); setDestinationFilter("all"); }}
              >
                💵 Revenus
              </button>
            </div>

            {/* Search */}
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
              <input
                type="text"
                placeholder={mode === "spending" ? "Rechercher une dépense…" : "Rechercher un revenu…"}
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoComplete="off"
                style={{ width: "100%", padding: "11px 12px 11px 38px", border: "1.5px solid var(--border-color)", borderRadius: 12, fontSize: 15, background: "var(--bg-card)", color: "var(--text-main)", outline: "none" }}
              />
              {loading && (
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text-muted)" }}>⏳</span>
              )}
            </div>

            {/* Period pills */}
            {renderPills(
              [
                { label: "Tout", value: "all" },
                { label: "Ce mois", value: "month" },
                { label: "Mois préc.", value: "prevmonth" },
                { label: "90j", value: "90d" },
                { label: "1 an", value: "year" },
              ],
              periodFilter, (v) => setPeriodFilter(v as PeriodFilter), "#007AFF", "Période"
            )}

            {/* Contextual filter pills — on affiche toujours les 6 jarres */}
            {mode === "spending" && renderPills(
              [{ label: "Toutes", value: "all" }, ...JAR_KEYS.map(j => ({ label: `${JAR_EMOJI[j]} ${j}`, value: j }))],
              jarFilter, setJarFilter, "#007AFF", "Jarre"
            )}
            {mode === "spending" && uniqueAccounts.length > 1 && renderPills(
              [{ label: "Tous", value: "all" }, ...uniqueAccounts.map(a => ({ label: a, value: a }))],
              accountFilter, setAccountFilter, "#34C759", "Compte"
            )}
            {mode === "revenue" && uniqueTypes.length > 1 && renderPills(
              [{ label: "Tous", value: "all" }, ...uniqueTypes.map(t => ({ label: t, value: t }))],
              typeFilter, setTypeFilter, "#34C759", "Type de revenu"
            )}
            {mode === "revenue" && uniqueDestinations.length > 1 && renderPills(
              [{ label: "Toutes", value: "all" }, ...uniqueDestinations.map(d => ({ label: d, value: d }))],
              destinationFilter, setDestinationFilter, "#FF9500", "Destination"
            )}
          </div>

          {/* Summary bar */}
          {!loading && (mode === "spending" ? filteredSpendings.length : filteredRevenues.length) > 0 && (
            <div style={{ padding: "10px 20px" }}>
              <div style={{ background: "var(--bg-card)", borderRadius: 12, boxShadow: "var(--shadow-sm)", padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {(mode === "spending" ? filteredSpendings.length : filteredRevenues.length)} transaction{(mode === "spending" ? filteredSpendings.length : filteredRevenues.length) !== 1 ? "s" : ""}
                  </span>
                  {periodLabel && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6, fontStyle: "italic" }}>
                      · {periodLabel}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 17, fontWeight: 700, color: mode === "spending" ? "#FF3B30" : "#34C759" }}>
                  {mode === "spending" ? "-" : "+"}{fmt(totalFiltered)} €
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ margin: "10px 20px", padding: "12px 16px", background: "#FFEDED", borderRadius: 12, color: "#FF3B30", fontSize: 14 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Cards */}
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {mode === "spending" && filteredSpendings.map((row, i) => renderSpendingCard(row, i))}
            {mode === "revenue" && filteredRevenues.map((row, i) => renderRevenueCard(row, i))}

            {/* Empty state */}
            {!loading && !error && (mode === "spending" ? filteredSpendings : filteredRevenues).length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>🔍</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                  {query ? "Aucun résultat" : "Aucune transaction"}
                </div>
                <div style={{ fontSize: 13 }}>
                  {query ? `Aucune transaction pour "${query}"` : "Essayez d'élargir vos filtres"}
                </div>
              </div>
            )}
          </div>
        </>)}

        {/* ═══ REPORT TAB ═══ */}
        {mainTab === "report" && renderReport()}

      </div>
    </main>
  );
};

export default HistoryView;
