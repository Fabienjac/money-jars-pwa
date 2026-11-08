// src/components/HistoryView.tsx - VERSION REFACTORISÉE (Features 4 & 5)
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  fetchAllSpendings, fetchAllRevenues,
  updateSpending, updateRevenue,
  deleteSpending, deleteRevenue,
} from "../api";
import { SearchSpendingResult, SearchRevenueResult, JarKey } from "../types";
import { calculateTagStats } from "../tagStatsUtils";
import { getTagById, loadTags, tagsFromString, tagsToString } from "../tagsUtils";
import { loadAccounts } from "../accountsUtils";
import { getAccounts } from "../api";
import { Account } from "../types";

import { supabase } from "../lib/supabase";
import { cacheVersion, invalidateHistoryCache, readHistoryCache, rememberHistoryRows, writeHistoryCache } from "../historyCache";
import { currencySymbol as curSym } from "../baseCurrency";
import { useT, t as tr, localeTag } from "../i18n";
import { inBounds, periodBounds, type PeriodFilter } from "../historyPeriod";
import {
  NO_TAG, csvNumber, dayKey, dayTotals, matchesSearch, matchesTag, parseMinAmount, passesMinAmount, sortRows, toCsv,
  type SortKey,
} from "../historyFilters";
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
/** Nombre de lignes affichées d'un coup ; le reste s'ouvre par « Afficher plus » (les totaux portent sur tout). */
const PAGE = 50;
const FILTERS_OPEN_KEY = "mjars:historyFiltersOpen";
const SORT_LABEL_KEYS = {
  dateDesc: "hist.sortNewest", dateAsc: "hist.sortOldest", amountDesc: "hist.sortBiggest", amountAsc: "hist.sortSmallest",
} as const;

export type HistoryUseEntry =
  | { kind: "spending"; row: SearchSpendingResult }
  | { kind: "revenue"; row: SearchRevenueResult };

interface HistoryViewProps {
  onUseEntry?: (entry: HistoryUseEntry) => void;
  onImport?: () => void;
  view?: MainTab;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (value: number | undefined | null, dec = 2) => {
  if (value == null || isNaN(value)) return "—";
  return value.toFixed(dec);
};

/**
 * Montant signé pour l'affichage. Une dépense s'affiche « - » et un revenu « + », sauf si le montant est négatif
 * (remboursement, correction) : le signe s'inverse au lieu d'afficher « --20 ».
 */
const signedAmount = (amount: number, kind: Mode): { sign: "+" | "-"; abs: number; refund: boolean } => {
  const neg = (amount || 0) < 0;
  const spending = kind === "spending";
  return { sign: spending !== neg ? "-" : "+", abs: Math.abs(amount || 0), refund: neg };
};

const parseDate = (v: string): Date | null => {
  if (!v) return null;
  // DD/MM/YYYY → forcer l'interprétation correcte
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
    const [d, m, y] = v.split("/");
    return new Date(`${y}-${m}-${d}T00:00:00`);
  }
  const d = new Date(v.includes("T") ? v : v + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
};

const fmtDate = (v: string): string => {
  const d = parseDate(v);
  if (!d) return v;
  return d.toLocaleDateString(localeTag(), { day: "2-digit", month: "short", year: "numeric" });
};

const getYearMonth = (dateStr: string): string => {
  if (!dateStr) return "";
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [, m, y] = dateStr.split("/");
    return `${y}-${m}`;
  }
  // YYYY-MM-DD (Supabase default)
  return dateStr.slice(0, 7);
};

// ── Component ────────────────────────────────────────────────────────────────

const HistoryView: React.FC<HistoryViewProps> = ({ onUseEntry, view, onImport }) => {
  const t = useT();

  // ── Tab & mode ────────────────────────────────────────────────────
  const [mainTabState, setMainTab] = useState<MainTab>("history");
  const mainTab: MainTab = view ?? mainTabState;
  const [mode, setMode] = useState<Mode>("spending");

  // ── History data ──────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spendings, setSpendings] = useState<SearchSpendingResult[]>([]);
  const [revenues, setRevenues] = useState<SearchRevenueResult[]>([]);

  // ── Filters ───────────────────────────────────────────────────────
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [customFrom, setCustomFrom] = useState(""); // AAAA-MM-JJ (période personnalisée)
  const [customTo, setCustomTo] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(FILTERS_OPEN_KEY) !== "0"; } catch { return true; }
  });
  const [jarFilter, setJarFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [destinationFilter, setDestinationFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [minAmountRaw, setMinAmountRaw] = useState(""); // montant minimum saisi (« 100 »)
  const [sort, setSort] = useState<SortKey>("dateDesc");

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

  // ── Search ────────────────────────────────────────────────────────
  // Tout l'historique est lu une fois (par pages) ; la recherche, les filtres et le tri se font ensuite sur l'appareil :
  // pas de nouvelle requête à chaque frappe, et la recherche peut porter sur les étiquettes et le compte, pas
  // seulement sur le libellé.
  // Cache en mémoire : on affiche aussitôt la copie qu'on a (visite précédente, autre mode), puis on la rafraîchit
  // discrètement si elle a plus de quelques secondes. Toute écriture de données vide ce cache (voir api.ts).
  const reqRef = useRef(0); // numéro de la dernière lecture lancée : une lecture plus ancienne est ignorée
  const userRef = useRef<string | null>(null);
  const editingRef = useRef(false); // une modification est en cours : on ne remplace pas les lignes dessous
  const modeRef = useRef<Mode>("spending");

  const doSearch = useCallback(async (m: Mode) => {
    const req = ++reqRef.current;
    setError(null);
    const { data } = await supabase.auth.getSession(); // lecture locale, sans réseau
    if (req !== reqRef.current) return;
    const uid = data.session?.user.id ?? null;
    userRef.current = uid;

    const apply = (rows: SearchSpendingResult[] | SearchRevenueResult[]) => {
      if (m === "spending") { setSpendings(rows as SearchSpendingResult[]); setRevenues([]); }
      else { setRevenues(rows as SearchRevenueResult[]); setSpendings([]); }
    };

    const cached = uid ? readHistoryCache<SearchSpendingResult | SearchRevenueResult>(uid, m) : null;
    if (cached) {
      apply(cached.rows as SearchSpendingResult[] | SearchRevenueResult[]);
      setLoading(false);
      if (cached.fresh) return;
    } else {
      setLoading(true);
    }

    const startedAt = cacheVersion();
    try {
      const rows = m === "spending" ? await fetchAllSpendings() : await fetchAllRevenues();
      if (uid) writeHistoryCache<unknown>(uid, m, rows, startedAt);
      if (req !== reqRef.current) return; // un autre chargement est parti entre-temps
      if (cached && editingRef.current) return; // rafraîchissement discret : pas pendant une modification
      apply(rows);
    } catch (e: any) {
      if (req !== reqRef.current) return;
      if (cached) return; // la copie affichée reste valable ; l'échec du rafraîchissement n'est pas bloquant
      setError(e.message || t("hist.unknownError"));
      setSpendings([]);
      setRevenues([]);
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, []);

  // Charger les comptes depuis le Sheet au montage
  useEffect(() => {
    getAccounts().then(accs => { if (accs.length > 0) setAccountsList(accs); }).catch(() => {});
  }, []);

  useEffect(() => {
    modeRef.current = mode;
    doSearch(mode);
  }, [mode, doSearch]);

  // Une dépense ou un revenu vient d'être enregistré ailleurs (formulaire rapide, vocal…) : on relit
  useEffect(() => {
    const reload = () => { invalidateHistoryCache(); doSearch(modeRef.current); };
    window.addEventListener("mjars:transactionSaved", reload);
    window.addEventListener("mjars:revenueSaved", reload);
    return () => {
      window.removeEventListener("mjars:transactionSaved", reload);
      window.removeEventListener("mjars:revenueSaved", reload);
    };
  }, [doSearch]);

  useEffect(() => { editingRef.current = editingRow != null; }, [editingRow]);

  // ── Computed filters ──────────────────────────────────────────────
  const periodRange = useMemo(() => periodBounds(periodFilter, new Date(), customFrom, customTo), [periodFilter, customFrom, customTo]);

  // Label lisible pour la période active
  const periodLabel = useMemo(() => {
    if (!periodRange) return null;
    const now = new Date();
    if (periodFilter === "custom") {
      const f = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(localeTag(), { day: "numeric", month: "short", year: "numeric" });
      if (customFrom && customTo) return tr("hist.rangeBoth", { from: f(customFrom), to: f(customTo) });
      return customFrom ? tr("hist.rangeFrom", { from: f(customFrom) }) : tr("hist.rangeTo", { to: f(customTo) });
    }
    if (periodFilter === "month")
      return now.toLocaleDateString(localeTag(), { month: "long", year: "numeric" });
    if (periodFilter === "prevmonth") {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return prev.toLocaleDateString(localeTag(), { month: "long", year: "numeric" });
    }
    return null;
  }, [periodFilter, periodRange, customFrom, customTo]);

  const minAmount = useMemo(() => parseMinAmount(minAmountRaw), [minAmountRaw]);

  /** Noms des étiquettes d'une ligne (pour la recherche) : « Alimentation » se trouve en tapant « alim ». */
  const tagNames = (tags: string | undefined) =>
    tagsFromString(tags).map((id) => getTagById(id)?.name ?? id).join(" ");

  const timeOf = (dateStr: string) => parseDate(dateStr)?.getTime() ?? 0;

  const filteredSpendings = useMemo(() =>
    sortRows(
      spendings.filter(s => {
        if (!inBounds(parseDate(s.date), periodRange)) return false;
        if (jarFilter !== "all" && s.jar !== jarFilter) return false;
        if (accountFilter !== "all" && s.account !== accountFilter) return false;
        if (!matchesTag(tagsFromString(s.tags), tagFilter)) return false;
        if (!passesMinAmount(s.amount, minAmount)) return false;
        return matchesSearch([s.description, tagNames(s.tags), s.account, s.jar, s.subscription], query);
      }),
      sort, (s) => timeOf(s.date), (s) => s.amount || 0
    ),
    [spendings, periodRange, jarFilter, accountFilter, tagFilter, minAmount, query, sort]
  );

  const filteredRevenues = useMemo(() =>
    sortRows(
      revenues.filter(r => {
        if (!inBounds(parseDate(r.date), periodRange)) return false;
        if (typeFilter !== "all" && r.incomeType !== typeFilter) return false;
        if (destinationFilter !== "all" && r.destination !== destinationFilter) return false;
        if (!matchesTag(tagsFromString(r.tags), tagFilter)) return false;
        if (!passesMinAmount(r.amount, minAmount)) return false;
        return matchesSearch([r.source, tagNames(r.tags), r.destination, r.incomeType, r.method], query);
      }),
      sort, (r) => timeOf(r.date), (r) => r.amount || 0
    ),
    [revenues, periodRange, typeFilter, destinationFilter, tagFilter, minAmount, query, sort]
  );

  // Étiquettes présentes dans les lignes chargées, les plus fréquentes d'abord ; « sans étiquette » si certaines n'en ont pas
  const tagOptions = useMemo(() => {
    const rows = mode === "spending" ? spendings : revenues;
    const counts = new Map<string, number>();
    let untagged = 0;
    for (const r of rows) {
      const ids = tagsFromString(r.tags);
      if (ids.length === 0) untagged++;
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const items = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => {
        const tag = getTagById(id);
        return { label: tag ? `${tag.emoji} ${tag.name}` : id, value: id };
      });
    return { items, hasUntagged: untagged > 0 };
  }, [mode, spendings, revenues]);

  // Titres par jour : seulement quand la liste est triée par date (sinon les jours se mélangent)
  const groupByDay = sort === "dateDesc" || sort === "dateAsc";
  const rowDayKey = (dateStr: string) => dayKey(parseDate(dateStr));
  const dayStats = useMemo(
    () => dayTotals<{ date: string; amount: number }>(
      mode === "spending" ? filteredSpendings : filteredRevenues,
      (r) => dayKey(parseDate(r.date)),
      (r) => r.amount || 0
    ),
    [mode, filteredSpendings, filteredRevenues]
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

  // Un nouveau filtre ou une nouvelle recherche repart de la première page
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [mode, query, periodFilter, customFrom, customTo, jarFilter, accountFilter, typeFilter, destinationFilter, tagFilter, minAmountRaw, sort]);

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
        if (!editingRow.rowIndex) throw new Error(t("hist.rowMissingScript"));
        const res = await updateSpending(editingRow.rowIndex, {
          date: editDraft.date, description: editDraft.description,
          amount: parseFloat(editDraft.amount), jar: editDraft.jar,
          account: editDraft.account, tags: editDraft.tags || undefined,
        });
        if (!res.ok) throw new Error(res.error || t("hist.saveError"));
        const next = spendings.map(s => s === editingRow ? { ...s, ...editDraft, amount: parseFloat(editDraft.amount) } as SearchSpendingResult : s);
        setSpendings(next);
        if (userRef.current) rememberHistoryRows(userRef.current, "spending", next);
      } else {
        if (!editingRow.rowIndex) throw new Error(t("hist.rowMissingScript"));
        const res = await updateRevenue(editingRow.rowIndex, {
          date: editDraft.date, source: editDraft.source,
          amount: parseFloat(editDraft.amount) || undefined,
          value: editDraft.value || undefined, method: editDraft.method || undefined,
          rate: parseFloat(editDraft.rate) || undefined,
          destination: editDraft.destination || undefined,
          incomeType: editDraft.incomeType || undefined,
          tags: editDraft.tags || undefined,
        });
        if (!res.ok) throw new Error(res.error || t("hist.saveError"));
        const next = revenues.map(r => r === editingRow ? { ...r, ...editDraft, amount: parseFloat(editDraft.amount) } as SearchRevenueResult : r);
        setRevenues(next);
        if (userRef.current) rememberHistoryRows(userRef.current, "revenue", next);
      }
      setEditingRow(null);
    } catch (e: any) {
      setEditError(e.message || t("hist.saveError"));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteSpending = async (row: SearchSpendingResult) => {
    if (!row.rowIndex) { alert(t("hist.rowMissing")); return; }
    if (!window.confirm(t("hist.confirmDelete", { name: row.description, amount: `${row.amount} ${curSym()}` }))) return;
    try {
      const res = await deleteSpending(row.rowIndex);
      if (!res.ok) throw new Error(res.error || t("hist.unknownError"));
      const next = spendings.filter(s => s !== row);
      setSpendings(next);
      if (userRef.current) rememberHistoryRows(userRef.current, "spending", next);
      setExpandedCard(null);
    } catch (e: any) { alert(t("hist.error", { msg: e.message || String(e) })); }
  };

  const handleDeleteRevenue = async (row: SearchRevenueResult) => {
    if (!row.rowIndex) { alert(t("hist.rowMissing")); return; }
    if (!window.confirm(t("hist.confirmDelete", { name: row.source, amount: `${row.amount} ${curSym()}` }))) return;
    try {
      const res = await deleteRevenue(row.rowIndex);
      if (!res.ok) throw new Error(res.error || t("hist.unknownError"));
      const next = revenues.filter(r => r !== row);
      setRevenues(next);
      if (userRef.current) rememberHistoryRows(userRef.current, "revenue", next);
      setExpandedCard(null);
    } catch (e: any) { alert(t("hist.error", { msg: e.message || String(e) })); }
  };

  // ── Report generation ─────────────────────────────────────────────
  const generateReport = async () => {
    setReportLoading(true);
    try {
      const [spRes, revRes] = await Promise.all([
        fetchAllSpendings(),
        fetchAllRevenues(),
      ]);
      setReportSpendings(spRes.filter(s => getYearMonth(s.date) === reportMonth));
      setReportRevenues(revRes.filter(r => getYearMonth(r.date) === reportMonth));
      setReportGenerated(true);
    } catch (e: any) {
      alert(t("hist.reportError", { msg: e.message }));
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

  const toggleFilters = () => {
    setFiltersOpen((v) => {
      try { localStorage.setItem(FILTERS_OPEN_KEY, v ? "0" : "1"); } catch { /* sans importance */ }
      return !v;
    });
  };

  const resetFilters = () => {
    setPeriodFilter("all"); setCustomFrom(""); setCustomTo("");
    setJarFilter("all"); setAccountFilter("all"); setTypeFilter("all"); setDestinationFilter("all");
    setTagFilter("all"); setMinAmountRaw(""); setSort("dateDesc");
  };

  /** Export CSV de toutes les lignes filtrées (pas seulement les 50 affichées), dans l'ordre courant. */
  const exportCsv = () => {
    const decimalComma = localeTag().toLowerCase().startsWith("fr");
    const num = (n: number) => csvNumber(n, decimalComma);
    const iso = (d: string) => dayKey(parseDate(d)) || d;
    const lines: Array<Array<string | number>> =
      mode === "spending"
        ? [
            [t("hist.fDate"), t("hist.fDescription"), t("hist.fAmount"), t("hist.fJar"), t("hist.fAccount"), t("hist.fTags"), t("hist.csvSubscription")],
            ...filteredSpendings.map((s) => [iso(s.date), s.description, num(s.amount), s.jar, s.account, tagNames(s.tags), s.subscription ?? ""]),
          ]
        : [
            [t("hist.fDate"), t("hist.fSource"), t("hist.fAmount"), t("hist.fType"), t("hist.fDestination"), t("hist.fMethod"), t("hist.fTags")],
            ...filteredRevenues.map((r) => [iso(r.date), r.source, num(r.amount), r.incomeType ?? "", r.destination ?? "", r.method ?? "", tagNames(r.tags)]),
          ];
    // BOM UTF-8 : Excel affiche correctement les accents
    const blob = new Blob(["\ufeff" + toCsv(lines, decimalComma ? ";" : ",")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mode === "spending" ? "depenses" : "revenus"}-${dayKey(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Résumé des filtres actifs (la recherche n'en fait pas partie : elle a son propre champ)
  const activeFilters = useMemo(() => {
    const out: string[] = [];
    if (periodFilter !== "all" && !(periodFilter === "custom" && !customFrom && !customTo)) {
      const names: Record<PeriodFilter, string> = {
        all: t("hist.pAll"), month: t("hist.pMonth"), prevmonth: t("hist.pPrev"), "90d": t("hist.p90"), year: t("hist.pYear"), custom: periodLabel || t("hist.pCustom"),
      };
      out.push(names[periodFilter]);
    }
    if (mode === "spending") {
      if (jarFilter !== "all") out.push(`${JAR_EMOJI[jarFilter as JarKey] ?? ""} ${jarFilter}`.trim());
      if (accountFilter !== "all") out.push(accountFilter);
    } else {
      if (typeFilter !== "all") out.push(typeFilter);
      if (destinationFilter !== "all") out.push(destinationFilter);
    }
    if (tagFilter !== "all") {
      const tag = getTagById(tagFilter);
      out.push(tagFilter === NO_TAG ? t("hist.noTag") : tag ? `${tag.emoji} ${tag.name}` : tagFilter);
    }
    if (minAmount != null) out.push(t("hist.minShort", { amount: `${minAmount} ${curSym()}` }));
    if (sort !== "dateDesc") out.push(t(SORT_LABEL_KEYS[sort]));
    return out;
  }, [periodFilter, customFrom, customTo, periodLabel, mode, jarFilter, accountFilter, typeFilter, destinationFilter, tagFilter, minAmount, sort, t]);

  const renderPills = (
    items: { label: string; value: string }[],
    current: string,
    onChange: (v: string) => void,
    color = "#007AFF",
    sectionLabel?: string,
    wrap = false
  ) => (
    <div>
      {sectionLabel && (
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          {sectionLabel}
        </div>
      )}
      {/* pills-scroll: classe CSS pour le scroll horizontal cross-platform */}
      <div className={wrap ? "pills-wrap" : "pills-scroll"}>
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
            {t("hist.fDate")}
            <input type="date" value={editDraft.date || ""} onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))}
              style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            {t("hist.fAmount")}
            <input type="number" step="0.01" value={editDraft.amount || ""} onChange={e => setEditDraft(d => ({ ...d, amount: e.target.value }))}
              style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
          </label>

          {isSpending ? (<>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)", gridColumn: "1 / -1" }}>
              {t("hist.fDescription")}
              <input type="text" value={editDraft.description || ""} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              {t("hist.fJar")}
              <select value={editDraft.jar || ""} onChange={e => setEditDraft(d => ({ ...d, jar: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }}>
                {JAR_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              {t("hist.fAccount")}
              <select value={editDraft.account || ""} onChange={e => setEditDraft(d => ({ ...d, account: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }}>
                {accountsList.map(a => <option key={a.id} value={a.name}>{a.icon} {a.name}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)", gridColumn: "1 / -1" }}>
              {t("hist.fTags")}
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
              {t("hist.fSource")}
              <input type="text" value={editDraft.source || ""} onChange={e => setEditDraft(d => ({ ...d, source: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              {t("hist.fMethod")}
              <input type="text" value={editDraft.method || ""} onChange={e => setEditDraft(d => ({ ...d, method: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              {t("hist.fDestination")}
              <input type="text" list="hist-dest-list" value={editDraft.destination || ""} onChange={e => setEditDraft(d => ({ ...d, destination: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              {t("hist.fRate")}
              <input type="number" step="0.000001" value={editDraft.rate || ""} onChange={e => setEditDraft(d => ({ ...d, rate: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              {t("hist.fType")}
              <input type="text" list="hist-type-list" value={editDraft.incomeType || ""} onChange={e => setEditDraft(d => ({ ...d, incomeType: e.target.value }))}
                style={{ padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
            </label>
          </>)}
        </div>
        {editError && <p style={{ color: "#FF3B30", fontSize: 13, marginBottom: 10 }}>⚠️ {editError}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={actionBtnStyle("primary")} onClick={handleSave} disabled={editSaving}>
            {editSaving ? t("hist.saving") : t("hist.save")}
          </button>
          <button style={actionBtnStyle("ghost")} onClick={cancelEdit}>{t("common.cancel").replace(/^\S+\s/, "")}</button>
        </div>
      </div>
    );
  };

  /** Titre de jour : « samedi 8 novembre » + total et nombre de lignes de CE jour (même si la page en coupe une partie). */
  const renderDayHeader = (key: string) => {
    const stats = dayStats.get(key);
    const d = key ? new Date(`${key}T00:00:00`) : null;
    const sameYear = d != null && d.getFullYear() === new Date().getFullYear();
    const label = d
      ? d.toLocaleDateString(localeTag(), { weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) })
      : t("hist.noDate");
    return (
      <div className="hist-day" key={`day-${key}`}>
        <span className="hist-day-label">{label}</span>
        {stats && (
          <span className="hist-day-total">
            {signedAmount(stats.total, mode).sign}{fmt(signedAmount(stats.total, mode).abs)} {curSym()}
            {stats.count > 1 && <span className="hist-day-count"> · {stats.count}</span>}
          </span>
        )}
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
            <span style={{ fontSize: 17, fontWeight: 700, color: row.amount < 0 ? "#34C759" : "#FF3B30" }}>{signedAmount(row.amount, "spending").sign}{fmt(Math.abs(row.amount))}{curSym()}</span>
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
                <button style={actionBtnStyle("primary")} onClick={() => onUseEntry({ kind: "spending", row })}>{t("hist.reuse")}</button>
              )}
              <button style={actionBtnStyle("edit")} onClick={() => startEdit(row)}>{t("hist.edit")}</button>
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
            <span style={{ fontSize: 17, fontWeight: 700, color: row.amount < 0 ? "#FF3B30" : "#34C759" }}>{signedAmount(row.amount, "revenue").sign}{fmt(Math.abs(row.amount))}{curSym()}</span>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{isExpanded ? "▲" : "▼"}</div>
          </div>
        </div>

        {isEditing && renderEditForm(row)}

        {isExpanded && !isEditing && (
          <div style={{ borderTop: "1px solid var(--border-color)", padding: "12px 16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {row.cryptoQuantity > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>{t("hist.fCrypto")}</span>
                  <span style={{ fontWeight: 600 }}>{fmt(row.cryptoQuantity, 8)}</span>
                </div>
              )}
              {row.rate > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>{t("hist.fRate")}</span>
                  <span style={{ fontWeight: 600 }}>{fmt(row.rate, 4)}</span>
                </div>
              )}
              {row.incomeType && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>{t("hist.fType")}</span>
                  <span style={{ fontWeight: 600 }}>{row.incomeType}</span>
                </div>
              )}
              {row.value && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>{t("hist.fValue")}</span>
                  <span style={{ fontWeight: 600 }}>{row.value}</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {onUseEntry && (
                <button style={actionBtnStyle("primary")} onClick={() => onUseEntry({ kind: "revenue", row })}>{t("hist.reuse")}</button>
              )}
              <button style={actionBtnStyle("edit")} onClick={() => startEdit(row)}>{t("hist.edit")}</button>
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
      try { return new Date(reportMonth + "-01").toLocaleDateString(localeTag(), { month: "long", year: "numeric" }); }
      catch { return reportMonth; }
    })();

    return (
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Month picker card */}
        <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-sm)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
            {t("hist.monthlyReport")}
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
            {reportLoading ? t("rev.rateLoading") : t("hist.generate")}
          </button>
        </div>

        {reportGenerated && (<>
          {/* Summary */}
          <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-sm)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
              {t("hist.summary", { month: monthLabel })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div style={{ padding: "14px", background: "#FFEDED", borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: "#FF3B30", fontWeight: 700, marginBottom: 6 }}>{t("hist.expensesCaps")}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#FF3B30", lineHeight: 1 }}>{fmt(reportTotalSpendings)} {curSym()}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{t("hist.transactions", { n: reportSpendings.length })}</div>
              </div>
              <div style={{ padding: "14px", background: "#E8FAF0", borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: "#34C759", fontWeight: 700, marginBottom: 6 }}>{t("hist.incomeCaps")}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#34C759", lineHeight: 1 }}>{fmt(reportTotalRevenues)} {curSym()}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{t("hist.transactions", { n: reportRevenues.length })}</div>
              </div>
            </div>
            <div style={{ padding: "14px", background: balance >= 0 ? "#EAF3FF" : "#FFF5E6", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 500 }}>{t("hist.monthBalance")}</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: balance >= 0 ? "#007AFF" : "#FF9500" }}>
                {balance >= 0 ? "+" : ""}{fmt(balance)} {curSym()}
              </span>
            </div>
          </div>

          {/* By jar */}
          {reportByJar.length > 0 && (
            <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
                {t("hist.byJar")}
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
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{fmt(amount)} {curSym()}</span>
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
                {t("hist.topSpending")}
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
                    {fmt(amount)} {curSym()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Tag avg/day */}
          {reportTagStats.length > 0 && (
            <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                {t("hist.byTag")}
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
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#FF3B30" }}>{fmt(tag.totalAmount)} {curSym()}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>
                          ≈ {fmt(tag.avgPerDay, 1)} {curSym()}/j
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
                {t("hist.activeSubs")}
              </div>
              {reportSubscriptions.map((sub, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: idx < reportSubscriptions.length - 1 ? "1px solid var(--border-color)" : "none" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-main)" }}>{sub.description}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                      {sub.subscription} · {sub.jar}
                    </div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#FF3B30" }}>{fmt(sub.amount)} {curSym()}</span>
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {reportSpendings.length === 0 && reportRevenues.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{t("hist.noTransactionTitle")}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{t("hist.noDataFor", { month: monthLabel })}</div>
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
        {view !== "report" && (
          <div style={{ padding: "20px 20px 0", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h2 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-main)", letterSpacing: -0.5 }}>
                {view === "history" ? t("hist.title") : t("hist.titleReports")}
              </h2>
              {view === "history" && onImport && (
                <button
                  type="button"
                  onClick={onImport}
                  style={{
                    padding: "8px 14px", borderRadius: 999, border: "1.5px solid var(--border-color)",
                    background: "var(--bg-card)", color: "var(--text-main)", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {t("hist.import")}
                </button>
              )}
            </div>
            {/* Main tab bar */}
            {!view && (
              <div style={tabBarStyle}>
                <button style={tabBtnStyle(mainTab === "history")} onClick={() => setMainTab("history")}>
                  {t("hist.tabHistory")}
                </button>
                <button style={tabBtnStyle(mainTab === "report", "#007AFF")} onClick={() => setMainTab("report")}>
                  {t("hist.tabReport")}
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ height: 20 }} />

        {/* Valeurs déjà utilisées : le formulaire de modification les propose pour ne pas recréer de doublon */}
        <datalist id="hist-type-list">{uniqueTypes.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="hist-dest-list">{uniqueDestinations.map((v) => <option key={v} value={v} />)}</datalist>

        {/* ═══ HISTORY TAB ═══ */}
        {mainTab === "history" && (<>
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Mode toggle */}
            <div style={tabBarStyle}>
              <button
                style={tabBtnStyle(mode === "spending", "#FF3B30")}
                onClick={() => { setMode("spending"); setQuery(""); setExpandedCard(null); cancelEdit(); setPeriodFilter("all"); setCustomFrom(""); setCustomTo(""); setJarFilter("all"); setAccountFilter("all"); setTagFilter("all"); setMinAmountRaw(""); }}
              >
                {t("hist.spendings")}
              </button>
              <button
                style={tabBtnStyle(mode === "revenue", "#34C759")}
                onClick={() => { setMode("revenue"); setQuery(""); setExpandedCard(null); cancelEdit(); setPeriodFilter("all"); setCustomFrom(""); setCustomTo(""); setTypeFilter("all"); setDestinationFilter("all"); setTagFilter("all"); setMinAmountRaw(""); }}
              >
                {t("hist.revenues")}
              </button>
            </div>

            {/* Search */}
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
              <input
                type="text"
                placeholder={mode === "spending" ? t("hist.searchSpending") : t("hist.searchRevenue")}
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoComplete="off"
                style={{ width: "100%", padding: "11px 12px 11px 38px", border: "1.5px solid var(--border-color)", borderRadius: 12, fontSize: 15, background: "var(--bg-card)", color: "var(--text-main)", outline: "none" }}
              />
              {loading && (
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text-muted)" }}>⏳</span>
              )}
            </div>

            {/* Filtres : repliables, résumé des filtres actifs quand c'est replié */}
            <div className="hist-filters">
              <button type="button" className="hist-filters-toggle" aria-expanded={filtersOpen} onClick={toggleFilters}>
                <span className="hist-filters-title">
                  {t("hist.filters")}
                  {activeFilters.length > 0 && <span className="hist-filters-badge">{activeFilters.length}</span>}
                </span>
                <span aria-hidden="true">{filtersOpen ? "▴" : "▾"}</span>
              </button>
              {!filtersOpen && activeFilters.length > 0 && (
                <div className="hist-filters-summary">{activeFilters.join(" · ")}</div>
              )}

              {filtersOpen && (
                <div className="hist-filters-body">
                  {renderPills(
                    [
                      { label: t("hist.pAll"), value: "all" },
                      { label: t("hist.pMonth"), value: "month" },
                      { label: t("hist.pPrev"), value: "prevmonth" },
                      { label: t("hist.p90"), value: "90d" },
                      { label: t("hist.pYear"), value: "year" },
                      { label: t("hist.pCustom"), value: "custom" },
                    ],
                    periodFilter, (v) => setPeriodFilter(v as PeriodFilter), "#007AFF", t("hist.period"), true
                  )}
                  {periodFilter === "custom" && (
                    <div className="hist-range">
                      <label className="hist-range-field">
                        <span>{t("hist.from")}</span>
                        <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
                      </label>
                      <label className="hist-range-field">
                        <span>{t("hist.to")}</span>
                        <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
                      </label>
                    </div>
                  )}

                  {/* Les 6 jarres, toutes visibles (les pastilles passent à la ligne au lieu de défiler) */}
                  {mode === "spending" && renderPills(
                    [{ label: t("hist.allF"), value: "all" }, ...JAR_KEYS.map(j => ({ label: `${JAR_EMOJI[j]} ${j}`, value: j }))],
                    jarFilter, setJarFilter, "#007AFF", t("hist.jarLabel"), true
                  )}
                  {mode === "spending" && uniqueAccounts.length > 1 && renderPills(
                    [{ label: t("hist.allM"), value: "all" }, ...uniqueAccounts.map(a => ({ label: a, value: a }))],
                    accountFilter, setAccountFilter, "#34C759", t("hist.accountLabel"), true
                  )}
                  {mode === "revenue" && uniqueTypes.length > 1 && renderPills(
                    [{ label: t("hist.allM"), value: "all" }, ...uniqueTypes.map(t => ({ label: t, value: t }))],
                    typeFilter, setTypeFilter, "#34C759", t("hist.revType"), true
                  )}
                  {mode === "revenue" && uniqueDestinations.length > 1 && renderPills(
                    [{ label: t("hist.allF"), value: "all" }, ...uniqueDestinations.map(d => ({ label: d, value: d }))],
                    destinationFilter, setDestinationFilter, "#FF9500", t("hist.destLabel"), true
                  )}

                  {tagOptions.items.length > 0 && renderPills(
                    [
                      { label: t("hist.allF"), value: "all" },
                      ...tagOptions.items,
                      ...(tagOptions.hasUntagged ? [{ label: t("hist.noTag"), value: NO_TAG }] : []),
                    ],
                    tagFilter, setTagFilter, "#AF52DE", t("hist.tagLabel"), true
                  )}

                  <label className="hist-min">
                    <span>{t("hist.minAmount")}</span>
                    <span className="hist-min-input">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={minAmountRaw}
                        onChange={(e) => setMinAmountRaw(e.target.value)}
                        aria-label={t("hist.minAmount")}
                      />
                      <span>{curSym()}</span>
                    </span>
                  </label>

                  {renderPills(
                    (Object.keys(SORT_LABEL_KEYS) as SortKey[]).map((k) => ({ label: t(SORT_LABEL_KEYS[k]), value: k })),
                    sort, (v) => setSort(v as SortKey), "#8E8E93", t("hist.sortLabel"), true
                  )}
                </div>
              )}

              {activeFilters.length > 0 && (
                <button type="button" className="hist-filters-reset" onClick={resetFilters}>{t("hist.resetFilters")}</button>
              )}
            </div>
          </div>

          {/* Summary bar */}
          {!loading && (mode === "spending" ? filteredSpendings.length : filteredRevenues.length) > 0 && (
            <div style={{ padding: "10px 20px" }}>
              <div style={{ background: "var(--bg-card)", borderRadius: 12, boxShadow: "var(--shadow-sm)", padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {t((mode === "spending" ? filteredSpendings.length : filteredRevenues.length) === 1 ? "hist.countOne" : "hist.countMany", { n: (mode === "spending" ? filteredSpendings.length : filteredRevenues.length) })}
                  </span>
                  {(mode === "spending" ? filteredSpendings.length : filteredRevenues.length) > visibleCount && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6 }}>
                      · {t("hist.shownOf", { n: visibleCount })}
                    </span>
                  )}
                  {periodLabel && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6, fontStyle: "italic" }}>
                      · {periodLabel}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 17, fontWeight: 700, color: mode === "spending" ? "#FF3B30" : "#34C759" }}>
                  {signedAmount(totalFiltered, mode).sign}{fmt(signedAmount(totalFiltered, mode).abs)} {curSym()}
                </span>
              </div>
              <button type="button" className="hist-export" onClick={exportCsv}>
                {t("hist.exportCsv", { n: mode === "spending" ? filteredSpendings.length : filteredRevenues.length })}
              </button>
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
            {(mode === "spending" ? filteredSpendings : filteredRevenues).slice(0, visibleCount).map((row, i, shown) => {
              const key = rowDayKey(row.date);
              const newDay = groupByDay && (i === 0 || key !== rowDayKey(shown[i - 1].date));
              const card = mode === "spending"
                ? renderSpendingCard(row as SearchSpendingResult, i)
                : renderRevenueCard(row as SearchRevenueResult, i);
              return (
                <React.Fragment key={`${mode}-${(row as { rowIndex?: number }).rowIndex ?? i}`}>
                  {newDay && renderDayHeader(key)}
                  {card}
                </React.Fragment>
              );
            })}

            {(() => {
              const total = mode === "spending" ? filteredSpendings.length : filteredRevenues.length;
              const remaining = total - visibleCount;
              return remaining > 0 ? (
                <button type="button" className="hist-more" onClick={() => setVisibleCount((c) => c + PAGE)}>
                  {t("hist.showMore", { n: Math.min(PAGE, remaining), left: remaining })}
                </button>
              ) : null;
            })()}

            {/* Empty state */}
            {!loading && !error && (mode === "spending" ? filteredSpendings : filteredRevenues).length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>🔍</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                  {query ? t("hist.noResult") : t("hist.noTransactionTitle")}
                </div>
                <div style={{ fontSize: 13 }}>
                  {query ? t("hist.noResultFor", { q: query }) : t("hist.widen")}
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
