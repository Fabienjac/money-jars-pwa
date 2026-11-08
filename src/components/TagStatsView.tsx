// src/components/TagStatsView.tsx — Analyses > Par tag
// Ordre de l'écran : résumé (le chiffre d'abord) → filtres repliables → liste unique des étiquettes (un clic filtre)
// → graphique → comptes (reçu / dépensé / solde) → lien vers l'Historique avec les mêmes filtres.
import React, { useEffect, useMemo, useState } from "react";
import { fetchAllRevenuesCached, fetchAllSpendingsCached, fetchLifestylePrefs } from "../api";
import { JarKey, SearchRevenueResult, SearchSpendingResult } from "../types";
import { TagPieChart } from "./TagPieChart";
import { AdvancedTagStats } from "./AdvancedTagStats";
import { ExportButton } from "./ExportButton";
import { calculateTagStats } from "../tagStatsUtils";
import { getTagById } from "../tagsUtils";
import { loadAccounts } from "../accountsUtils";
import { formatMoney } from "../baseCurrency";
import { t as tr, localeTag, useLang, JAR_LABELS } from "../i18n";
import { computeReceivedByAccount } from "../accountStatsUtils";
import { mergeAccountLines, sumByName, accountKey } from "../accountMerge";
import {
  DEFAULT_ANALYTICS_FILTERS, countActiveFilters, filterByPeriod, filterSpendingRows, periodDays, tagIdsOf,
  toHistoryPreset, type AnalyticsFilters,
} from "../analyticsFilters";
import { OPEN_HISTORY_EVENT, savePreset } from "../historyPreset";
import { parseMinAmount } from "../historyFilters";
import { EXCEPTIONAL_TAG_ID } from "../lifestyleSeed";
import type { PeriodFilter } from "../historyPeriod";

const FILTERS_OPEN_KEY = "mjars:statsFiltersOpen";
const HIDE_ONEOFF_KEY = "mjars:statsHideOneOff";

const JARS: { key: JarKey; emoji: string }[] = [
  { key: "NEC", emoji: "🏠" }, { key: "FFA", emoji: "💰" }, { key: "LTSS", emoji: "🎯" },
  { key: "PLAY", emoji: "🎉" }, { key: "EDUC", emoji: "📚" }, { key: "GIFT", emoji: "🎁" },
];

const PERIOD_PILLS: { value: PeriodFilter; label: () => string }[] = [
  { value: "all", label: () => tr("hist.pAll") },
  { value: "month", label: () => tr("hist.pMonth") },
  { value: "prevmonth", label: () => tr("hist.pPrev") },
  { value: "30d", label: () => tr("stats.p30") },
  { value: "90d", label: () => tr("hist.p90") },
  { value: "6m", label: () => tr("stats.p6m") },
  { value: "year", label: () => tr("hist.pYear") },
  { value: "custom", label: () => tr("hist.pCustom") },
];

const readFlag = (key: string, fallback: boolean): boolean => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === "1";
  } catch { return fallback; }
};
const writeFlag = (key: string, on: boolean) => { try { localStorage.setItem(key, on ? "1" : "0"); } catch { /* sans importance */ } };

const Pills: React.FC<{
  label: string;
  items: { label: string; value: string; active: boolean }[];
  onPick: (value: string) => void;
}> = ({ label, items, onPick }) => (
  <div className="stats-field">
    <div className="stats-field-label">{label}</div>
    <div className="pills-wrap">
      {items.map((it) => (
        <button key={it.value} type="button" className={`stats-pill${it.active ? " is-active" : ""}`} aria-pressed={it.active} onClick={() => onPick(it.value)}>
          {it.label}
        </button>
      ))}
    </div>
  </div>
);

const NO_ADV_FILTERS = { period: "all" as const, customStartDate: "", customEndDate: "", minAmount: "", maxAmount: "", jars: [] as JarKey[] };

const TagStatsView: React.FC = () => {
  useLang();
  const now = useMemo(() => new Date(), []);
  const [loading, setLoading] = useState(true);
  const [allTransactions, setAllTransactions] = useState<SearchSpendingResult[]>([]);
  const [allRevenues, setAllRevenues] = useState<SearchRevenueResult[]>([]);
  const [oneOffTags, setOneOffTags] = useState<string[]>([EXCEPTIONAL_TAG_ID]);
  const [filters, setFilters] = useState<AnalyticsFilters>(DEFAULT_ANALYTICS_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(() => readFlag(FILTERS_OPEN_KEY, false));
  const [hideOneOff, setHideOneOff] = useState(() => readFlag(HIDE_ONEOFF_KEY, false));
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // Tout l'historique (l'ancienne lecture s'arrêtait à 500 lignes) ; lecture partagée avec l'Historique
        const [sp, rev, prefs] = await Promise.all([
          fetchAllSpendingsCached(), fetchAllRevenuesCached(), fetchLifestylePrefs().catch(() => null),
        ]);
        if (!alive) return;
        setAllTransactions(sp);
        setAllRevenues(rev);
        setOneOffTags(Array.from(new Set([EXCEPTIONAL_TAG_ID, ...(prefs?.extraordinaryTags ?? [])])));
      } catch (err) {
        console.error("Erreur chargement données:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const set = (patch: Partial<AnalyticsFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // ── Calculs ─────────────────────────────────────────────────────────
  const withOneOff = useMemo(() => filterSpendingRows(allTransactions, filters, now), [allTransactions, filters, now]);
  const oneOffRows = useMemo(
    () => withOneOff.filter((s) => tagIdsOf(s.tags).some((id) => oneOffTags.includes(id))),
    [withOneOff, oneOffTags]
  );
  const oneOffAmount = oneOffRows.reduce((s, r) => s + (r.amount || 0), 0);
  const filtered = useMemo(
    () => (hideOneOff ? withOneOff.filter((s) => !tagIdsOf(s.tags).some((id) => oneOffTags.includes(id))) : withOneOff),
    [withOneOff, hideOneOff, oneOffTags]
  );

  const stats = useMemo(() => calculateTagStats(filtered), [filtered]);
  const total = filtered.reduce((s, r) => s + (r.amount || 0), 0);
  const days = periodDays(filters, filtered, now);
  const untagged = filtered.filter((s) => tagIdsOf(s.tags).length === 0);
  const untaggedAmount = untagged.reduce((s, r) => s + (r.amount || 0), 0);
  const activeCount = countActiveFilters(filters, hideOneOff);
  const count = filtered.length;
  const maxTagAmount = stats.length > 0 ? Math.max(...stats.map((s) => s.totalAmount), 1) : 1;

  const money = (n: number, digits = 2) => formatMoney(n, undefined, digits);
  const pct = (n: number) => new Intl.NumberFormat(localeTag(), { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n / 100);
  const tagLabel = (id: string) => { const tg = getTagById(id); return tg ? `${tg.emoji} ${tg.name}` : id; };
  const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(localeTag(), { day: "numeric", month: "short", year: "numeric" });

  const periodLabel = (() => {
    switch (filters.period) {
      case "all": return tr("stats.periodAllLabel");
      case "month": return now.toLocaleDateString(localeTag(), { month: "long", year: "numeric" });
      case "prevmonth": return new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString(localeTag(), { month: "long", year: "numeric" });
      case "custom":
        if (filters.from && filters.to) return tr("hist.rangeBoth", { from: fmtDay(filters.from), to: fmtDay(filters.to) });
        if (filters.from) return tr("hist.rangeFrom", { from: fmtDay(filters.from) });
        if (filters.to) return tr("hist.rangeTo", { to: fmtDay(filters.to) });
        return tr("stats.periodAllLabel");
      default: return PERIOD_PILLS.find((p) => p.value === filters.period)?.label() ?? "";
    }
  })();

  // Étiquettes proposées dans les filtres : celles qui servent, les plus utilisées d'abord
  const tagChoices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of allTransactions) for (const id of tagIdsOf(s.tags)) counts.set(id, (counts.get(id) ?? 0) + 1);
    return Array.from(counts.keys()).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  }, [allTransactions]);

  // ── Comptes : reçu − dépensé, casse ignorée ───────────────────────────
  const accountRows = useMemo(() => {
    const received = computeReceivedByAccount(filterByPeriod(allRevenues, filters, now), NO_ADV_FILTERS);
    const spent = sumByName(filtered, (s) => s.account, (s) => s.amount);
    return mergeAccountLines(
      [
        ...Object.entries(received).map(([name, r]) => ({ name, received: r, spent: 0 })),
        ...Object.entries(spent).map(([name, s]) => ({ name, received: 0, spent: s })),
      ],
      loadAccounts().map((a) => a.name)
    )
      .filter((m) => Math.abs(m.received) > 0.005 || Math.abs(m.spent) > 0.005) // un compte sans mouvement n'apporte rien
      .map((m) => ({ ...m, balance: m.received - m.spent, tagStats: calculateTagStats(filtered.filter((s) => accountKey(s.account) === m.key)) }))
      .sort((a, b) => b.balance - a.balance);
  }, [allRevenues, filtered, filters, now]);

  // ── Actions ─────────────────────────────────────────────────────────
  const openHistory = (tagOverride?: string) => {
    try { savePreset(toHistoryPreset(filters, now, tagOverride), sessionStorage); } catch { /* sans importance */ }
    window.dispatchEvent(new CustomEvent(OPEN_HISTORY_EVENT));
  };
  const resetAll = () => { setFilters(DEFAULT_ANALYTICS_FILTERS); setHideOneOff(false); writeFlag(HIDE_ONEOFF_KEY, false); };
  const toggleFiltersOpen = () => setFiltersOpen((v) => { writeFlag(FILTERS_OPEN_KEY, !v); return !v; });
  const toggleHideOneOff = () => setHideOneOff((v) => { writeFlag(HIDE_ONEOFF_KEY, !v); return !v; });

  const activeSummary: string[] = [];
  if (filters.period !== "all" && !(filters.period === "custom" && !filters.from && !filters.to)) activeSummary.push(periodLabel);
  const minA = parseMinAmount(filters.minAmount);
  const maxA = parseMinAmount(filters.maxAmount);
  if (minA != null) activeSummary.push(`≥ ${money(minA, 0)}`);
  if (maxA != null) activeSummary.push(`≤ ${money(maxA, 0)}`);
  filters.jars.forEach((j) => activeSummary.push(JAR_LABELS[j as JarKey] ?? j));
  filters.tags.forEach((id) => activeSummary.push(tagLabel(id)));
  if (hideOneOff) activeSummary.push(tr("stats.hideOneOff"));

  if (loading) {
    return (
      <main className="page">
        <div style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>{tr("stats.loading")}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page stats-page">
      <div className="stats-head">
        <h2>{tr("stats.title")}</h2>
        {stats.length > 0 && <ExportButton stats={stats} transactions={filtered} />}
      </div>

      {/* 1. Le chiffre d'abord */}
      <section className="stats-summary" aria-live="polite">
        <div className="stats-summary-period">{periodLabel}</div>
        <div className="stats-summary-total">{money(total)}</div>
        <div className="stats-summary-meta">
          {tr(count === 1 ? "hist.countOne" : "hist.countMany", { n: count })}
          {count > 0 && <> · {tr("stats.avgPerDay", { amount: money(total / days, 2) })}</>}
        </div>
        {(oneOffRows.length > 0 || hideOneOff) && (
          <button type="button" className={`stats-switch${hideOneOff ? " is-on" : ""}`} role="switch" aria-checked={hideOneOff} onClick={toggleHideOneOff}>
            <span className="stats-switch-track" aria-hidden="true"><span className="stats-switch-thumb" /></span>
            <span className="stats-switch-text">
              <strong>{tr("stats.hideOneOff")}</strong>
              <small>{tr("stats.hideOneOffHint", { amount: money(oneOffAmount, 0), n: oneOffRows.length })}</small>
            </span>
          </button>
        )}
      </section>

      {/* 2. Filtres repliables, mêmes pastilles que l'Historique */}
      <section className="hist-filters">
        <button type="button" className="hist-filters-toggle" aria-expanded={filtersOpen} onClick={toggleFiltersOpen}>
          <span className="hist-filters-title">
            {tr("hist.filters")}
            {activeCount > 0 && <span className="hist-filters-badge">{activeCount}</span>}
          </span>
          <span aria-hidden="true">{filtersOpen ? "▴" : "▾"}</span>
        </button>
        {!filtersOpen && activeSummary.length > 0 && <div className="hist-filters-summary">{activeSummary.join(" · ")}</div>}

        {filtersOpen && (
          <div className="hist-filters-body">
            <Pills
              label={tr("hist.period")}
              items={PERIOD_PILLS.map((p) => ({ label: p.label(), value: p.value, active: filters.period === p.value }))}
              onPick={(v) => set({ period: v as PeriodFilter })}
            />
            {filters.period === "custom" && (
              <div className="hist-range">
                <label className="hist-range-field">
                  <span>{tr("hist.from")}</span>
                  <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
                </label>
                <label className="hist-range-field">
                  <span>{tr("hist.to")}</span>
                  <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
                </label>
              </div>
            )}
            <Pills
              label={tr("hist.jarLabel")}
              items={JARS.map((j) => ({ label: `${j.emoji} ${j.key}`, value: j.key, active: filters.jars.includes(j.key) }))}
              onPick={(v) => set({ jars: toggleIn(filters.jars, v) })}
            />
            {tagChoices.length > 0 && (
              <Pills
                label={tr("hist.tagLabel")}
                items={tagChoices.map((id) => ({ label: tagLabel(id), value: id, active: filters.tags.includes(id) }))}
                onPick={(v) => set({ tags: toggleIn(filters.tags, v) })}
              />
            )}
            <div className="hist-range">
              <label className="hist-range-field">
                <span>{tr("hist.minAmount")}</span>
                <input type="text" inputMode="decimal" placeholder="0" value={filters.minAmount} onChange={(e) => set({ minAmount: e.target.value })} />
              </label>
              <label className="hist-range-field">
                <span>{tr("stats.maxAmount")}</span>
                <input type="text" inputMode="decimal" placeholder="∞" value={filters.maxAmount} onChange={(e) => set({ maxAmount: e.target.value })} />
              </label>
            </div>
          </div>
        )}
        {activeCount > 0 && <button type="button" className="hist-filters-reset" onClick={resetAll}>{tr("hist.resetFilters")}</button>}
      </section>

      {count === 0 ? (
        <div className="stats-empty">{tr("stats.noSpendingPeriod")}</div>
      ) : (
        <>
          {/* 3. Une seule liste d'étiquettes : un clic filtre l'écran dessus */}
          <section className="stats-card">
            <div className="stats-card-head">
              <h3>{tr("stats.byTagTitle")}</h3>
              {filters.tags.length > 0 && (
                <button type="button" className="stats-link" onClick={() => set({ tags: [] })}>{tr("stats.clearTags")}</button>
              )}
            </div>
            <p className="stats-hint">{tr("stats.tapHint")}</p>
            {stats.length === 0 ? (
              <p className="stats-hint">{tr("stats.noTagged")}</p>
            ) : (
              <ul className="stats-tags">
                {stats.map((s) => {
                  const active = filters.tags.includes(s.tagId);
                  return (
                    <li key={s.tagId} className={`stats-tag${active ? " is-active" : ""}`}>
                      <button type="button" className="stats-tag-main" aria-pressed={active} onClick={() => set({ tags: toggleIn(filters.tags, s.tagId) })}>
                        <span className="stats-tag-emoji" aria-hidden="true">{s.emoji}</span>
                        <span className="stats-tag-body">
                          <span className="stats-tag-line">
                            <span className="stats-tag-name">{s.tagName}</span>
                            <span className="stats-tag-amount">{money(s.totalAmount)}</span>
                          </span>
                          <span className="stats-tag-bar"><span style={{ width: `${Math.max(2, (s.totalAmount / maxTagAmount) * 100)}%`, background: s.color }} /></span>
                          <span className="stats-tag-meta">
                            {pct(s.percentage)} · {tr(s.count === 1 ? "stats.tx1" : "stats.txN", { n: s.count })} · ≈ {money(s.totalAmount / days, 2)}{tr("life.perDayShort")}
                          </span>
                        </span>
                      </button>
                      <button type="button" className="stats-tag-open" onClick={() => openHistory(s.tagId)} aria-label={`${tr("stats.openHistoryTag")} — ${s.tagName}`}>
                        {tr("stats.openHistoryTag")} ›
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {untagged.length > 0 && (
              <p className="stats-hint">{tr("stats.untagged", { amount: money(untaggedAmount), n: untagged.length })}</p>
            )}
            <p className="stats-hint">{tr("stats.overlapShort")}</p>
          </section>

          {/* 4. Graphique */}
          {stats.length > 0 && (
            <details className="stats-card stats-details" open>
              <summary>{tr("stats.pieTitle")}</summary>
              <TagPieChart stats={stats} totalSpent={total} showLegend={false} />
            </details>
          )}
        </>
      )}

      {/* 5. Comptes : reçu, dépensé, solde */}
      <section className="stats-card">
        <div className="stats-card-head"><h3>{tr("stats.byAccount")}</h3></div>
        <p className="stats-hint">{tr("stats.byAccountHint")}</p>
        {accountRows.length === 0 ? (
          <p className="stats-hint">{tr("stats.noAccountData")}</p>
        ) : (
          <div className="stats-accounts">
            {accountRows.map((row) => (
              <div key={row.key} className="stats-account">
                <div className="stats-account-head">
                  <span className="stats-account-name">{row.name}</span>
                  <span className={`stats-account-balance ${row.balance >= 0 ? "is-pos" : "is-neg"}`}>
                    <small>{tr("stats.balance")}</small>
                    {row.balance >= 0 ? "+" : "−"}{money(Math.abs(row.balance))}
                  </span>
                </div>
                <div className="stats-account-flows">
                  <span><small>{tr("stats.received")}</small> <b className="is-pos">{money(row.received)}</b></span>
                  <span><small>{tr("stats.spent")}</small> <b className="is-neg">{money(row.spent)}</b></span>
                </div>
                {row.tagStats.length > 0 && (
                  <details className="stats-account-tags">
                    <summary>{tr("stats.detailByTag")}</summary>
                    <div className="stats-chips">
                      {row.tagStats.map((tg) => (
                        <span key={tg.tagId} className="stats-chip" style={{ background: `${tg.color}18`, borderColor: `${tg.color}40`, color: tg.color }}>
                          {tg.emoji} {tg.tagName} · {money(tg.totalAmount)}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6. Plus de cul-de-sac : la suite est dans l'Historique, avec les mêmes filtres */}
      {count > 0 && (
        <button type="button" className="hist-more stats-open-history" onClick={() => openHistory()}>
          {tr(count === 1 ? "stats.openHistoryOne" : "stats.openHistory", { n: count })}
        </button>
      )}

      {stats.length > 0 && (
        <>
          <button type="button" className="stats-link stats-adv-toggle" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? tr("stats.advHide") : tr("stats.advShow")}
          </button>
          {showAdvanced && <AdvancedTagStats stats={stats} allTransactions={filtered} />}
        </>
      )}
    </main>
  );
};

export default TagStatsView;
