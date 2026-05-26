// src/components/JarsViewV2.tsx
// NOUVELLE VERSION - UX Optimisée pour usage mobile quotidien
import React, { useEffect, useState, useMemo } from "react";
import { fetchTotals, fetchAnalytics, fetchNetWorth, AnalyticsResponse, searchSpendings } from "../api";
import { TotalsResponse, JarKey } from "../types";
import { calculateTagStats, TagStat } from "../tagStatsUtils";

const JAR_LABELS: Record<JarKey, string> = {
  NEC: "Nécessités",
  FFA: "Liberté Financière",
  LTSS: "Épargne Long Terme",
  PLAY: "Fun / Play",
  EDUC: "Éducation",
  GIFT: "Don / Gift",
};

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

const MONTH_LABELS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

function formatMoney(value: number | null | undefined): string {
  const v = typeof value === "number" && !isNaN(value) ? value : 0;
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

// ── Détection des abonnements récurrents ─────────────────────────────────────

type SubscriptionFreq = "mensuel" | "trimestriel" | "semestriel" | "annuel";
const FREQ_DIVISOR: Record<SubscriptionFreq, number> = {
  mensuel: 1, trimestriel: 3, semestriel: 6, annuel: 12,
};
const FREQ_LABEL: Record<SubscriptionFreq, string> = {
  mensuel: "mensuel", trimestriel: "trimestriel", semestriel: "semestriel", annuel: "annuel",
};

interface RecurringItem {
  description: string;
  avgAmount: number;       // montant moyen brut
  monthlyAmount: number;   // équivalent mensuel (= avgAmount / diviseur)
  lastAmount: number;
  occurrences: number;
  uniqueMonths: number;
  isFixed: boolean;        // variation de montant < 5 %
  account: string;
  lastDate: string;
  freq?: SubscriptionFreq; // défini si marqué manuellement
}

function getMonthKeyFromDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const fr = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, "0")}`;
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return null;
}

function detectRecurring(transactions: import("../types").SearchSpendingResult[]): RecurringItem[] {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

  // ── 1. Abonnements marqués manuellement (colonne G) ──────────────────────
  // On groupe par libellé normalisé pour prendre le dernier de chaque
  const manualMap = new Map<string, import("../types").SearchSpendingResult[]>();
  for (const t of transactions) {
    const freq = (t.subscription || "").trim().toLowerCase();
    if (!freq || !(freq in FREQ_DIVISOR)) continue;
    const key = normalize(t.description || "");
    if (!key || key.length < 3) continue;
    if (!manualMap.has(key)) manualMap.set(key, []);
    manualMap.get(key)!.push(t);
  }

  const manualItems: RecurringItem[] = [];
  const manualKeys = new Set<string>();

  manualMap.forEach((txns, key) => {
    const sorted = [...txns].sort((a, b) =>
      (getMonthKeyFromDate(b.date) ?? "").localeCompare(getMonthKeyFromDate(a.date) ?? "")
    );
    const last = sorted[0];
    const freq = (last.subscription || "mensuel") as SubscriptionFreq;
    const amounts = txns.map(t => Math.abs(t.amount || 0)).filter(a => a > 0);
    const avg = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    const isFixed = avg > 0 ? (max - min) / avg < 0.05 : true;
    const divisor = FREQ_DIVISOR[freq] ?? 1;

    manualKeys.add(key);
    manualItems.push({
      description: last.description || "",
      avgAmount: avg,
      monthlyAmount: avg / divisor,
      lastAmount: Math.abs(last.amount || avg),
      occurrences: txns.length,
      uniqueMonths: new Set(txns.map(t => getMonthKeyFromDate(t.date)).filter(Boolean)).size,
      isFixed,
      account: last.account || "",
      lastDate: last.date || "",
      freq,
    });
  });

  // ── 2. Détection automatique (6 derniers mois, libellé non déjà couvert) ──
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const sixMonthsAgoKey = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, "0")}`;

  const recent = transactions.filter(t => {
    const mk = getMonthKeyFromDate(t.date);
    return mk !== null && mk >= sixMonthsAgoKey;
  });

  const groups = new Map<string, typeof recent>();
  for (const t of recent) {
    const key = normalize(t.description || "");
    if (!key || key.length < 3) continue;
    if (manualKeys.has(key)) continue; // déjà traité manuellement
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const autoItems: RecurringItem[] = [];

  groups.forEach((txns) => {
    const months = new Set(txns.map(t => getMonthKeyFromDate(t.date)).filter(Boolean) as string[]);
    if (months.size < 2) return;

    const amounts = txns.map(t => Math.abs(t.amount || 0)).filter(a => a > 0);
    if (amounts.length === 0) return;

    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    const isFixed = avg > 0 ? (max - min) / avg < 0.05 : false;

    const sorted = [...txns].sort((a, b) =>
      (getMonthKeyFromDate(b.date) ?? "").localeCompare(getMonthKeyFromDate(a.date) ?? "")
    );
    const last = sorted[0];

    autoItems.push({
      description: last.description || "",
      avgAmount: avg,
      monthlyAmount: avg,
      lastAmount: Math.abs(last.amount || avg),
      occurrences: txns.length,
      uniqueMonths: months.size,
      isFixed,
      account: last.account || "",
      lastDate: last.date || "",
    });
  });

  // ── 3. Fusion : manuels en tête, puis auto ────────────────────────────────
  const sortFn = (a: RecurringItem, b: RecurringItem) => {
    if (a.isFixed !== b.isFixed) return a.isFixed ? -1 : 1;
    return b.monthlyAmount - a.monthlyAmount;
  };

  return [
    ...manualItems.sort(sortFn),
    ...autoItems.sort(sortFn),
  ];
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
    if (!ts) return "jamais";
    const diffMs = Date.now() - parseInt(ts, 10);
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffMin < 2) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    if (diffH < 24) return `il y a ${diffH}h`;
    if (diffD === 1) return "hier";
    if (diffD < 7) return `il y a ${diffD} jours`;
    return `il y a ${Math.floor(diffD / 7)} sem.`;
  } catch { return "jamais"; }
}

const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

/** Dépenses totales depuis le 1er janv. de l'année en cours et nombre de jours écoulés */
function getYtdSpendingsAndDays(analytics: AnalyticsResponse | null): { ytdSpendings: number; daysElapsed: number } {
  const now = new Date();
  const year = now.getFullYear();
  const currentMonthStr = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const startOfYear = new Date(year, 0, 1);
  const daysElapsed = Math.max(1, Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1);

  if (!analytics?.monthlyData?.length) {
    return { ytdSpendings: 0, daysElapsed };
  }

  const yearMonths = analytics.monthlyData.filter((d) => {
    const n = normalizeMonth(d.month);
    return n !== null && n >= `${year}-01` && n <= currentMonthStr;
  });
  let ytdSpendings = yearMonths.reduce((s, d) => s + (d.spendings || 0), 0);
  const hasCurrentMonth = yearMonths.some((d) => normalizeMonth(d.month) === currentMonthStr);
  if (!hasCurrentMonth && analytics.trends?.spendings?.current != null) {
    ytdSpendings += analytics.trends.spendings.current;
  }
  return { ytdSpendings, daysElapsed };
}

/** Calcule la moyenne glissante 30j pour chaque semaine depuis le 1er janv. */
function computeWeeklyRolling30dAvg(
  analytics: AnalyticsResponse | null
): { label: string; avg: number; date: Date }[] {
  if (!analytics?.monthlyData?.length) return [];

  const now = new Date();
  const year = now.getFullYear();

  // Construire une map des dépenses mensuelles
  const monthlySpending: Record<string, number> = {};
  const monthlyDays: Record<string, number> = {};

  for (const d of analytics.monthlyData) {
    const norm = normalizeMonth(d.month);
    if (norm) {
      const [y, m] = norm.split("-").map(Number);
      monthlySpending[norm] = d.spendings || 0;
      monthlyDays[norm] = new Date(y, m, 0).getDate();
    }
  }

  // Inclure le mois en cours depuis trends
  const currentMonthStr = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (analytics.trends?.spendings?.current != null) {
    monthlySpending[currentMonthStr] = analytics.trends.spendings.current;
    monthlyDays[currentMonthStr] = new Date(year, now.getMonth() + 1, 0).getDate();
  }

  function getDailyRate(date: Date): number {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (!monthlyDays[key]) return 0;
    return (monthlySpending[key] || 0) / monthlyDays[key];
  }

  const points: { label: string; avg: number; date: Date }[] = [];
  // Commencer au 7 janv. pour avoir une fenêtre 30j significative
  let current = new Date(year, 0, 7);

  while (current <= now) {
    let sum = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(current);
      d.setDate(d.getDate() - i);
      sum += getDailyRate(d);
    }
    const avg = sum / 30;
    const label = `${current.getDate()}/${current.getMonth() + 1}`;
    points.push({ label, avg, date: new Date(current) });

    const next = new Date(current);
    next.setDate(next.getDate() + 7);
    current = next;
  }

  return points;
}

interface JarsViewV2Props {
  onOpenSpending: () => void;
  onOpenRevenue: () => void;
}

const JarsViewV2: React.FC<JarsViewV2Props> = ({ onOpenSpending, onOpenRevenue }) => {
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [netWorth, setNetWorth] = useState<number | null>(null);
  const [netWorthLoading, setNetWorthLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customSplit, setCustomSplit] = useState<Record<JarKey, number> | null>(null);
  const [showJarsDetail, setShowJarsDetail] = useState(false);

  // Budget mensuel
  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(loadMonthlyBudget);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  // Tag stats mois en cours
  const [monthlyTagStats, setMonthlyTagStats] = useState<TagStat[]>([]);
  const [tagStatsLoading, setTagStatsLoading] = useState(false);

  // Abonnements récurrents
  const [subscriptions, setSubscriptions] = useState<RecurringItem[]>([]);
  const [showSubscriptions, setShowSubscriptions] = useState(false);

  // Budget par tag
  const [tagBudgets, setTagBudgets] = useState<Record<string, number>>(loadTagBudgets);
  const [editingTagBudget, setEditingTagBudget] = useState<string | null>(null);
  const [tagBudgetInput, setTagBudgetInput] = useState("");

  // Dernier import
  const [lastImportLabel] = useState<string>(getLastImportLabel);

  /** Charge uniquement les totaux (lazy, au clic "Voir le détail") */
  const loadTotals = async () => {
    try {
      setLoading(true);
      setError(null);
      const totalsData = await fetchTotals();
      setTotals(totalsData);
    } catch (err: any) {
      console.error("Erreur chargement totals:", err);
      setError(err?.message || "Erreur lors du chargement des totaux.");
    } finally {
      setLoading(false);
    }
  };

  /** Charge les analytics (au mount, pour le graphique) */
  const loadAnalytics = async () => {
    try {
      const analyticsData = await fetchAnalytics();
      setAnalytics(analyticsData ?? null);
    } catch {
      // silencieux — le graphique ne s'affichera pas
    }
  };

  useEffect(() => {
    setCustomSplit(loadJarSplitFromSettings());
    loadAnalytics();
  }, []);

  // Un seul fetch pour les tags du mois, la détection des abonnements ET l'overlay graphique
  useEffect(() => {
    setTagStatsLoading(true);
    searchSpendings("", 500)
      .then(res => {
        const all = res.rows || [];
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

        // Détection des abonnements (6 derniers mois, toutes les transactions)
        setSubscriptions(detectRecurring(all));

        // Toutes les transactions pour l'overlay de tag sur le graphique
        setAllTransactionsForChart(all);
      })
      .catch(() => {})
      .finally(() => setTagStatsLoading(false));
  }, []);

  useEffect(() => {
    setNetWorthLoading(true);
    fetchNetWorth()
      .then(res => setNetWorth(typeof res.value === "number" ? res.value : null))
      .catch(() => setNetWorth(null))
      .finally(() => setNetWorthLoading(false));
  }, []);

  useEffect(() => {
    if (showJarsDetail && !totals && !loading) loadTotals();
  }, [showJarsDetail]);

  const totalRevenues = totals?.totalRevenues || 0;
  const totalSpendings = totals
    ? Object.values(totals.jars).reduce((acc, j) => acc + (j.spendings || 0), 0)
    : 0;
  const totalBalance = totalRevenues - totalSpendings;
  const jarKeys = totals ? (Object.keys(totals.jars) as JarKey[]) : [];

  const averageDailySpending = useMemo(() => {
    const { ytdSpendings, daysElapsed } = getYtdSpendingsAndDays(analytics);
    if (daysElapsed <= 0) return null;
    return ytdSpendings / daysElapsed;
  }, [analytics]);

  const rolling30dAverageSpending = useMemo(() => {
    if (!analytics?.trends) return null;
    const now = new Date();
    const dayOfMonth = now.getDate();
    const currentSpending = analytics.trends.spendings.current ?? 0;
    const prevSpending = analytics.trends.spendings.previous ?? 0;
    const daysFromPrev = 30 - dayOfMonth;

    if (daysFromPrev <= 0) return currentSpending / 30;

    const prevMonthNorm = normalizeMonth(analytics.trends.previousMonth);
    if (!prevMonthNorm) return currentSpending / 30;
    const [prevYear, prevMonth] = prevMonthNorm.split("-").map(Number);
    const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();

    const rolling30d = currentSpending + prevSpending * (daysFromPrev / daysInPrevMonth);
    return rolling30d / 30;
  }, [analytics]);

  /** Points hebdomadaires pour le graphique */
  const chartPoints = useMemo(() => computeWeeklyRolling30dAvg(analytics), [analytics]);

  /** Tag sélectionné pour l'overlay sur le graphique */
  const [tagOverlayId, setTagOverlayId] = useState<string | null>("alimentaire");

  /** Transactions "toutes" (pour l'overlay de tag sur le graphique) */
  const [allTransactionsForChart, setAllTransactionsForChart] = useState<import("../types").SearchSpendingResult[]>([]);

  /** Points overlay du tag sélectionné — recalculé depuis allTransactionsForChart */
  const tagOverlayPoints = useMemo((): { label: string; avg: number; date: Date }[] => {
    if (!tagOverlayId || allTransactionsForChart.length === 0) return [];
    const tagged = allTransactionsForChart.filter(t =>
      t.tags?.split(",").map(x => x.trim()).includes(tagOverlayId)
    );
    if (tagged.length === 0) return [];

    // Map: "YYYY-MM-DD" → total dépenses
    const daily: Record<string, number> = {};
    tagged.forEach(t => {
      const d = t.date;
      if (!d) return;
      // Normalise en YYYY-MM-DD
      let key: string | null = null;
      const fr = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (fr) key = `${fr[3]}-${fr[2].padStart(2,"0")}-${fr[1].padStart(2,"0")}`;
      else {
        const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) key = `${iso[1]}-${iso[2]}-${iso[3]}`;
        else {
          const parsed = new Date(d);
          if (!isNaN(parsed.getTime()))
            key = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,"0")}-${String(parsed.getDate()).padStart(2,"0")}`;
        }
      }
      if (key) daily[key] = (daily[key] || 0) + (t.amount || 0);
    });

    const now = new Date();
    const year = now.getFullYear();
    const points: { label: string; avg: number; date: Date }[] = [];
    let current = new Date(year, 0, 7);
    while (current <= now) {
      let sum = 0;
      for (let i = 0; i < 30; i++) {
        const di = new Date(current);
        di.setDate(di.getDate() - i);
        const key = `${di.getFullYear()}-${String(di.getMonth()+1).padStart(2,"0")}-${String(di.getDate()).padStart(2,"0")}`;
        sum += daily[key] || 0;
      }
      points.push({ label: `${current.getDate()}/${current.getMonth()+1}`, avg: sum / 30, date: new Date(current) });
      const next = new Date(current);
      next.setDate(next.getDate() + 7);
      current = next;
    }
    return points;
  }, [tagOverlayId, allTransactionsForChart]);

  /** Dépense mois en cours depuis analytics */
  const currentMonthSpending = analytics?.trends?.spendings?.current ?? null;

  /** Projection dépense fin de mois (linéaire sur jours écoulés) */
  const projectedMonthSpending = useMemo(() => {
    if (currentMonthSpending == null) return null;
    const now = new Date();
    const day = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (day <= 0) return null;
    return (currentMonthSpending / day) * daysInMonth;
  }, [currentMonthSpending]);

  /** % du budget consommé */
  const budgetPercent = useMemo(() => {
    if (!monthlyBudget || currentMonthSpending == null) return null;
    return (currentMonthSpending / monthlyBudget) * 100;
  }, [monthlyBudget, currentMonthSpending]);

  /** Label mois courant ex: "Avril 2026" */
  const currentMonthLabel = useMemo(() => {
    const now = new Date();
    return `${MONTHS_FR[now.getMonth()]} ${now.getFullYear()}`;
  }, []);

  /** Top 5 tags du mois */
  const topTags = useMemo(() => monthlyTagStats.slice(0, 5), [monthlyTagStats]);

  /** Sauvegarde du budget par tag */
  const handleSaveTagBudget = (tagId: string) => {
    const v = parseFloat(tagBudgetInput.replace(",", "."));
    if (!isNaN(v) && v > 0) {
      const updated = { ...tagBudgets, [tagId]: v };
      saveTagBudgets(updated);
      setTagBudgets(updated);
    } else if (tagBudgetInput === "" || tagBudgetInput === "0") {
      // Supprimer le budget si vide ou 0
      const updated = { ...tagBudgets };
      delete updated[tagId];
      saveTagBudgets(updated);
      setTagBudgets(updated);
    }
    setEditingTagBudget(null);
    setTagBudgetInput("");
  };

  /** Sauvegarde du budget inline */
  const handleSaveBudget = () => {
    const v = parseFloat(budgetInput.replace(",", "."));
    if (!isNaN(v) && v > 0) {
      saveMonthlyBudget(v);
      setMonthlyBudget(v);
    }
    setEditingBudget(false);
    setBudgetInput("");
  };

  /** Tendance : variation vs il y a 4 semaines */
  const spendingTrend = useMemo(() => {
    if (chartPoints.length < 2) return null;
    const latest = chartPoints[chartPoints.length - 1].avg;
    const compareIdx = Math.max(0, chartPoints.length - 5); // ~4 semaines avant
    const reference = chartPoints[compareIdx].avg;
    if (reference === 0) return null;
    const pct = ((latest - reference) / reference) * 100;
    return { pct, isGood: pct < 0 };
  }, [chartPoints]);

  /** Rendu du graphique SVG avec overlay de tag optionnel */
  const renderChart = () => {
    if (chartPoints.length < 2) return null;

    const W = 340, H = 130;
    const PL = 36, PR = 10, PT = 8, PB = 22;
    const CW = W - PL - PR;
    const CH = H - PT - PB;

    // Combiner les deux séries pour déterminer min/max de l'axe Y
    const allValues = [
      ...chartPoints.map(p => p.avg),
      ...(tagOverlayPoints.length > 0 ? tagOverlayPoints.map(p => p.avg) : []),
    ];
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;
    const yMin = Math.max(0, minVal - range * 0.1);
    const yMax = maxVal + range * 0.1;
    const yRange = yMax - yMin || 1;

    const toX = (i: number) => PL + (i / (chartPoints.length - 1)) * CW;
    const toY = (v: number) => PT + CH - ((v - yMin) / yRange) * CH;

    // Pour l'overlay, les points peuvent avoir un nombre différent — on les aligne sur l'axe X du chart principal
    const toXOverlay = tagOverlayPoints.length > 1
      ? (i: number) => PL + (i / (tagOverlayPoints.length - 1)) * CW
      : toX;

    const linePath = chartPoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.avg).toFixed(1)}`)
      .join(" ");
    const areaPath = `${linePath} L ${toX(chartPoints.length - 1).toFixed(1)} ${(PT + CH).toFixed(1)} L ${toX(0).toFixed(1)} ${(PT + CH).toFixed(1)} Z`;

    // Overlay tag
    const overlayLinePath = tagOverlayPoints.length >= 2
      ? tagOverlayPoints
          .map((p, i) => `${i === 0 ? "M" : "L"} ${toXOverlay(i).toFixed(1)} ${toY(p.avg).toFixed(1)}`)
          .join(" ")
      : null;

    // Labels de mois sur l'axe X
    const monthLabels: { x: number; label: string }[] = [];
    let lastMonth = -1;
    chartPoints.forEach((p, i) => {
      const m = p.date.getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ x: Math.min(toX(i), W - PR - 12), label: MONTH_LABELS_FR[m] });
        lastMonth = m;
      }
    });

    // 3 labels sur l'axe Y
    const yLabelValues = [yMin + yRange * 0.05, yMin + yRange * 0.5, yMin + yRange * 0.95];

    // Couleur overlay (vert lime pour alimentaire)
    const OVERLAY_COLOR = "#84CC16";

    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <defs>
          <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF2D78" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#FF2D78" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Lignes de grille horizontales */}
        {yLabelValues.map((v, i) => (
          <line
            key={i}
            x1={PL} y1={toY(v).toFixed(1)}
            x2={W - PR} y2={toY(v).toFixed(1)}
            stroke="rgba(0,0,0,0.06)"
            strokeWidth="1"
          />
        ))}

        {/* Aire sous la courbe */}
        <path d={areaPath} fill="url(#chartAreaGrad)" />

        {/* Ligne principale */}
        <path
          d={linePath}
          fill="none"
          stroke="#FF2D78"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Overlay tag */}
        {overlayLinePath && (
          <path
            d={overlayLinePath}
            fill="none"
            stroke={OVERLAY_COLOR}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 2"
          />
        )}

        {/* Points de données (un sur deux + dernier) */}
        {chartPoints.map((p, i) => {
          if (i % 2 !== 0 && i !== chartPoints.length - 1) return null;
          const isLast = i === chartPoints.length - 1;
          return (
            <circle
              key={i}
              cx={toX(i).toFixed(1)}
              cy={toY(p.avg).toFixed(1)}
              r={isLast ? 4.5 : 2.5}
              fill={isLast ? "#FF2D78" : "rgba(255,45,120,0.45)"}
              stroke={isLast ? "#fff" : "none"}
              strokeWidth={isLast ? 2 : 0}
            />
          );
        })}

        {/* Dernier point overlay */}
        {overlayLinePath && tagOverlayPoints.length > 0 && (
          <circle
            cx={toXOverlay(tagOverlayPoints.length - 1).toFixed(1)}
            cy={toY(tagOverlayPoints[tagOverlayPoints.length - 1].avg).toFixed(1)}
            r="3.5"
            fill={OVERLAY_COLOR}
            stroke="#fff"
            strokeWidth="1.5"
          />
        )}

        {/* Labels axe Y */}
        {yLabelValues.map((v, i) => (
          <text
            key={i}
            x={PL - 4}
            y={toY(v) + 3.5}
            textAnchor="end"
            fontSize="9"
            fill="#AEAEB2"
          >
            {Math.round(v)}€
          </text>
        ))}

        {/* Labels axe X */}
        {monthLabels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={H - 5}
            textAnchor="middle"
            fontSize="9"
            fill="#AEAEB2"
          >
            {l.label}
          </text>
        ))}
      </svg>
    );
  };

  return (
    <main className="jars-v2-page">
      {/* 🎯 Actions rapides */}
      <section className="jars-v2-quick-actions">
        <button
          type="button"
          className="quick-action-btn quick-action-spending"
          onClick={onOpenSpending}
        >
          <span className="quick-action-icon">💰</span>
          <div className="quick-action-text">
            <span className="quick-action-label">Dépense</span>
            <span className="quick-action-sub">Rapide</span>
          </div>
        </button>

        <button
          type="button"
          className="quick-action-btn quick-action-revenue"
          onClick={onOpenRevenue}
        >
          <span className="quick-action-icon">💵</span>
          <div className="quick-action-text">
            <span className="quick-action-label">Revenu</span>
            <span className="quick-action-sub">Ajouter</span>
          </div>
        </button>
      </section>

      {/* 📉 Widget dépenses / jour — toujours visible */}
      <section style={{ padding: "0 16px 12px" }}>
        <div style={{
          background: "#fff",
          borderRadius: "16px",
          padding: "16px 16px 10px",
          border: "1px solid #E5E5EA",
          boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
        }}>
          {/* Titre */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div style={{ fontSize: "11px", color: "#8E8E93", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              📉 Dépenses moyennes / jour
            </div>
            <div style={{ fontSize: "10px", color: lastImportLabel === "jamais" ? "#FF9500" : "#C7C7CC", display: "flex", alignItems: "center", gap: "3px" }}>
              <span>🔄</span>
              <span>{lastImportLabel}</span>
            </div>
          </div>

          {/* Les deux chiffres côte à côte, même taille */}
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "10px" }}>
            {/* Glissant 30j */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: "#8E8E93", marginBottom: "2px" }}>Glissant 30j</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "26px", fontWeight: "800", color: "#1C1C1E", letterSpacing: "-0.5px", lineHeight: 1.1 }}>
                  {rolling30dAverageSpending != null
                    ? `${formatMoney(rolling30dAverageSpending)} €`
                    : analytics === null
                      ? <span className="skeleton skeleton-amount" style={{ width: 100, display: "inline-block" }}>&nbsp;</span>
                      : <span style={{ fontSize: "16px", color: "#C7C7CC" }}>—</span>
                  }
                </span>
                {spendingTrend && (
                  <span style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: spendingTrend.isGood ? "#34C759" : "#FF9500",
                    backgroundColor: spendingTrend.isGood ? "rgba(52,199,89,0.12)" : "rgba(255,149,0,0.12)",
                    borderRadius: "8px",
                    padding: "2px 7px",
                  }}>
                    {spendingTrend.isGood ? "↓" : "↑"} {Math.abs(spendingTrend.pct).toFixed(1)}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: "10px", color: "#AEAEB2", marginTop: "2px" }}>vs 4 semaines</div>
            </div>

            {/* Séparateur vertical */}
            <div style={{ width: "1px", background: "#E5E5EA", alignSelf: "stretch", margin: "0 4px" }} />

            {/* Moyenne YTD */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: "#8E8E93", marginBottom: "2px" }}>Moyenne YTD</div>
              <div style={{ fontSize: "26px", fontWeight: "800", color: "#FF2D78", letterSpacing: "-0.5px", lineHeight: 1.1 }}>
                {averageDailySpending != null
                  ? `${formatMoney(averageDailySpending)} €`
                  : <span style={{ fontSize: "16px", color: "#C7C7CC" }}>—</span>
                }
              </div>
              <div style={{ fontSize: "10px", color: "#AEAEB2", marginTop: "2px" }}>depuis jan. {new Date().getFullYear()}</div>
            </div>
          </div>

          {/* 🥗 Alimentation avg/jour — grand format */}
          {tagOverlayPoints.length > 0 && (
            <div style={{
              background: "rgba(132,204,22,0.07)",
              borderRadius: "12px",
              padding: "10px 14px",
              marginBottom: "10px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              border: "1px solid rgba(132,204,22,0.2)",
            }}>
              <span style={{ fontSize: "22px", flexShrink: 0 }}>🥗</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", color: "#84CC16", fontWeight: "700", marginBottom: "2px" }}>
                  Alimentation · Glissant 30j
                </div>
                <div style={{ fontSize: "26px", fontWeight: "800", color: "#84CC16", letterSpacing: "-0.5px", lineHeight: 1.1 }}>
                  {formatMoney(tagOverlayPoints[tagOverlayPoints.length - 1].avg)} €<span style={{ fontSize: "13px", fontWeight: "600", color: "#84CC16", opacity: 0.8 }}> /jour</span>
                </div>
              </div>
            </div>
          )}

          {/* Graphique */}
          {chartPoints.length >= 2
            ? renderChart()
            : analytics === null && (
              <div style={{ height: "80px", borderRadius: 12, overflow: "hidden" }}>
                <div className="skeleton" style={{ width: "100%", height: "100%" }} />
              </div>
            )
          }
          {/* Légende graphique */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: 16, height: 2.5, borderRadius: 2, background: "#FF2D78" }} />
                <span style={{ fontSize: "10px", color: "#AEAEB2" }}>Total</span>
              </div>
              {tagOverlayPoints.length >= 2 && (
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <svg width="16" height="6" style={{ overflow: "visible" }}>
                    <line x1="0" y1="3" x2="16" y2="3" stroke="#84CC16" strokeWidth="2" strokeDasharray="4 2" />
                  </svg>
                  <span style={{ fontSize: "10px", color: "#84CC16", fontWeight: 600 }}>
                    🥗 {formatMoney(tagOverlayPoints[tagOverlayPoints.length - 1].avg)} €/j
                  </span>
                </div>
              )}
            </div>
            <div style={{ fontSize: "10px", color: "#C7C7CC" }}>
              Moy. 30j · par semaine
            </div>
          </div>
        </div>
      </section>

      {/* 📅 Card "Ce mois" — projection + budget + tags */}
      {(currentMonthSpending != null || tagStatsLoading) && (
        <section style={{ padding: "0 16px 12px" }}>
          <div style={{
            background: "#fff",
            borderRadius: "16px",
            padding: "16px",
            border: "1px solid #E5E5EA",
            boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
          }}>
            {/* Titre */}
            <div style={{ fontSize: "11px", color: "#8E8E93", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>
              📅 Ce mois — {currentMonthLabel}
            </div>

            {/* 3 colonnes : Dépensé | Projection | Objectif */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
              {/* Dépensé */}
              <div>
                <div style={{ fontSize: "10px", color: "#8E8E93", marginBottom: "3px" }}>Dépensé</div>
                <div style={{ fontSize: "20px", fontWeight: "800", color: "#1C1C1E", letterSpacing: "-0.5px" }}>
                  {currentMonthSpending != null ? `${formatMoney(currentMonthSpending)}€` : "—"}
                </div>
              </div>

              {/* Projection */}
              <div>
                <div style={{ fontSize: "10px", color: "#8E8E93", marginBottom: "3px" }}>Projection</div>
                <div style={{
                  fontSize: "20px", fontWeight: "800", letterSpacing: "-0.5px",
                  color: monthlyBudget && projectedMonthSpending != null
                    ? projectedMonthSpending > monthlyBudget ? "#FF3B30"
                    : projectedMonthSpending > monthlyBudget * 0.85 ? "#FF9500"
                    : "#1C1C1E"
                    : "#1C1C1E",
                }}>
                  {projectedMonthSpending != null ? `≈ ${formatMoney(projectedMonthSpending)}€` : "—"}
                </div>
              </div>

              {/* Objectif (éditable) */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "3px" }}>
                  <span style={{ fontSize: "10px", color: "#8E8E93" }}>Objectif</span>
                  <button
                    onClick={() => { setEditingBudget(true); setBudgetInput(monthlyBudget ? String(monthlyBudget) : ""); }}
                    style={{ background: "none", border: "none", padding: "0", cursor: "pointer", fontSize: "11px", lineHeight: 1 }}
                    title="Modifier l'objectif"
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
                    placeholder="ex: 2000"
                    style={{ width: "100%", fontSize: "17px", fontWeight: "800", border: "none", borderBottom: "2px solid #007AFF", background: "transparent", outline: "none", color: "#1C1C1E" }}
                  />
                ) : (
                  <div
                    style={{ fontSize: "20px", fontWeight: "800", color: monthlyBudget ? "#1C1C1E" : "#C7C7CC", letterSpacing: "-0.5px", cursor: "pointer" }}
                    onClick={() => { setEditingBudget(true); setBudgetInput(monthlyBudget ? String(monthlyBudget) : ""); }}
                  >
                    {monthlyBudget ? `${formatMoney(monthlyBudget)}€` : "Fixer →"}
                  </div>
                )}
              </div>
            </div>

            {/* Jauge budget */}
            {monthlyBudget != null && budgetPercent != null && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ background: "#F2F2F7", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
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
                  color: budgetPercent < 70 ? "#34C759" : budgetPercent < 90 ? "#FF9500" : "#FF3B30",
                }}>
                  {budgetPercent.toFixed(0)}%{" "}
                  {budgetPercent < 70 ? "✓ Bien" : budgetPercent < 90 ? "⚠️ Attention" : "🚨 Dépassé"}
                  {projectedMonthSpending != null && monthlyBudget && projectedMonthSpending > monthlyBudget && (
                    <span style={{ color: "#FF3B30", marginLeft: "6px" }}>
                      · Projection : +{formatMoney(projectedMonthSpending - monthlyBudget)}€ de dépassement
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Séparateur tags — toujours visible */}
            <div style={{ fontSize: "10px", color: "#AEAEB2", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", marginTop: "4px" }}>
              Par catégorie
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
              <div style={{ fontSize: "12px", color: "#AEAEB2", padding: "8px 0", textAlign: "center" }}>
                🏷️ Aucune transaction tagguée ce mois<br />
                <span style={{ fontSize: "11px" }}>Ajoutez des tags lors de l'import pour voir les catégories</span>
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
                        <span style={{ fontSize: "12px", color: "#3C3C43", flex: "0 0 72px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tag.tagName}</span>
                        <div style={{ flex: 1, background: "#F2F2F7", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                          <div style={{
                            width: `${(tag.totalAmount / barMax) * 100}%`,
                            height: "100%",
                            borderRadius: "4px",
                            background: tag.color || "#007AFF",
                          }} />
                        </div>
                        <span style={{ fontSize: "12px", color: "#8E8E93", flexShrink: 0, minWidth: "48px", textAlign: "right" }}>{formatMoney(tag.totalAmount)}€</span>
                        {/* Bouton budget */}
                        {!isEditingThis && (
                          <button
                            onClick={() => { setEditingTagBudget(tag.tagId); setTagBudgetInput(budget ? String(budget) : ""); }}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: budget ? barColor : "#C7C7CC", flexShrink: 0, padding: "0 2px", lineHeight: 1 }}
                            title={budget ? `Budget : ${formatMoney(budget)}€` : "Fixer un budget"}
                          >
                            {budget ? `/${formatMoney(budget)}€` : "+"}
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
                            placeholder="budget"
                            style={{ width: "60px", fontSize: "11px", border: "none", borderBottom: "1px solid #007AFF", background: "transparent", outline: "none", color: "#1C1C1E", textAlign: "right" }}
                          />
                        )}
                      </div>

                      {/* Mini-jauge budget si défini */}
                      {budget != null && budgetPct != null && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", paddingLeft: "28px" }}>
                          <div style={{ flex: 1, background: "#F2F2F7", borderRadius: "3px", height: "3px", overflow: "hidden" }}>
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
                            color: barColor,
                          }}>
                            {budgetPct.toFixed(0)}%
                            {budgetPct >= 100 && " 🚨"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {monthlyTagStats.length > 5 && (
                  <div style={{ fontSize: "11px", color: "#AEAEB2", textAlign: "center", marginTop: "4px" }}>
                    +{monthlyTagStats.length - 5} autres catégories
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* 🔁 Panneau abonnements récurrents */}
      {subscriptions.length > 0 && (
        <section style={{ padding: "0 16px 12px" }}>
          <div style={{
            background: "#fff",
            borderRadius: "16px",
            border: "1px solid #E5E5EA",
            boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
            overflow: "hidden",
          }}>
            {/* Header cliquable */}
            <button
              onClick={() => setShowSubscriptions(v => !v)}
              style={{
                width: "100%", background: "none", border: "none", cursor: "pointer",
                padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "#8E8E93", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  🔁 Abonnements récurrents
                </span>
                <span style={{
                  fontSize: "11px", fontWeight: "700", color: "#fff",
                  background: "#FF9500", borderRadius: "9px", padding: "1px 7px",
                }}>
                  {subscriptions.length}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {/* Total fixes (équivalent mensuel) */}
                {(() => {
                  const fixedTotal = subscriptions.filter(s => s.isFixed).reduce((sum, s) => sum + s.monthlyAmount, 0);
                  return fixedTotal > 0 ? (
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#1C1C1E" }}>
                      {formatMoney(fixedTotal)} €/mois
                    </span>
                  ) : null;
                })()}
                <span style={{ fontSize: "16px", color: "#AEAEB2", transform: showSubscriptions ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                  ▾
                </span>
              </div>
            </button>

            {/* Corps dépliable */}
            {showSubscriptions && (
              <div style={{ padding: "0 16px 16px" }}>
                {/* Section Fixes */}
                {subscriptions.some(s => s.isFixed) && (
                  <>
                    <div style={{ fontSize: "10px", color: "#AEAEB2", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                      🔒 Montant fixe
                    </div>
                    {subscriptions.filter(s => s.isFixed).map((sub, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "7px 0",
                        borderBottom: "1px solid #F2F2F7",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#1C1C1E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {sub.description}
                          </div>
                          <div style={{ fontSize: "11px", color: "#8E8E93", marginTop: "1px", display: "flex", alignItems: "center", gap: "4px" }}>
                            {sub.account}
                            {sub.freq ? (
                              <span style={{ background: "#007AFF18", color: "#007AFF", borderRadius: "6px", padding: "1px 5px", fontWeight: "600" }}>
                                {FREQ_LABEL[sub.freq]}
                              </span>
                            ) : (
                              <span>· {sub.uniqueMonths} mois</span>
                            )}
                          </div>
                        </div>
                        {/* Pastilles mois */}
                        <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                          {Array.from({ length: 6 }).map((_, k) => {
                            const filled = k >= (6 - sub.uniqueMonths);
                            return (
                              <div key={k} style={{
                                width: "7px", height: "7px", borderRadius: "50%",
                                background: filled ? "#34C759" : "#E5E5EA",
                              }} />
                            );
                          })}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, minWidth: "80px" }}>
                          {sub.freq && sub.freq !== "mensuel" ? (
                            <>
                              <div style={{ fontSize: "12px", fontWeight: "800", color: "#1C1C1E" }}>
                                {formatMoney(sub.monthlyAmount)} €<span style={{ fontSize: "9px", color: "#8E8E93", fontWeight: "500" }}>/mois</span>
                              </div>
                              <div style={{ fontSize: "10px", color: "#AEAEB2" }}>
                                {formatMoney(sub.avgAmount)} €/{sub.freq === "annuel" ? "an" : sub.freq === "semestriel" ? "sem." : "trim."}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: "14px", fontWeight: "700", color: "#1C1C1E" }}>
                              {formatMoney(sub.avgAmount)} €
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Section Variables */}
                {subscriptions.some(s => !s.isFixed) && (
                  <>
                    <div style={{ fontSize: "10px", color: "#AEAEB2", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px", marginTop: subscriptions.some(s => s.isFixed) ? "14px" : "0" }}>
                      📊 Montant variable
                    </div>
                    {subscriptions.filter(s => !s.isFixed).map((sub, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "7px 0",
                        borderBottom: "1px solid #F2F2F7",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#1C1C1E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {sub.description}
                          </div>
                          <div style={{ fontSize: "11px", color: "#8E8E93", marginTop: "1px", display: "flex", alignItems: "center", gap: "4px" }}>
                            {sub.account}
                            {sub.freq ? (
                              <span style={{ background: "#FF950018", color: "#FF9500", borderRadius: "6px", padding: "1px 5px", fontWeight: "600" }}>
                                {FREQ_LABEL[sub.freq]}
                              </span>
                            ) : (
                              <span>· {sub.uniqueMonths} mois</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                          {Array.from({ length: 6 }).map((_, k) => {
                            const filled = k >= (6 - sub.uniqueMonths);
                            return (
                              <div key={k} style={{
                                width: "7px", height: "7px", borderRadius: "50%",
                                background: filled ? "#FF9500" : "#E5E5EA",
                              }} />
                            );
                          })}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, minWidth: "80px" }}>
                          {sub.freq && sub.freq !== "mensuel" ? (
                            <>
                              <div style={{ fontSize: "12px", fontWeight: "800", color: "#FF9500" }}>
                                ~{formatMoney(sub.monthlyAmount)} €<span style={{ fontSize: "9px", color: "#8E8E93", fontWeight: "500" }}>/mois</span>
                              </div>
                              <div style={{ fontSize: "10px", color: "#AEAEB2" }}>
                                {formatMoney(sub.avgAmount)} €/{sub.freq === "annuel" ? "an" : sub.freq === "semestriel" ? "sem." : "trim."}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: "14px", fontWeight: "700", color: "#FF9500" }}>
                              ~{formatMoney(sub.avgAmount)} €
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Récap total */}
                <div style={{ marginTop: "12px", padding: "10px", background: "#F8F8FA", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "#8E8E93" }}>Total fixes /mois</div>
                    <div style={{ fontSize: "16px", fontWeight: "800", color: "#1C1C1E" }}>
                      {formatMoney(subscriptions.filter(s => s.isFixed).reduce((sum, s) => sum + s.monthlyAmount, 0))} €
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "11px", color: "#8E8E93" }}>Total variables /mois</div>
                    <div style={{ fontSize: "16px", fontWeight: "800", color: "#FF9500" }}>
                      ~{formatMoney(subscriptions.filter(s => !s.isFixed).reduce((sum, s) => sum + s.monthlyAmount, 0))} €
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Lien pour afficher le détail des jarres à la demande */}
      {!showJarsDetail ? (
        <section className="jars-v2-detail-link">
          <button
            type="button"
            className="jars-v2-detail-btn"
            onClick={() => setShowJarsDetail(true)}
          >
            📊 Voir le détail des jarres et du bilan
          </button>
        </section>
      ) : (
        <>
          {loading && !totals && (
            <div className="jars-v2-loading-inline">
              <div className="spinner"></div>
              <p>Chargement des données…</p>
            </div>
          )}

          {error && !totals && (
            <div className="jars-v2-error-inline">
              <p>❌ {error}</p>
              <button onClick={loadTotals} className="btn-retry">
                Réessayer
              </button>
            </div>
          )}

          {totals && (
            <>
              <section className="jars-v2-summary">
                <h3 className="jars-v2-summary-title">📊 Bilan Rapide</h3>
                <div className="jars-v2-summary-grid">
                  {/* 💎 Liquidités disponibles — dans le bilan */}
                  <div className="summary-item summary-networth" style={{ gridColumn: "1 / -1" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="summary-label">💎 Liquidités disponibles</span>
                      <button
                        onClick={() => {
                          setNetWorthLoading(true);
                          fetchNetWorth(true)
                            .then(res => setNetWorth(typeof res.value === "number" ? res.value : null))
                            .catch(() => setNetWorth(null))
                            .finally(() => setNetWorthLoading(false));
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", opacity: 0.6, padding: "0 4px" }}
                        title="Rafraîchir"
                      >
                        🔄
                      </button>
                    </div>
                    <span className="summary-value summary-value--highlight">
                      {netWorthLoading
                        ? <span className="skeleton skeleton-text" style={{ width: 90, display: "inline-block" }}>&nbsp;</span>
                        : netWorth !== null
                          ? `${netWorth.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                          : <span style={{ opacity: 0.4, fontSize: "14px" }}>Indisponible</span>
                      }
                    </span>
                  </div>

                  <div className="summary-item summary-revenues">
                    <span className="summary-label">💰 Revenus</span>
                    <span className="summary-value">{formatMoney(totalRevenues)}€</span>
                  </div>
                  <div className="summary-item summary-spendings">
                    <span className="summary-label">💸 Dépenses</span>
                    <span className="summary-value">{formatMoney(totalSpendings)}€</span>
                  </div>
                  <div className="summary-item summary-balance" style={{ gridColumn: "1 / -1" }}>
                    <span className="summary-label">⚖️ Balance</span>
                    <span className="summary-value summary-value--highlight">
                      {formatMoney(totalBalance)}€
                    </span>
                  </div>
                </div>
              </section>

              <section className="jars-v2-section">
                <div className="jars-v2-section-header">
                  <h2 className="jars-v2-section-title">🏺 Mes Jarres</h2>
                </div>
                <div className="jars-v2-grid">
                  {jarKeys.map((key) => {
                    const jar = totals.jars[key];
                    const backendSplit = totals.split?.[key];
                    const settingsSplit = customSplit?.[key];
                    const effectiveSplit =
                      settingsSplit != null
                        ? settingsSplit
                        : backendSplit != null
                        ? backendSplit
                        : 0;
                    const allocated = jar.revenues || 0;
                    const spent = jar.spendings || 0;
                    const progressPercent = allocated > 0 ? (spent / allocated) * 100 : 0;
                    const isOverspent = progressPercent > 100;
                    return (
                      <article
                        key={key}
                        className="jar-card-v2"
                        style={isOverspent ? { borderColor: "#FF3B30", borderWidth: 2 } : undefined}
                      >
                        <div className="jar-card-header">
                          <div className="jar-card-title">
                            <span className="jar-emoji">{JAR_EMOJIS[key]}</span>
                            <span className="jar-code">{key}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {isOverspent && (
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  color: "#fff",
                                  backgroundColor: "#FF3B30",
                                  borderRadius: "10px",
                                  padding: "2px 7px",
                                  animation: "pulse 1.5s ease-in-out infinite",
                                }}
                              >
                                ⚠️ Dépassé
                              </span>
                            )}
                            <span
                              className="jar-percent"
                              style={{ color: isOverspent ? "#FF3B30" : JAR_COLORS[key] }}
                            >
                              {(effectiveSplit * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <p className="jar-label">{JAR_LABELS[key]}</p>
                        <p className="jar-amount" style={isOverspent ? { color: "#FF3B30" } : undefined}>
                          {formatMoney(jar.net)}
                          <span className="jar-currency">€</span>
                        </p>
                        <div className="jar-progress-wrapper">
                          <div className="jar-progress-info">
                            <span className="jar-progress-label">Dépensé</span>
                            <span
                              className="jar-progress-value"
                              style={isOverspent ? { color: "#FF3B30", fontWeight: "700" } : undefined}
                            >
                              {progressPercent.toFixed(0)}%
                            </span>
                          </div>
                          <div className="jar-progress-bar">
                            <div
                              className="jar-progress-fill"
                              style={{
                                width: `${Math.min(progressPercent, 100)}%`,
                                backgroundColor: isOverspent ? "#FF3B30" : JAR_COLORS[key],
                              }}
                            />
                          </div>
                          <p className="jar-spent-amount">{formatMoney(spent)} €</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
};

export default JarsViewV2;
