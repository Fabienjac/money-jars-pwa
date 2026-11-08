// Carte « Train de vie » : dépense moyenne par jour depuis le début de l'année, hors dépenses extraordinaires,
// comparée aux 30 derniers jours. Les dépenses extraordinaires sont celles portant une étiquette cochée
// dans le panneau de réglage (voyage, gros achat…). Calcul : src/lifestyle.ts.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSpendingsSince, fetchLifestylePrefs, saveLifestylePrefs, fetchExceptionalDismissed, saveExceptionalDismissed, markSpendingExceptional, type SpendingLite } from "../api";
import { computeLifestyle, lifestyleFetchFrom, tagTotalsThisYear } from "../lifestyle";
import { suggestExceptional } from "../exceptional";
import { EXCEPTIONAL_TAG_ID } from "../lifestyleSeed";
import { loadTags } from "../tagsUtils";
import { currencySymbol as curSym } from "../baseCurrency";
import { t, useT, localeTag } from "../i18n";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function money(n: number, digits = 2): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toLocaleString(localeTag(), { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${curSym()}`;
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

const LifestyleCard: React.FC = () => {
  useT(); // re-rendu au changement de langue
  const [rows, setRows] = useState<SpendingLite[] | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestError, setSuggestError] = useState(false);
  const [error, setError] = useState(false);
  const [extraTags, setExtraTags] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tagsVersion, setTagsVersion] = useState(0); // les étiquettes de l'utilisateur ont changé (nom à rafraîchir)

  const load = useCallback(async () => {
    try {
      const from = lifestyleFetchFrom(todayISO());
      if (!from) return;
      const [data, prefs, dismissedIds] = await Promise.all([fetchSpendingsSince(from), fetchLifestylePrefs(), fetchExceptionalDismissed()]);
      setRows(data);
      setExtraTags(prefs.extraordinaryTags);
      setDismissed(dismissedIds);
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

  const statusLabel = stats?.status === "up" ? t("life.statusUp") : stats?.status === "down" ? t("life.statusDown") : t("life.statusStable");
  const statusColor = stats?.status === "up" ? "var(--warn-text)" : "var(--ok-text)";
  const statusBg = stats?.status === "up" ? "rgba(255,149,0,0.12)" : "rgba(52,199,89,0.12)";
  const arrow = stats?.status === "up" ? "↑" : stats?.status === "down" ? "↓" : "→";

  return (
    <section style={{ padding: "0 16px 12px" }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {t("life.title")}
          </div>
          <button
            type="button"
            className="life-link"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((v) => !v)}
          >
            {extraTags.length > 0 ? t("life.edit") : t("life.choose")}
          </button>
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>{t("life.subtitle")}</div>

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
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>
                  {t("life.since", { date: shortDate(stats.startDate) })}
                </div>
                <div className="life-figure">
                  {money(stats.perDay)}
                  <span className="life-unit">{t("life.perDay")}</span>
                </div>
              </div>
              {stats.last30 && (
                <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>{t("life.last30")}</div>
                  <div className="life-figure">
                    {money(stats.last30.perDay)}
                    <span className="life-unit">{t("life.perDay")}</span>
                  </div>
                </div>
              )}
            </div>

            {stats.status && stats.deltaPct != null && (
              <div
                style={{
                  display: "inline-flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "4px 8px",
                  marginTop: "10px",
                  padding: "4px 10px",
                  borderRadius: "10px",
                  background: statusBg,
                  color: statusColor,
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                <span>
                  {arrow} {statusLabel}
                </span>
                <span style={{ fontWeight: 500 }}>
                  {t("life.vsAverage", { pct: `${stats.deltaPct > 0 ? "+" : ""}${stats.deltaPct.toFixed(0)} %` })}
                </span>
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
