// Carte « Train de vie » : dépense moyenne par jour depuis le début de l'année, hors dépenses extraordinaires,
// comparée aux 30 derniers jours. Les dépenses extraordinaires sont celles portant une étiquette cochée
// dans le panneau de réglage (voyage, gros achat…). Calcul : src/lifestyle.ts.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSpendingsSince, fetchLifestylePrefs, saveLifestylePrefs, fetchLifestyleFocus, saveLifestyleFocus, fetchExceptionalDismissed, saveExceptionalDismissed, markSpendingExceptional, type SpendingLite } from "../api";
import { computeLifestyle, lifestyleFetchFrom, monthlyAverages, rollingAverageSeries, tagTotalsThisYear, trendLine, windowStats, type MonthAverage, type TrendLine } from "../lifestyle";
import { OPEN_HISTORY_EVENT, savePreset } from "../historyPreset";
import DailyAverageChart from "./DailyAverageChart";
import { suggestExceptional } from "../exceptional";
import { EXCEPTIONAL_TAG_ID } from "../lifestyleSeed";
import { MAX_FOCUS, focusLabel, normalizeFocus, toggleFocus } from "../lifestyleFocus";
import { loadTags } from "../tagsUtils";
import { formatMoney as formatMoneyBase } from "../baseCurrency";
import { t, useT, localeTag, monthShort } from "../i18n";
import HelpHint from "./HelpHint";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function money(n: number, digits = 2): string {
  return formatMoneyBase(Number.isFinite(n) ? n : 0, undefined, digits);
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(localeTag(), { day: "numeric", month: "short" });
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  borderRadius: "16px",
  padding: "16px",
  border: "1px solid var(--border-color)",
  boxShadow: "var(--shadow-md)",
};

/** Date AAAA-MM-JJ située `days` jours avant le 1er janvier de l'année de `today`. */
function beforeJan1(today: string, days: number): string {
  const d = new Date(Number(today.slice(0, 4)), 0, 1);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const pctText = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(0)} %`;
const arrowOf = (n: number) => (n > 10 ? "↑" : n < -10 ? "↓" : "→");

const dayFmt = (n: number) => n.toLocaleString(localeTag(), { minimumFractionDigits: n < 30 ? 1 : 0, maximumFractionDigits: n < 30 ? 1 : 0 });

/** Moyenne par jour, mois par mois ; trait pointillé = moyenne depuis le début de la période ; le mois en cours est plus clair. */
const MonthBars: React.FC<{ months: MonthAverage[]; reference: number; color: string }> = ({ months, reference, color }) => {
  if (months.length < 2) return null;
  const max = Math.max(...months.map((m) => m.perDay), reference, 0.01);
  return (
    <div className="life-months">
      <div className="life-months-plot">
        {reference > 0 && <div className="life-months-ref" style={{ bottom: `${(reference / max) * 100}%` }} />}
        {months.map((m) => (
          <div key={m.month} className="life-month-col">
            <span className="life-month-val" style={{ bottom: `calc(${(m.perDay / max) * 100}% + 2px)` }}>{dayFmt(m.perDay)}</span>
            <div className="life-month-bar" style={{ height: `${(m.perDay / max) * 100}%`, background: color, opacity: m.current ? 0.5 : 1 }} />
          </div>
        ))}
      </div>
      <div className="life-months-labels">
        {months.map((m) => (
          <span key={m.month} className="life-month-label">{monthShort(m.monthIndex)}{m.current ? "*" : ""}</span>
        ))}
      </div>
      <div className="life-months-note">{t("life.monthsNote", { avg: `${dayFmt(reference)}${t("life.perDayShort")}` })}</div>
    </div>
  );
};

/** Une ligne d'évolution : tendance en premier, équivalent mensuel, comparaison à il y a 3 mois, puis les mois. */
const TrendRow: React.FC<{ name: string; trend: TrendLine; months: MonthAverage[]; color: string }> = ({ name, trend, months, color }) => {
  const up = trend.status === "up";
  return (
    <div className="life-trend">
      <div className="life-trend-head">
        <span className="life-trend-name">{name}</span>
        <span className="life-trend-month">{t("life.perMonth", { amount: money(trend.perMonth, 0) })}</span>
      </div>
      {trend.deltaYear != null ? (
        <div className="life-trend-main">
          <span className={`life-chip${up ? " life-chip--up" : ""}`}>
            {arrowOf(trend.deltaYear)} {pctText(trend.deltaYear)}
          </span>
          <span className="life-trend-sub">{t("life.trendVsYear", { date: shortDate(trend.since) })}</span>
        </div>
      ) : (
        <div className="life-trend-sub">{t("life.trendNoRef")}</div>
      )}
      {trend.delta3m != null && (
        <div className="life-trend-3m">{t("life.trendVs3m", { arrow: arrowOf(trend.delta3m), pct: pctText(trend.delta3m) })}</div>
      )}
      <MonthBars months={months} reference={trend.perDayYear} color={color} />
    </div>
  );
};

const LifestyleCard: React.FC<{ lastImportLabel?: string }> = ({ lastImportLabel }) => {
  useT(); // re-rendu au changement de langue
  const [rows, setRows] = useState<SpendingLite[] | null>(null);
  const [dataFrom, setDataFrom] = useState<string | undefined>(undefined); // première date réellement chargée
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestError, setSuggestError] = useState(false);
  const [error, setError] = useState(false);
  const [extraTags, setExtraTags] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusRaw, setFocusRaw] = useState<unknown>(undefined); // étiquettes suivies par la courbe verte (choix enregistré)
  const [focusOpen, setFocusOpen] = useState(false);
  const [tagsVersion, setTagsVersion] = useState(0); // les étiquettes de l'utilisateur ont changé (nom à rafraîchir)

  const load = useCallback(async () => {
    try {
      const today = todayISO();
      const base = lifestyleFetchFrom(today);
      if (!base) return;
      // La courbe a besoin des 30 jours qui précèdent le 7 janvier pour que ses premiers points soient justes
      const chartFrom = beforeJan1(today, 30);
      const from = base < chartFrom ? base : chartFrom;
      const [data, prefs, dismissedIds, focus] = await Promise.all([fetchSpendingsSince(from), fetchLifestylePrefs(), fetchExceptionalDismissed(), fetchLifestyleFocus()]);
      setRows(data);
      setDataFrom(from);
      setExtraTags(prefs.extraordinaryTags);
      setDismissed(dismissedIds);
      setFocusRaw(focus);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
    const onSaved = () => load();
    const onPrefs = (e: Event) => {
      const tags = (e as CustomEvent<{ extraordinaryTags?: string[] }>).detail?.extraordinaryTags;
      if (Array.isArray(tags)) setExtraTags(tags);
      setTagsVersion((v) => v + 1);
    };
    window.addEventListener("mjars:transactionSaved", onSaved);
    window.addEventListener("mjars:lifestylePrefsChanged", onPrefs);
    return () => {
      window.removeEventListener("mjars:transactionSaved", onSaved);
      window.removeEventListener("mjars:lifestylePrefsChanged", onPrefs);
    };
  }, [load]);

  const extraSet = useMemo(() => new Set(extraTags), [extraTags]);
  const today = todayISO();
  const stats = useMemo(() => (rows ? computeLifestyle(rows, extraSet, today) : null), [rows, extraSet, today]);
  const tagTotals = useMemo(() => (rows ? tagTotalsThisYear(rows, today) : {}), [rows, today]);
  // Étiquettes suivies par la courbe verte : le choix enregistré, sinon l'alimentation. Une étiquette est « connue » si elle
  // est dans la liste de la personne OU portée par ses dépenses (le panneau propose les deux).
  const knownTagIds = useMemo(
    () => [...loadTags().map((tg) => tg.id), ...Object.keys(tagTotals)],
    [tagsVersion, tagTotals] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const focusIds = useMemo(() => normalizeFocus(focusRaw, knownTagIds), [focusRaw, knownTagIds]);
  // Courbe hors dépenses extraordinaires (et alimentation par-dessus)
  const chartPoints = useMemo(() => (rows ? rollingAverageSeries(rows, extraSet, today) : []), [rows, extraSet, today]);
  const foodPoints = useMemo(() => (rows ? rollingAverageSeries(rows, extraSet, today, focusIds) : []), [rows, extraSet, today, focusIds]);
  const foodNow = foodPoints.length > 0 ? foodPoints[foodPoints.length - 1].avg : 0;
  const totalNow = chartPoints.length > 0 ? chartPoints[chartPoints.length - 1].avg : 0;
  // Évolution des dépenses courantes et de l'alimentation (30 derniers jours vs moyenne de l'année et vs il y a 3 mois)
  const trendAll = useMemo(() => (rows ? trendLine(rows, extraSet, today) : null), [rows, extraSet, today]);
  const trendFood = useMemo(() => (rows ? trendLine(rows, extraSet, today, focusIds) : null), [rows, extraSet, today, focusIds]);
  // Moyenne par jour, mois par mois (6 mois)
  const monthsAll = useMemo(() => (rows ? monthlyAverages(rows, extraSet, today, { since: dataFrom }) : []), [rows, extraSet, today, dataFrom]);
  const monthsFood = useMemo(() => (rows ? monthlyAverages(rows, extraSet, today, { since: dataFrom, tagId: focusIds }) : []), [rows, extraSet, today, dataFrom, focusIds]);

  // Grosses dépenses pas encore étiquetées : on propose de les marquer « Exceptionnel »
  const suggestions = useMemo(
    () => (rows ? suggestExceptional({ rows, extraordinaryTags: extraSet, dismissed: new Set(dismissed), today }) : []),
    [rows, extraSet, dismissed, today]
  );
  const exceptionalName = useMemo(
    () => loadTags().find((tg) => tg.id === EXCEPTIONAL_TAG_ID)?.name ?? t("default.tag.exceptionnel"),
    [tagsVersion] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const markSuggestion = async (id: string) => {
    const row = rows?.find((r) => String(r.id) === id);
    if (!row || suggestBusy) return;
    setSuggestBusy(true);
    setSuggestError(false);
    try {
      const res = await markSpendingExceptional(row, extraTags);
      if (!res.ok) throw new Error(res.error);
      if (res.extraordinary) setExtraTags(res.extraordinary);
      // Affichage immédiat ; la carte se recharge ensuite depuis le cloud
      setRows((prev) => prev && prev.map((r) => (String(r.id) === id ? { ...r, tags: r.tags ? `${r.tags},${EXCEPTIONAL_TAG_ID}` : EXCEPTIONAL_TAG_ID } : r)));
      window.dispatchEvent(new CustomEvent("mjars:transactionSaved"));
    } catch {
      setSuggestError(true);
    } finally {
      setSuggestBusy(false);
    }
  };

  const dismissSuggestion = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next); // immédiat ; l'enregistrement cloud se fait en arrière-plan
    saveExceptionalDismissed(next).catch(() => {});
  };

  const toggleTag = (id: string) => {
    const next = extraSet.has(id) ? extraTags.filter((x) => x !== id) : [...extraTags, id];
    setExtraTags(next); // immédiat ; l'enregistrement cloud se fait en arrière-plan
    saveLifestylePrefs({ extraordinaryTags: next }).catch(() => {});
  };

  // Étiquettes proposées : celles de l'utilisateur + celles réellement utilisées sur ses dépenses, triées par montant
  const tagChoices = useMemo(() => {
    const known = new Map(loadTags().map((tg) => [tg.id, tg]));
    const ids = new Set<string>([...Object.keys(tagTotals), ...extraTags]);
    return [...ids]
      .map((id) => ({ id, name: known.get(id)?.name ?? id, emoji: known.get(id)?.emoji ?? "🏷️", total: tagTotals[id] ?? 0 }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [tagTotals, extraTags, tagsVersion]);

  const tagInfo = (id: string) => loadTags().find((tg) => tg.id === id);
  const focusName = focusLabel(focusIds, (id) => tagInfo(id)?.name ?? (id === "alimentaire" ? t("life.rowFood") : id));
  const focusEmoji = focusIds.length === 1 ? (tagInfo(focusIds[0])?.emoji ?? (focusIds[0] === "alimentaire" ? "🥗" : "🎯")) : "🎯";
  const focusChoices = tagChoices.filter((tg) => !extraSet.has(tg.id));
  // Contrôle des chiffres (serveur de développement seulement, absent de la version publique) : ouvre l'Historique
  // filtré sur exactement les dépenses de la fenêtre de 30 jours, hors extraordinaires
  const openVerify = (focus: readonly string[] | undefined) => {
    const w = rows ? windowStats(rows, extraSet, today, focus) : null;
    if (!w) return;
    try {
      savePreset({ from: w.from, to: w.to, tags: focus ? [...focus] : undefined, excludeTags: extraTags.length > 0 ? extraTags : undefined }, sessionStorage);
    } catch { /* sans importance */ }
    window.dispatchEvent(new CustomEvent(OPEN_HISTORY_EVENT));
  };
  const toggleFocusTag = (id: string) => {
    const next = toggleFocus(focusIds, id);
    setFocusRaw(next); // immédiat ; l'enregistrement cloud se fait en arrière-plan
    saveLifestyleFocus(next).catch(() => {});
  };

  const statusLabel = stats?.status === "up" ? t("life.statusUp") : stats?.status === "down" ? t("life.statusDown") : t("life.statusStable");
  const statusColor = stats?.status === "up" ? "var(--warn-text)" : "var(--ok-text)";
  const statusBg = stats?.status === "up" ? "rgba(255,149,0,0.12)" : "rgba(52,199,89,0.12)";
  const arrow = stats?.status === "up" ? "↑" : stats?.status === "down" ? "↓" : "→";

  return (
    <section style={{ padding: "0 16px 12px" }}>
      <div style={cardStyle}>
        <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
          {t("life.title")} <HelpHint topic="lifestyle" more />
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>{t("life.subtitle")}</div>

        {rows === null && !error && <div className="skeleton" style={{ width: "100%", height: "110px", borderRadius: 12, marginBottom: 12 }} />}
        {chartPoints.length >= 2 && (
          <div className="life-chart">
            <DailyAverageChart points={chartPoints} overlay={foodPoints} />
            <div className="life-chart-legend">
              <span className="life-chart-key">
                <span className="life-chart-swatch" aria-hidden="true" />
                {t("life.rowCurrent")} <strong>{money(totalNow, 2)}{t("life.perDayShort")}</strong>
              </span>
              {foodNow > 0 && (
                <span className="life-chart-key">
                  <svg width="16" height="6" aria-hidden="true" style={{ overflow: "visible" }}>
                    <line x1="0" y1="3" x2="16" y2="3" stroke="#84CC16" strokeWidth="2" strokeDasharray="4 2" />
                  </svg>
                  {focusEmoji} {focusName} <strong>{money(foodNow, 2)}{t("life.perDayShort")}</strong>
                </span>
              )}
              <span className="life-chart-note">{t("life.chartNote")}</span>
            </div>
          </div>
        )}

        {rows === null && !error && (
          <div style={{ display: "flex", gap: "12px" }}>
            <div className="skeleton skeleton-amount" style={{ flex: 1 }} />
            <div className="skeleton skeleton-amount" style={{ flex: 1 }} />
          </div>
        )}

        {error && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{t("life.loadError")}</div>}

        {rows !== null && !stats && !error && (
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{t("life.noData")}</div>
        )}

        {stats && (
          <>
            {stats.last30 && trendAll ? (
              <div className="life-trends">
                <TrendRow name={t("life.rowCurrent")} trend={trendAll} months={monthsAll} color="#FF2D78" />
                {trendFood && trendFood.perDay30 > 0 && <TrendRow name={`${focusEmoji} ${focusName}`} trend={trendFood} months={monthsFood} color="#84CC16" />}
              </div>
            ) : (
              <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>
                  {t("life.since", { date: shortDate(stats.startDate) })}
                </div>
                <div className="life-figure">
                  {money(stats.perDay)}
                  <span className="life-unit">{t("life.perDay")}</span>
                </div>
              </div>
            )}

            {!stats.last30 && (
              <div style={{ fontSize: "11px", color: "var(--text-light)", marginTop: "8px" }}>{t("life.tooEarly")}</div>
            )}

            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "10px" }}>
              {stats.extraordinary > 0
                ? t("life.excluded", { amount: money(stats.extraordinary, 0), n: stats.extraordinaryCount })
                : extraTags.length === 0
                  ? t("life.noneMarked")
                  : t("life.noneTagged", { name: tagChoices.find((c) => c.id === extraTags[0])?.name ?? extraTags[0] })}
            </div>
          </>
        )}

        {lastImportLabel && (
          <div className="life-import">🔄 {t("life.lastImport", { when: lastImportLabel })}</div>
        )}

        {suggestions.length > 0 && (
          <div className="life-suggest" role="group" aria-label={t("life.suggestTitle", { tag: exceptionalName })}>
            <div className="life-suggest-title">💡 {t("life.suggestTitle", { tag: exceptionalName })}</div>
            <p className="life-suggest-help">{t("life.suggestHelp")}</p>
            <ul className="life-suggest-list">
              {suggestions.map((sg) => (
                <li key={sg.id} className="life-suggest-row">
                  <span className="life-suggest-what">
                    <span className="life-suggest-name">{sg.description || t("life.suggestUnnamed")}</span>
                    <span className="life-suggest-meta">
                      {shortDate(sg.date)} · {money(sg.amount, 0)}{sg.times >= 2 ? ` · ${t("life.suggestTimes", { n: sg.times })}` : ""}
                    </span>
                  </span>
                  <span className="life-suggest-actions">
                    <button type="button" className="push-btn" disabled={suggestBusy} onClick={() => markSuggestion(sg.id)}>
                      {t("life.suggestMark")}
                    </button>
                    <button type="button" className="push-btn push-btn--quiet" disabled={suggestBusy} onClick={() => dismissSuggestion(sg.id)}>
                      {t("life.suggestNo")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {suggestError && <p className="life-suggest-error" role="alert">{t("life.suggestError")}</p>}
          </div>
        )}

        {import.meta.env.DEV && rows && (
          <div className="life-dev">
            <div className="life-dev-title">🔧 Contrôle des chiffres (développement seulement)</div>
            {[{ label: t("life.rowCurrent"), focus: undefined as readonly string[] | undefined }, { label: `${focusEmoji} ${focusName}`, focus: focusIds as readonly string[] | undefined }].map((line) => {
              const w = windowStats(rows, extraSet, today, line.focus);
              if (!w) return null;
              return (
                <div key={line.label} className="life-dev-row">
                  <span>
                    <strong>{line.label}</strong> : {w.count} dépenses du {w.from} au {w.to}, {money(w.sum)} ÷ 30 j = <strong>{money(w.sum / 30)}{t("life.perDayShort")}</strong>
                  </span>
                  <button type="button" className="life-link" onClick={() => openVerify(line.focus)}>Voir les dépenses ›</button>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className="life-link life-edit"
          aria-expanded={focusOpen}
          onClick={() => setFocusOpen((v) => !v)}
        >
          {t("life.focusEdit", { name: focusName })}
        </button>

        {focusOpen && (
          <div className="life-panel" role="group" aria-label={t("life.focusTitle")}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>{t("life.focusTitle")}</div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 8px" }}>{t("life.focusHelp", { max: MAX_FOCUS })}</p>
            {focusChoices.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>{t("life.noTags")}</p>
            ) : (
              focusChoices.map((tg) => {
                const checked = focusIds.includes(tg.id);
                const locked = checked ? focusIds.length === 1 : focusIds.length >= MAX_FOCUS;
                return (
                  <label key={tg.id} className="life-tag-row" style={locked ? { opacity: 0.55 } : undefined}>
                    <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggleFocusTag(tg.id)} />
                    <span className="life-tag-name">
                      <span aria-hidden="true">{tg.emoji}</span> {tg.name}
                    </span>
                    <span className="life-tag-amount">{tg.total > 0 ? t("life.tagYtd", { amount: money(tg.total, 0) }) : ""}</span>
                  </label>
                );
              })
            )}
            <button type="button" className="life-link life-close" onClick={() => setFocusOpen(false)}>
              {t("life.close")}
            </button>
          </div>
        )}

        <button
          type="button"
          className="life-link life-edit"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          {extraTags.length > 0 ? t("life.edit") : t("life.choose")}
        </button>

        {panelOpen && (
          <div className="life-panel" role="group" aria-label={t("life.panelTitle")}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>{t("life.panelTitle")}</div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 8px" }}>{t("life.panelHelp")}</p>
            {tagChoices.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>{t("life.noTags")}</p>
            ) : (
              tagChoices.map((tg) => (
                <label key={tg.id} className="life-tag-row">
                  <input type="checkbox" checked={extraSet.has(tg.id)} onChange={() => toggleTag(tg.id)} />
                  <span className="life-tag-name">
                    <span aria-hidden="true">{tg.emoji}</span> {tg.name}
                  </span>
                  <span className="life-tag-amount">{tg.total > 0 ? t("life.tagYtd", { amount: money(tg.total, 0) }) : ""}</span>
                </label>
              ))
            )}
            <button type="button" className="life-link life-close" onClick={() => setPanelOpen(false)}>
              {t("life.close")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default LifestyleCard;
