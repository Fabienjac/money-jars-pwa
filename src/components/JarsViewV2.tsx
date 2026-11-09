// src/components/JarsViewV2.tsx
// NOUVELLE VERSION - UX Optimisée pour usage mobile quotidien
import React, { useEffect, useState, useMemo, useRef } from "react";
import { fetchTotals, fetchAnalytics, AnalyticsResponse, fetchUserBudgetPrefs, saveUserBudgetPrefs, fetchEntryTimestamps, fetchSpendingRowsSince, fetchLifestylePrefs, fetchDismissedSubscriptions } from "../api";
import { detectRecurring } from "../subscriptions";
import { totalUpcoming, upcomingCharges } from "../upcomingCharges";
import { OPEN_ANALYTICS_EVENT, saveTab } from "../analyticsState";
import { projectMonthEnd, projectionReady as isProjectionReady, splitOneOff } from "../monthProjection";
import { EXCEPTIONAL_TAG_ID } from "../lifestyleSeed";
import { TotalsResponse, JarKey } from "../types";
import { calculateTagStats, TagStat } from "../tagStatsUtils";
import { getStreak, computeStreak, StreakState } from "../streakUtils";
import LifestyleCard from "./LifestyleCard";
import YearStartCard from "./YearStartCard";
import AutonomyCard from "./AutonomyCard";

import { formatMoney as formatMoneyBase, formatPercent } from "../baseCurrency";
import { t, useT, type TKey, localeTag, monthShort, monthLong, JAR_LABELS, JAR_EMPTY_COPY } from "../i18n";
const JAR_EMOJIS: Record<JarKey, string> = {
  NEC: "🏺",
  FFA: "🌱",
  LTSS: "🏦",
  PLAY: "🎮",
  EDUC: "📚",
  GIFT: "🎁",
};

const JAR_COLORS: Record<JarKey, string> = {
  NEC: "#007AFF",
  FFA: "#34C759",
  LTSS: "#FFD60A",
  PLAY: "#FF9500",
  EDUC: "#AF52DE",
  GIFT: "#5AC8FA",
};

const JAR_SETTINGS_STORAGE_KEY = "mjars:jarSettings";
const JARS_MODE_KEY = "mjars:jarsMode";


// Couleurs vives (barres, pastilles) → variante assez contrastée pour du texte (WCAG AA), définies dans style.css
const TEXT_TONE: Record<string, string> = {
  "#34C759": "var(--ok-text)",
  "#FF9500": "var(--warn-text)",
  "#FF3B30": "var(--danger-text)",
  "#84CC16": "var(--lime-text)",
};
const textTone = (c: string): string => TEXT_TONE[c.toUpperCase()] ?? c;

function formatMoney(value: number | null | undefined, digits = 2): string {
  return formatMoneyBase(typeof value === "number" && Number.isFinite(value) ? value : 0, undefined, digits);
}

function loadJarSplitFromSettings(): Record<JarKey, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(JAR_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any[];
    const map: Partial<Record<JarKey, number>> = {};
    parsed.forEach((j) => {
      const key = j?.key as JarKey | undefined;
      const pct = Number(j?.percent);
      if (key && !isNaN(pct)) {
        map[key] = pct / 100;
      }
    });
    return map as Record<JarKey, number>;
  } catch {
    return null;
  }
}

const MONTH_NAMES: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** Convertit "Jan 2026" → "2026-01", laisse "2026-01" intact */
function normalizeMonth(m: string): string | null {
  const human = m.match(/^(\w{3})\s+(\d{4})$/);
  if (human) {
    const num = MONTH_NAMES[human[1]];
    return num ? `${human[2]}-${num}` : null;
  }
  if (/^\d{4}-\d{2}$/.test(m)) return m;
  return null;
}

// ── Budget mensuel (localStorage) ────────────────────────────────────────────
const BUDGET_KEY = "mjars:monthlyBudget";
function loadMonthlyBudget(): number | null {
  const v = localStorage.getItem(BUDGET_KEY);
  return v ? parseFloat(v) : null;
}
function saveMonthlyBudget(v: number): void {
  localStorage.setItem(BUDGET_KEY, String(v));
}

// ── Budget par tag (localStorage) ────────────────────────────────────────────
const TAG_BUDGETS_KEY = "mjars:tagBudgets";
function loadTagBudgets(): Record<string, number> {
  try {
    const v = localStorage.getItem(TAG_BUDGETS_KEY);
    return v ? JSON.parse(v) : {};
  } catch { return {}; }
}
function saveTagBudgets(budgets: Record<string, number>): void {
  try { localStorage.setItem(TAG_BUDGETS_KEY, JSON.stringify(budgets)); } catch {}
}

// ── Dernier import ────────────────────────────────────────────────────────────
function getLastImportLabel(): string {
  try {
    const ts = localStorage.getItem("mjars:lastImport");
    if (!ts) return t("home.never");
    const diffMs = Date.now() - parseInt(ts, 10);
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffMin < 2) return t("home.justNow");
    if (diffMin < 60) return t("home.minAgo", { n: diffMin });
    if (diffH < 24) return t("home.hAgo", { n: diffH });
    if (diffD === 1) return t("home.yesterday");
    if (diffD < 7) return t("home.daysAgo", { n: diffD });
    return t("home.weeksAgo", { n: Math.floor(diffD / 7) });
  } catch { return t("home.never"); }
}


interface JarsViewV2Props {
  onOpenRevenue: () => void;
  /** Ouvre les Réglages (rappel de début d'année → transferts entre jarres). */
  onOpenSettings?: () => void;
}

const JarsViewV2: React.FC<JarsViewV2Props> = ({ onOpenRevenue, onOpenSettings }) => {
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customSplit, setCustomSplit] = useState<Record<JarKey, number> | null>(null);
  // Bloc « Mes jarres » : vue du mois (avec sélecteur de mois) ou vue des soldes cumulés
  const [jarsMode, setJarsModeState] = useState<"month" | "balance">(() => {
    try { return localStorage.getItem(JARS_MODE_KEY) === "balance" ? "balance" : "month"; } catch { return "month"; }
  });
  const jarsModeChosen = useRef<boolean>((() => { try { return localStorage.getItem(JARS_MODE_KEY) !== null; } catch { return false; } })());
  const setJarsMode = (m: "month" | "balance") => {
    jarsModeChosen.current = true;
    setJarsModeState(m);
    try { localStorage.setItem(JARS_MODE_KEY, m); } catch { /* sans importance */ }
  };
  const [monthOffset, setMonthOffset] = useState(0); // 0 = mois en cours, -1 = mois précédent…
  const showJarsDetail = jarsMode === "balance";

  // Budget mensuel
  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(loadMonthlyBudget);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  // Tag stats mois en cours
  const [monthlyTagStats, setMonthlyTagStats] = useState<TagStat[]>([]);
  const [tagStatsLoading, setTagStatsLoading] = useState(false);

  // Budget par tag
  const [tagBudgets, setTagBudgets] = useState<Record<string, number>>(loadTagBudgets);
  const [editingTagBudget, setEditingTagBudget] = useState<string | null>(null);
  const [tagBudgetInput, setTagBudgetInput] = useState("");

  // Dernier import
  const [lastImportLabel] = useState<string>(getLastImportLabel);

  // Streak de saisie quotidienne
  const [streak, setStreak] = useState<StreakState>(() => getStreak());

  /** Charge uniquement les totaux (lazy, au clic "Voir le détail") */
  const loadTotals = async () => {
    try {
      setLoading(true);
      setError(null);
      const totalsData = await fetchTotals();
      setTotals(totalsData);
    } catch (err: any) {
      console.error("Erreur chargement totals:", err);
      setError(err?.message || t("home.errTotals"));
    } finally {
      setLoading(false);
    }
  };

  /** Charge les analytics (au mount, pour le graphique) */
  const loadAnalytics = async (force = false) => {
    try {
      const analyticsData = await fetchAnalytics(force);
      if (analyticsData) setAnalytics(analyticsData);
    } catch {
      // silencieux — le graphique ne s'affichera pas
    }
  };

  useEffect(() => {
    setCustomSplit(loadJarSplitFromSettings());
    loadAnalytics();

    // Charger les préférences budget depuis Supabase (cross-device)
    fetchUserBudgetPrefs().then(prefs => {
      if (prefs.monthlyBudget != null) {
        setMonthlyBudget(prefs.monthlyBudget);
        localStorage.setItem("mjars:monthlyBudget", String(prefs.monthlyBudget));
      }
      if (prefs.tagBudgets != null) {
        setTagBudgets(prefs.tagBudgets);
        try { localStorage.setItem("mjars:tagBudgets", JSON.stringify(prefs.tagBudgets)); } catch {}
      }
    }).catch(() => {}); // silencieux — on garde localStorage si erreur réseau

    // Rafraîchit le badge streak quand une dépense vient d'être enregistrée
    // Streak calculé depuis le cloud (identique sur tous les appareils) ; le compteur local sert d'affichage
    // immédiat et de secours hors ligne.
    const refreshStreak = () => {
      setStreak(getStreak());
      const since = new Date();
      since.setDate(since.getDate() - 366);
      fetchEntryTimestamps(since.toISOString())
        .then((stamps) => { if (stamps.length > 0) setStreak(computeStreak(stamps)); })
        .catch(() => {});
    };
    refreshStreak();
    const onSaved = () => refreshStreak();
    window.addEventListener("mjars:transactionSaved", onSaved);

    // Rafraîchit les analytics (revenus, projections jars) après un nouveau revenu
    const onRevenueSaved = () => loadAnalytics(true); // force = ignore cache
    window.addEventListener("mjars:revenueSaved", onRevenueSaved);

    return () => {
      window.removeEventListener("mjars:transactionSaved", onSaved);
      window.removeEventListener("mjars:revenueSaved", onRevenueSaved);
    };
  }, []);

  // Un seul fetch pour les tags du mois, la détection des abonnements ET l'overlay graphique
  useEffect(() => {
    setTagStatsLoading(true);
    // 14 mois de dépenses, lus en entier (l'ancienne lecture s'arrêtait aux 500 plus récentes) :
    // les abonnements annuels, la détection sur 6 mois et le graphique de l'année en ont besoin.
    const since = new Date();
    since.setMonth(since.getMonth() - 14, 1);
    Promise.all([
      fetchSpendingRowsSince(`${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-01`),
      fetchLifestylePrefs().catch(() => ({ extraordinaryTags: [] as string[] })),
      fetchDismissedSubscriptions().catch(() => [] as string[]),
    ])
      .then(([all, prefs, dismissedSubs]) => {
        const now = new Date();
        const targetMonth = now.getMonth() + 1;
        const targetYear  = now.getFullYear();

        // Transactions du mois courant (pour les tags)
        const currentMonthTxns = all.filter(t => {
          const d = t.date;
          if (!d) return false;
          const fr = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (fr) return parseInt(fr[2]) === targetMonth && parseInt(fr[3]) === targetYear;
          const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (iso) return parseInt(iso[2]) === targetMonth && parseInt(iso[1]) === targetYear;
          const parsed = new Date(d);
          if (!isNaN(parsed.getTime())) return parsed.getMonth() + 1 === targetMonth && parsed.getFullYear() === targetYear;
          return false;
        });

        setMonthlyTagStats(calculateTagStats(currentMonthTxns));
        // Courantes / exceptionnelles du mois : la projection ne prolonge que le rythme courant
        // Prélèvements attendus dans les 30 jours (abonnements détectés), pour la ligne de la carte « Ce mois »
        const upcomingList = upcomingCharges(detectRecurring(all, now, new Set(dismissedSubs)), now, 30);
        setUpcoming(upcomingList.length > 0 ? { total: totalUpcoming(upcomingList), count: upcomingList.length } : null);
        setOneOffTagIds([EXCEPTIONAL_TAG_ID, ...prefs.extraordinaryTags]);
        setMonthSplit(splitOneOff(currentMonthTxns, [EXCEPTIONAL_TAG_ID, ...prefs.extraordinaryTags]));

        // Toutes les transactions pour l'overlay de tag sur le graphique
        setAllTransactionsForChart(all);
      })
      .catch(() => {})
      .finally(() => setTagStatsLoading(false));
  }, []);

  useEffect(() => {
    if (showJarsDetail && !totals && !loading) loadTotals();
  }, [showJarsDetail]); // soldes cumulés : chargés à la première ouverture

  // Mois en cours sans aucun revenu (alors qu'il y en a eu avant) : la vue « Mois » n'a rien à comparer, on ouvre sur
  // « Soldes ». Dès que l'utilisateur choisit lui-même une vue, son choix est mémorisé et prime.
  useEffect(() => {
    if (jarsModeChosen.current || !analytics) return;
    const monthHasIncome = (analytics.trends?.revenues?.current ?? 0) > 0;
    const everHadIncome = (analytics.monthlyData ?? []).some((m) => m.revenues > 0);
    if (!monthHasIncome && everHadIncome) setJarsModeState("balance");
  }, [analytics]);

  const totalRevenues = totals?.totalRevenues || 0;
  const totalSpendings = totals
    ? Object.values(totals.jars).reduce((acc, j) => acc + (j.spendings || 0), 0)
    : 0;
  const totalBalance = totalRevenues - totalSpendings;
  // Au moins un revenu dans l'historique : distingue « pas encore de revenu ce mois » de « jamais de revenu »
  const hasRevenueHistory = totalRevenues > 0 || (analytics?.monthlyData ?? []).some((m) => m.revenues > 0);
  const jarKeys = totals ? (Object.keys(totals.jars) as JarKey[]) : [];

  /** Dépenses des 14 derniers mois (projection par jarre du bloc « Mes jarres ») */
  const [allTransactionsForChart, setAllTransactionsForChart] = useState<import("../types").SearchSpendingResult[]>([]);

  /** Dépense mois en cours depuis analytics */
  const currentMonthSpending = analytics?.trends?.spendings?.current ?? null;

  /** Courantes / exceptionnelles du mois en cours (null tant que les dépenses ne sont pas lues) */
  const [monthSplit, setMonthSplit] = useState<{ regular: number; oneOff: number } | null>(null);
  const [oneOffTagIds, setOneOffTagIds] = useState<string[]>([EXCEPTIONAL_TAG_ID]);
  const [upcoming, setUpcoming] = useState<{ total: number; count: number } | null>(null);
  const openSubscriptions = () => {
    try { saveTab("subs", sessionStorage); } catch { /* sans importance */ }
    window.dispatchEvent(new CustomEvent(OPEN_ANALYTICS_EVENT));
  };

  /**
   * Projection dépense fin de mois : on prolonge le rythme des dépenses courantes et on ajoute telles quelles les
   * exceptionnelles déjà faites (un billet d'avion le 3 ne se répète pas dix fois). Avant la lecture des dépenses, ou
   * sans elles, règle de trois sur le total.
   */
  const projectionDetail = useMemo(() => {
    if (currentMonthSpending == null) return null;
    const now = new Date();
    const day = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const split = monthSplit ?? { regular: currentMonthSpending, oneOff: 0 };
    return projectMonthEnd({ regularSoFar: split.regular, oneOffSoFar: split.oneOff, day, daysInMonth });
  }, [currentMonthSpending, monthSplit]);
  const projectedMonthSpending = projectionDetail?.projected ?? null;

  /** Avant le 10 du mois, une extrapolation sur quelques jours est trop instable pour être affichée. */
  const projectionReady = isProjectionReady(new Date().getDate());

  /** % du budget consommé */
  const budgetPercent = useMemo(() => {
    if (!monthlyBudget || currentMonthSpending == null) return null;
    return (currentMonthSpending / monthlyBudget) * 100;
  }, [monthlyBudget, currentMonthSpending]);

  /** Label mois courant ex: "Avril 2026" */
  const currentMonthLabel = useMemo(() => {
    const now = new Date();
    return `${monthLong(now.getMonth())} ${now.getFullYear()}`;
  }, []);

  /** Top 5 tags du mois */
  const [showAllTags, setShowAllTags] = useState(false);
  const topTags = useMemo(() => (showAllTags ? monthlyTagStats : monthlyTagStats.slice(0, 5)), [monthlyTagStats, showAllTags]);

  /** Mois affiché dans le bloc « Mes jarres » (0 = mois en cours, jusqu'à 11 mois en arrière) */
  const MAX_MONTHS_BACK = 11;
  const viewDate = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth() + monthOffset, 1);
  }, [monthOffset]);
  const isCurrentView = monthOffset === 0;
  const viewMonthLabel = `${monthLong(viewDate.getMonth())} ${viewDate.getFullYear()}`;
  /** La projection de fin de mois n'a de sens que pour le mois en cours, et pas avant le 10 */
  const showProjection = isCurrentView && projectionReady;

  /** Dépenses par jar pour le mois affiché (+ projection fin de mois si c'est le mois en cours) */
  const jarMonthlyProjections = useMemo(() => {
    const now = new Date();
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysElapsed = isCurrentView ? now.getDate() : daysInMonth;
    const JAR_KEYS: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
    const result: Partial<Record<JarKey, { spent: number; projected: number }>> = {};
    for (const jarKey of JAR_KEYS) {
      const jarTxns = allTransactionsForChart.filter(t => {
        if (t.jar !== jarKey) return false;
        const d = t.date;
        if (!d) return false;
        const fr = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (fr) return parseInt(fr[2]) === month && parseInt(fr[3]) === year;
        const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) return parseInt(iso[2]) === month && parseInt(iso[1]) === year;
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime()))
          return parsed.getMonth() + 1 === month && parsed.getFullYear() === year;
        return false;
      });
      const spent = jarTxns.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
      // Même règle que la carte « Ce mois » : on prolonge le rythme courant, les exceptionnelles restent telles quelles
      const split = splitOneOff(jarTxns.map((t) => ({ amount: Math.abs(t.amount || 0), tags: t.tags })), oneOffTagIds);
      const detail = isCurrentView ? projectMonthEnd({ regularSoFar: split.regular, oneOffSoFar: split.oneOff, day: daysElapsed, daysInMonth }) : null;
      const projected = detail ? detail.projected : spent;
      result[jarKey] = { spent, projected };
    }
    return result;
  }, [allTransactionsForChart, viewDate, isCurrentView, oneOffTagIds]);

  /** Revenu du mois affiché (le mois en cours vient des tendances, les autres de l'historique mensuel) */
  const viewMonthRevenue = useMemo(() => {
    if (isCurrentView) return analytics?.trends?.revenues?.current ?? 0;
    const key = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`;
    return (analytics?.monthlyData ?? []).find((m) => normalizeMonth(m.month) === key)?.revenues ?? 0;
  }, [analytics, viewDate, isCurrentView]);

  /** Allocation mensuelle par jar = revenu du mois × % jar (méthode Harv Eker) */
  const jarMonthlyAllocations = useMemo(() => {
    if (viewMonthRevenue <= 0 || !customSplit) return null;
    const JAR_KEYS: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
    const result: Partial<Record<JarKey, number>> = {};
    for (const jarKey of JAR_KEYS) {
      result[jarKey] = viewMonthRevenue * (customSplit[jarKey] ?? 0);
    }
    return result;
  }, [viewMonthRevenue, customSplit]);

  /** Sauvegarde du budget par tag */
  const handleSaveTagBudget = (tagId: string) => {
    const v = parseFloat(tagBudgetInput.replace(",", "."));
    let updated: Record<string, number>;
    if (!isNaN(v) && v > 0) {
      updated = { ...tagBudgets, [tagId]: v };
    } else if (tagBudgetInput === "" || tagBudgetInput === "0") {
      // Supprimer le budget si vide ou 0
      updated = { ...tagBudgets };
      delete updated[tagId];
    } else {
      setEditingTagBudget(null);
      setTagBudgetInput("");
      return;
    }
    saveTagBudgets(updated);
    setTagBudgets(updated);
    // Synchro Supabase (fire-and-forget)
    saveUserBudgetPrefs({ monthlyBudget: monthlyBudget ?? undefined, tagBudgets: updated }).catch(() => {});
    setEditingTagBudget(null);
    setTagBudgetInput("");
  };

  /** Sauvegarde du budget inline */
  const handleSaveBudget = () => {
    const v = parseFloat(budgetInput.replace(",", "."));
    if (!isNaN(v) && v > 0) {
      saveMonthlyBudget(v);
      setMonthlyBudget(v);
      // Synchro Supabase (fire-and-forget)
      saveUserBudgetPrefs({ monthlyBudget: v, tagBudgets }).catch(() => {});
    }
    setEditingBudget(false);
    setBudgetInput("");
  };


  return (
    <main className="jars-v2-page">
      <div className="home-topbar">
      {/* Revenu (saisie rare, mensuelle) — les dépenses passent par le bouton + */}
      <section className="jars-v2-revenue-row">
        <button type="button" className="revenue-link" onClick={onOpenRevenue}>
          {t("home.addIncome")}
        </button>
      </section>

      {/* 🔥 Streak de saisie quotidienne */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        {streak.count > 0 ? (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "5px 14px",
            borderRadius: "20px",
            background: streak.isAlive
              ? "linear-gradient(90deg, rgba(52,199,89,0.12) 0%, rgba(52,199,89,0.06) 100%)"
              : "rgba(142,142,147,0.1)",
            border: `1px solid ${streak.isAlive ? "rgba(52,199,89,0.3)" : "rgba(142,142,147,0.2)"}`,
          }}>
            <span style={{ fontSize: "16px", lineHeight: 1 }}>
              {streak.isAlive ? "🔥" : "💤"}
            </span>
            <span style={{
              fontSize: "13px",
              fontWeight: "700",
              color: streak.isAlive ? "var(--ok-text)" : "#8E8E93",
              letterSpacing: "-0.2px",
            }}>
              {!streak.isAlive
                ? t(streak.count === 1 ? "home.streakResume1" : "home.streakResume", { n: streak.count })
                : streak.count === 1
                  ? t("home.streakDay1")
                  : t("home.streakDays", { n: streak.count })}
            </span>
          </div>
        ) : (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "5px 14px",
            borderRadius: "20px",
            background: "rgba(255,149,0,0.08)",
            border: "1px solid rgba(255,149,0,0.2)",
          }}>
            <span style={{ fontSize: "16px", lineHeight: 1 }}>✨</span>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--warn-text)", letterSpacing: "-0.2px" }}>
              {t("home.streakStart")}
            </span>
          </div>
        )}
      </div>

      </div>

      {/* 🧭 Train de vie : dépense / jour hors dépenses extraordinaires */}
      {onOpenSettings && <YearStartCard onOpen={onOpenSettings} />}
      <LifestyleCard lastImportLabel={lastImportLabel} />

      {/* 🛟 Autonomie : mois de trésorerie au rythme de dépenses actuel */}
      <AutonomyCard rows={tagStatsLoading && allTransactionsForChart.length === 0 ? null : allTransactionsForChart} oneOffTagIds={oneOffTagIds} />

      {/* 📅 Card "Ce mois" — projection + budget + tags */}
      {(currentMonthSpending != null || tagStatsLoading) && (
        <section style={{ padding: "0 16px 12px" }}>
          <div style={{
            background: "var(--bg-card)",
            borderRadius: "16px",
            padding: "16px",
            border: "1px solid var(--border-color)",
            boxShadow: "var(--shadow-md)",
          }}>
            {/* Titre */}
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>
              {t("home.thisMonth", { label: currentMonthLabel })}
            </div>

            {/* 3 colonnes : Dépensé | Projection | Objectif */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
              {/* Dépensé */}
              <div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "3px" }}>{t("home.spent")}</div>
                <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--text-main)", letterSpacing: "-0.5px" }}>
                  {currentMonthSpending != null ? `${formatMoney(currentMonthSpending)}` : "—"}
                </div>
              </div>

              {/* Projection */}
              <div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "3px" }}>{t("home.projection")}</div>
                <div style={{
                  fontSize: "20px", fontWeight: "800", letterSpacing: "-0.5px",
                  color: monthlyBudget && projectedMonthSpending != null
                    ? projectedMonthSpending > monthlyBudget ? "#FF3B30"
                    : projectedMonthSpending > monthlyBudget * 0.85 ? "#FF9500"
                    : "var(--text-main)"
                    : "var(--text-main)",
                }}>
                  {projectedMonthSpending != null && projectionReady ? `≈ ${formatMoney(projectedMonthSpending)}` : "—"}
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-light)", marginTop: "2px" }}>
                  {!projectionReady
                    ? t("home.projectionLater")
                    : projectionDetail && projectionDetail.oneOff > 0
                      ? t("home.projectionOneOff", { amount: `${formatMoney(projectionDetail.oneOff)}` })
                      : t("home.projectionPace")}
                </div>
              </div>

              {/* Objectif (éditable) */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "3px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{t("home.goal")}</span>
                  <button
                    onClick={() => { setEditingBudget(true); setBudgetInput(monthlyBudget ? String(monthlyBudget) : ""); }}
                    style={{ background: "none", border: "none", padding: "0", cursor: "pointer", fontSize: "11px", lineHeight: 1 }}
                    title={t("home.editGoal")}
                  >✏️</button>
                </div>
                {editingBudget ? (
                  <input
                    type="number"
                    value={budgetInput}
                    onChange={e => setBudgetInput(e.target.value)}
                    onBlur={handleSaveBudget}
                    onKeyDown={e => { if (e.key === "Enter") handleSaveBudget(); if (e.key === "Escape") { setEditingBudget(false); setBudgetInput(""); } }}
                    autoFocus
                    placeholder={t("home.goalPlaceholder")}
                    style={{ width: "100%", fontSize: "17px", fontWeight: "800", border: "none", borderBottom: "2px solid #007AFF", background: "transparent", outline: "none", color: "var(--text-main)" }}
                  />
                ) : (
                  <div
                    style={{ fontSize: "20px", fontWeight: "800", color: monthlyBudget ? "var(--text-main)" : "var(--text-light)", letterSpacing: "-0.5px", cursor: "pointer" }}
                    onClick={() => { setEditingBudget(true); setBudgetInput(monthlyBudget ? String(monthlyBudget) : ""); }}
                  >
                    {monthlyBudget ? `${formatMoney(monthlyBudget)}` : t("home.setGoal")}
                  </div>
                )}
              </div>
            </div>

            {/* Prélèvements attendus : l'information sans ouvrir l'onglet Abonnements */}
            {upcoming && (
              <button type="button" onClick={openSubscriptions} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", width: "100%",
                padding: "8px 10px", marginBottom: "14px", borderRadius: "10px", border: "1px solid var(--border-color)",
                background: "var(--bg-body)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "12px", cursor: "pointer", textAlign: "left",
              }}>
                <span>🔁 {t("home.upcoming", { amount: `${formatMoney(upcoming.total)}`, n: upcoming.count })}</span>
                <span aria-hidden="true" style={{ color: "var(--text-light)" }}>›</span>
              </button>
            )}

            {/* Jauge budget */}
            {monthlyBudget != null && budgetPercent != null && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ background: "var(--bg-body)", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min(budgetPercent, 100)}%`,
                    height: "100%",
                    borderRadius: "6px",
                    background: budgetPercent < 70 ? "#34C759" : budgetPercent < 90 ? "#FF9500" : "#FF3B30",
                    transition: "width 0.6s ease",
                  }} />
                </div>
                <div style={{
                  fontSize: "11px", marginTop: "5px", textAlign: "right", fontWeight: "600",
                  color: budgetPercent < 70 ? "var(--ok-text)" : budgetPercent < 90 ? "var(--warn-text)" : "var(--danger-text)",
                }}>
                  {formatPercent(budgetPercent)}{" "}
                  {budgetPercent < 70 ? t("home.budgetGood") : budgetPercent < 90 ? t("home.budgetWarn") : t("home.budgetOver")}
                  {projectedMonthSpending != null && monthlyBudget && projectedMonthSpending > monthlyBudget && (
                    <span style={{ color: "var(--danger-text)", marginLeft: "6px" }}>
                      {t("home.projOver", { amount: `${formatMoney(projectedMonthSpending - monthlyBudget)}` })}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Séparateur tags — toujours visible */}
            <div style={{ fontSize: "10px", color: "var(--text-light)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", marginTop: "4px" }}>
              {t("home.byCategory")}
            </div>

            {tagStatsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" }}>
                {[80, 65, 50].map((w, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="skeleton" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div className="skeleton skeleton-text" style={{ width: `${w}%` }} />
                      <div className="skeleton" style={{ height: 4, borderRadius: 2, width: `${w * 0.7}%` }} />
                    </div>
                    <div className="skeleton skeleton-text" style={{ width: 50 }} />
                  </div>
                ))}
              </div>
            ) : topTags.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--text-light)", padding: "8px 0", textAlign: "center" }}>
                {t("home.noTagged")}<br />
                <span style={{ fontSize: "11px" }}>{t("home.noTaggedHint")}</span>
              </div>
            ) : (
              <>
                {topTags.map(tag => {
                  const barMax = topTags[0]?.totalAmount || 1;
                  const budget = tagBudgets[tag.tagId];
                  const budgetPct = budget ? (tag.totalAmount / budget) * 100 : null;
                  const isEditingThis = editingTagBudget === tag.tagId;
                  const barColor = budgetPct == null
                    ? (tag.color || "#007AFF")
                    : budgetPct >= 100 ? "#FF3B30"
                    : budgetPct >= 85 ? "#FF9500"
                    : "#34C759";

                  return (
                    <div key={tag.tagId} style={{ marginBottom: "10px" }}>
                      {/* Ligne principale */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "15px", flexShrink: 0, width: "20px", textAlign: "center" }}>{tag.emoji}</span>
                        <span
                          title={tag.tagName}
                          style={{ fontSize: "12px", color: "var(--text-main)", flex: "0 0 92px", lineHeight: 1.2, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                        >{tag.tagName}</span>
                        <div style={{ flex: 1, background: "var(--bg-body)", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                          <div style={{
                            width: `${(tag.totalAmount / barMax) * 100}%`,
                            height: "100%",
                            borderRadius: "4px",
                            background: tag.color || "#007AFF",
                          }} />
                        </div>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)", flexShrink: 0, minWidth: "48px", textAlign: "right" }}>{formatMoney(tag.totalAmount)}</span>
                        {/* Bouton budget */}
                        {!isEditingThis && (
                          <button
                            onClick={() => { setEditingTagBudget(tag.tagId); setTagBudgetInput(budget ? String(budget) : ""); }}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: budget ? "11px" : "18px", color: budget ? textTone(barColor) : "var(--text-muted)", flexShrink: 0, padding: "0 2px", lineHeight: 1, minWidth: "32px", minHeight: "32px", display: "flex", alignItems: "center", justifyContent: "center" }}
                            title={budget ? t("home.budgetTitle", { amount: `${formatMoney(budget)}` }) : t("home.setBudget")}
                            aria-label={budget ? t("home.budgetTitle", { amount: `${formatMoney(budget)}` }) : t("home.setBudget")}
                          >
                            {budget ? `/${formatMoney(budget)}` : "+"}
                          </button>
                        )}
                        {isEditingThis && (
                          <input
                            type="number"
                            value={tagBudgetInput}
                            onChange={e => setTagBudgetInput(e.target.value)}
                            onBlur={() => handleSaveTagBudget(tag.tagId)}
                            onKeyDown={e => {
                              if (e.key === "Enter") handleSaveTagBudget(tag.tagId);
                              if (e.key === "Escape") { setEditingTagBudget(null); setTagBudgetInput(""); }
                            }}
                            autoFocus
                            placeholder={t("home.budgetPlaceholder")}
                            style={{ width: "60px", fontSize: "11px", border: "none", borderBottom: "1px solid #007AFF", background: "transparent", outline: "none", color: "var(--text-main)", textAlign: "right" }}
                          />
                        )}
                      </div>

                      {/* Mini-jauge budget si défini */}
                      {budget != null && budgetPct != null && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", paddingLeft: "28px" }}>
                          <div style={{ flex: 1, background: "var(--bg-body)", borderRadius: "3px", height: "3px", overflow: "hidden" }}>
                            <div style={{
                              width: `${Math.min(budgetPct, 100)}%`,
                              height: "100%",
                              borderRadius: "3px",
                              background: barColor,
                              transition: "width 0.4s ease",
                            }} />
                          </div>
                          <span style={{
                            fontSize: "10px", fontWeight: "700", flexShrink: 0,
                            color: textTone(barColor),
                          }}>
                            {formatPercent(budgetPct)}
                            {budgetPct >= 100 && " 🚨"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {monthlyTagStats.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTags((v) => !v)}
                    aria-expanded={showAllTags}
                    style={{ display: "block", width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", fontWeight: 600, color: "#007AFF", textAlign: "center", marginTop: "6px", padding: "6px 0" }}
                  >
                    {showAllTags
                      ? t("home.fewerCategories")
                      : t(monthlyTagStats.length - 5 === 1 ? "home.moreCategoriesOne" : "home.moreCategories", { n: monthlyTagStats.length - 5 })}
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* 🏺 Mes jarres — le mois (avec sélecteur) ou les soldes cumulés */}
      <section style={{ padding: "0 16px 12px" }}>
        <div style={{
          background: "var(--bg-card)",
          borderRadius: "16px",
          padding: "16px",
          border: "1px solid var(--border-color)",
          boxShadow: "var(--shadow-md)",
        }}>
          <div className="jars-head">
            <div className="jars-head-title">{t("home.myJars")}</div>
            <div className="jars-seg" role="tablist" aria-label={t("home.myJars")}>
              <button type="button" role="tab" aria-selected={jarsMode === "month"} className={`jars-seg-btn${jarsMode === "month" ? " jars-seg-btn--on" : ""}`} onClick={() => setJarsMode("month")}>
                {t("home.modeMonth")}
              </button>
              <button type="button" role="tab" aria-selected={jarsMode === "balance"} className={`jars-seg-btn${jarsMode === "balance" ? " jars-seg-btn--on" : ""}`} onClick={() => setJarsMode("balance")}>
                {t("home.modeBalance")}
              </button>
            </div>
          </div>

          <p className="jars-legend">{t("home.jarsLegend")}</p>

          {jarsMode === "month" ? (
            <>
              <div className="jars-month-nav">
                <button type="button" className="jars-month-btn" aria-label={t("home.prevMonth")} disabled={monthOffset <= -MAX_MONTHS_BACK} onClick={() => setMonthOffset((o) => Math.max(-MAX_MONTHS_BACK, o - 1))}>‹</button>
                <span className="jars-month-label">{viewMonthLabel}</span>
                <button type="button" className="jars-month-btn" aria-label={t("home.nextMonth")} disabled={isCurrentView} onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}>›</button>
              </div>

            {(["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"] as JarKey[]).map(jarKey => {
              const data = jarMonthlyProjections[jarKey];
              if (!data) return null;
              const { spent, projected } = data;
              // Allocation = revenu du mois × % jar (méthode Harv Eker)
              const allocation = jarMonthlyAllocations?.[jarKey] ?? null;
              // Avant le 10 du mois on compare à ce qui est déjà dépensé, pas à une extrapolation
              const basis = showProjection ? projected : spent;
              const projPct = allocation ? (basis / allocation) * 100 : null;
              const spentPct = allocation ? (spent / allocation) * 100 : null;
              const barColor = projPct == null
                ? JAR_COLORS[jarKey]
                : projPct >= 100 ? "#FF3B30"
                : projPct >= 80  ? "#FF9500"
                : "#34C759";

              return (
                <div key={jarKey} style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "15px", width: "20px", textAlign: "center", flexShrink: 0, opacity: spent === 0 ? 0.5 : 1 }}>
                      {JAR_EMOJIS[jarKey]}
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: spent === 0 ? "var(--text-light)" : "var(--text-main)", flex: "0 0 44px" }}>
                      {jarKey}
                    </span>
                    <div style={{ flex: 1, background: "var(--bg-body)", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                      <div style={{
                        width: allocation
                          ? `${Math.min((basis / allocation) * 100, 100)}%`
                          : spent > 0 ? "20%" : "0%",
                        height: "100%",
                        borderRadius: "4px",
                        background: barColor,
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, minWidth: "80px" }}>
                      {spent > 0 ? (
                        <>
                          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            {formatMoney(spent)}
                            {spentPct != null && (
                              <span style={{ color: "var(--text-light)", fontSize: "10px" }}> ({formatPercent(spentPct)})</span>
                            )}
                          </div>
                          {showProjection && (
                            <div style={{ fontSize: "11px", fontWeight: "700", color: textTone(barColor) }}>
                              ≈ {formatMoney(projected)}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: "10px", color: "var(--text-light)" }}>{formatMoney(0)}</div>
                      )}
                    </div>
                  </div>
                  {spent === 0 ? (
                    hasRevenueHistory && !allocation ? null : <div style={{ paddingLeft: "28px", marginTop: "3px" }}>
                      <span style={{ fontSize: "10px", color: "var(--text-light)", fontStyle: "italic" }}>
                        {JAR_EMPTY_COPY[jarKey]}
                      </span>
                    </div>
                  ) : allocation && (
                    <div style={{ paddingLeft: "28px", display: "flex", justifyContent: "space-between", marginTop: "3px" }}>
                      <span style={{ fontSize: "10px", color: "var(--text-light)" }}>
                        {t("home.allocated", { amount: `${formatMoney(allocation)}` })}
                      </span>
                      <span style={{ fontSize: "10px", fontWeight: "700", color: textTone(barColor) }}>
                        {showProjection ? t("home.projShort") : t("home.spent")} {formatPercent(projPct!)}
                        {projPct! >= 100 ? " 🚨" : projPct! >= 80 ? " ⚠️" : " ✓"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Légende revenus du mois */}
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "10px", marginTop: "4px" }}>
              {jarMonthlyAllocations ? (
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
                  {t("home.basedOn", { amount: `${formatMoney(viewMonthRevenue)}` })}
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
                    {hasRevenueHistory ? t("home.noIncomeMonth", { label: viewMonthLabel }) : t("home.jarsActivate")}
                  </div>
                  <button
                    type="button"
                    onClick={onOpenRevenue}
                    style={{
                      fontSize: "12px", fontWeight: "700", color: "var(--ok-text)",
                      background: "rgba(52,199,89,0.1)", border: "1px solid rgba(52,199,89,0.3)",
                      borderRadius: "12px", padding: "6px 16px", cursor: "pointer",
                    }}
                  >
                    {t("home.recordIncome")}
                  </button>
                </div>
              )}
            </div>
            </>
          ) : (
            <>
          {loading && !totals && (
            <div className="jars-v2-loading-inline">
              <div className="spinner"></div>
              <p>{t("home.loadingData")}</p>
            </div>
          )}

          {error && !totals && (
            <div className="jars-v2-error-inline">
              <p>❌ {error}</p>
              <button onClick={loadTotals} className="btn-retry">
                {t("home.retry")}
              </button>
            </div>
          )}

              {totals && (
                <>
              <ul className="jars-bal-list">
                {jarKeys.map((key) => {
                  const jar = totals.jars[key];
                  const backendSplit = totals.split?.[key];
                  const settingsSplit = customSplit?.[key];
                  // settingsSplit est en fraction (0.55), backendSplit est en entier (55)
                  const split = settingsSplit != null ? settingsSplit : backendSplit != null ? backendSplit / 100 : 0;
                  const received = jar.revenues || 0; // déposé par les revenus (+ solde initial, transferts, déficits effacés)
                  const spent = jar.spendings || 0; // prélevé par les dépenses
                  const pct = received > 0 ? (spent / received) * 100 : 0;
                  const over = jar.net < -0.005;
                  const color = over ? "#FF3B30" : pct >= 80 ? "#FF9500" : JAR_COLORS[key];
                  const amount = (n: number) =>
                    Math.abs(n) >= 10000 ? formatMoney(Math.round(n), 0) : formatMoney(n);
                  return (
                    <li key={key} className={`jars-bal-row${over ? " jars-bal-row--over" : ""}`}>
                      <div className="jars-bal-top">
                        <span className="jars-bal-name">
                          <span aria-hidden="true">{JAR_EMOJIS[key]}</span>
                          <span className="jars-bal-label">{JAR_LABELS[key]}</span>
                          <span className="jars-bal-pct">{formatPercent(split * 100)}</span>
                        </span>
                        <span className="jars-bal-rest">
                          <span className="jars-bal-rest-label">{over ? t("home.overBy") : t("home.remaining")}</span>
                          <span className="jars-bal-rest-amount" style={over ? { color: "var(--danger-text)" } : undefined}>
                            {amount(jar.net)}
                          </span>
                        </span>
                      </div>
                      <div className="jar-progress-bar" aria-hidden="true">
                        <div className="jar-progress-fill" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                      </div>
                      <div className="jars-bal-meta">
                        <span>{t("home.received", { amount: `${amount(received)}` })}</span>
                        <span style={over ? { color: "var(--danger-text)", fontWeight: 700 } : undefined}>
                          {t("home.spentOf", { amount: `${amount(spent)}`, pct: pct > 999 ? "999+" : formatPercent(pct).replace(/\s?%$/, "") })}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
                </>
              )}
            </>
          )}
        </div>
      </section>

    </main>
  );
};

export default JarsViewV2;
