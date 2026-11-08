// Abonnements récurrents détectés dans les dépenses (onglet « Abonnements » de l'écran Analyses).
// Détection : src/subscriptions.ts. L'utilisateur peut écarter un faux positif (« ce n'est pas un abonnement »).
import React, { useEffect, useMemo, useState } from "react";
import { fetchDismissedSubscriptions, fetchSpendingRowsSince, saveDismissedSubscriptions, updateSpending } from "../api";
import { detectRecurring, explainRecurring, type ExplainReason, type ExplainResult, type RecurringItem, type SubscriptionFreq } from "../subscriptions";
import type { SearchSpendingResult } from "../types";
import { totalUpcoming, upcomingCharges } from "../upcomingCharges";
import { currencySymbol as curSym } from "../baseCurrency";
import { t, useT, type TKey, localeTag } from "../i18n";

function formatMoney(value: number | null | undefined): string {
  const v = typeof value === "number" && !isNaN(value) ? value : 0;
  return v.toLocaleString(localeTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const FREQ_LABEL = {} as Record<SubscriptionFreq, string>;
for (const k of ["mensuel", "trimestriel", "semestriel", "annuel"] as SubscriptionFreq[]) {
  Object.defineProperty(FREQ_LABEL, k, { get: () => t(`freq.${k}` as TKey), enumerable: true });
}

/** Phrase qui explique pourquoi un libellé est (ou n'est pas) dans la liste. */
function reasonText(r: ExplainReason): string {
  switch (r.code) {
    case "detected": return t("subs.why.detected");
    case "manual": return r.stopped ? t("subs.why.manualStopped") : t("subs.why.manual");
    case "dismissed": return t("subs.why.dismissed");
    case "tooOld": return t("subs.why.tooOld", { n: r.monthsAgo });
    case "everyday": return t("subs.why.everyday");
    case "oneMonth": return t("subs.why.oneMonth");
    case "several": return t("subs.why.several");
    case "stopped": return t("subs.why.stopped");
    case "notConsecutive": return t("subs.why.notConsecutive");
    case "zeroAmount": return t("subs.why.zeroAmount");
    case "dateSpread": return t("subs.why.dateSpread", { spread: r.spread, max: r.max });
    case "variable": return t("subs.why.variable", { run: r.run });
  }
}

/** Un libellé déjà dans la liste n'a rien à ajouter. */
const canAdd = (r: ExplainResult) => !(r.reason.code === "detected" || (r.reason.code === "manual" && !r.reason.stopped));

const SubscriptionsPanel: React.FC = () => {
  useT(); // re-rendu au changement de langue
  const [transactions, setTransactions] = useState<SearchSpendingResult[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissedSubs, setDismissedSubs] = useState<string[]>([]);
  const [showSubscriptions, setShowSubscriptions] = useState(true);
  const [query, setQuery] = useState("");
  const [freqPick, setFreqPick] = useState<Record<string, SubscriptionFreq>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = () => {
    // 14 mois de dépenses, lus en entier : les abonnements annuels et la détection sur 6 mois en ont besoin
    const since = new Date();
    since.setMonth(since.getMonth() - 14, 1);
    const from = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-01`;
    return Promise.all([fetchSpendingRowsSince(from), fetchDismissedSubscriptions()])
      .then(([rows, dismissed]) => {
        setTransactions(rows);
        setDismissedSubs(dismissed);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Diagnostic : pourquoi les libellés contenant la recherche sont (ou non) dans la liste */
  const found = useMemo<ExplainResult[]>(
    () => explainRecurring(transactions, query, new Date(), new Set(dismissedSubs)),
    [transactions, query, dismissedSubs],
  );

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 3500); };

  /** Marque la dernière dépense du libellé comme abonnement : il entre alors dans la liste « à la main ». */
  const addAsSubscription = async (r: ExplainResult) => {
    const row = r.latest;
    if (busy || row.rowIndex == null) return;
    setBusy(true);
    try {
      const res = await updateSpending(row.rowIndex, {
        date: row.date,
        jar: row.jar,
        account: row.account,
        amount: row.amount,
        description: row.description,
        tags: row.tags,
        subscription: freqPick[r.key] ?? "mensuel",
      });
      if (!res.ok) throw new Error(res.error);
      await load();
      flash(t("subs.added"));
    } catch {
      flash("⚠️ " + t("xfer.err.generic"));
    } finally {
      setBusy(false);
    }
  };

  /** Abonnements détectés (recalculés quand l'utilisateur en écarte un) */
  const subscriptions = useMemo<RecurringItem[]>(
    () => detectRecurring(transactions, new Date(), new Set(dismissedSubs)),
    [transactions, dismissedSubs],
  );

  /** Prélèvements attendus dans les 30 prochains jours (estimés d'après le dernier prélèvement de chaque abonnement) */
  const upcoming = useMemo(() => upcomingCharges(subscriptions, new Date(), 30), [subscriptions]);

  const dueText = (inDays: number) =>
    inDays <= 0 ? t("subs.upToday") : inDays === 1 ? t("subs.upTomorrow") : t("subs.upIn", { n: inDays });

  const updateDismissed = (next: string[]) => {
    setDismissedSubs(next);
    saveDismissedSubscriptions(next).catch(() => {});
  };

  return (
    <div className="subs-panel">
      {subscriptions.length === 0 && dismissedSubs.length > 0 && (
        <section style={{ padding: "0 16px 12px", textAlign: "center" }}>
          <button type="button" className="sub-dismiss" onClick={() => updateDismissed([])}>
            {t("home.dismissedCount", { n: dismissedSubs.length })} · {t("home.restoreAll")}
          </button>
        </section>
      )}
      {/* Ce qui va sortir dans les 30 prochains jours */}
      {subscriptions.length > 0 && (
        <section style={{ padding: "0 16px 12px" }}>
          <div className="subs-upcoming">
            <div className="subs-upcoming-head">
              <div>
                <div className="subs-upcoming-title">{t("subs.upTitle")}</div>
                <div className="subs-upcoming-sub">{t("subs.upHorizon")}</div>
              </div>
              {upcoming.length > 0 && (
                <div className="subs-upcoming-total">{formatMoney(totalUpcoming(upcoming))}&nbsp;{curSym()}</div>
              )}
            </div>
            {upcoming.length === 0 ? (
              <p className="subs-upcoming-none">{t("subs.upNone")}</p>
            ) : (
              <ul className="subs-upcoming-list">
                {upcoming.map((c) => (
                  <li key={c.key} className="subs-upcoming-row">
                    <div className="subs-upcoming-when">
                      <span className="subs-upcoming-date">{c.date.toLocaleDateString(localeTag(), { weekday: "short", day: "numeric", month: "short" })}</span>
                      <span className="subs-upcoming-in">{dueText(c.inDays)}</span>
                    </div>
                    <div className="subs-upcoming-what">
                      <span className="subs-upcoming-name">{c.description}</span>
                      {c.account && <span className="subs-upcoming-account">{c.account}</span>}
                    </div>
                    <div className="subs-upcoming-amount">{c.approximate ? "≈ " : ""}{formatMoney(c.amount)}&nbsp;{curSym()}</div>
                  </li>
                ))}
              </ul>
            )}
            {upcoming.length > 0 && <p className="subs-upcoming-hint">{t("subs.upHint")}</p>}
          </div>
        </section>
      )}
      {subscriptions.length > 0 && (
        <section style={{ padding: "0 16px 12px" }}>
          <div style={{
            background: "var(--bg-card)",
            borderRadius: "16px",
            border: "1px solid var(--border-color)",
            boxShadow: "var(--shadow-md)",
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
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {t("home.subscriptions")}
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
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-main)" }}>
                      {formatMoney(fixedTotal)}&nbsp;{curSym()}{t("home.perMonth")}
                    </span>
                  ) : null;
                })()}
                <span style={{ fontSize: "16px", color: "var(--text-light)", transform: showSubscriptions ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
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
                    <div style={{ fontSize: "10px", color: "var(--text-light)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                      {t("home.fixed")}
                    </div>
                    {subscriptions.filter(s => s.isFixed).map((sub, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "7px 0",
                        borderBottom: "1px solid var(--border-color)",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {sub.description}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "1px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
                            {sub.account}
                            {sub.freq ? (
                              <span style={{ background: "#007AFF18", color: "#007AFF", borderRadius: "6px", padding: "1px 5px", fontWeight: "600" }}>
                                {FREQ_LABEL[sub.freq]}
                              </span>
                            ) : (
                              <span>{t("home.months", { n: sub.uniqueMonths })}</span>
                            )}
                            {!sub.freq && (
                              <button type="button" className="sub-dismiss" onClick={() => updateDismissed([...dismissedSubs, sub.key])}>
                                {t("home.notSub")}
                              </button>
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
                                background: filled ? "#34C759" : "var(--border-color)",
                              }} />
                            );
                          })}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, minWidth: "80px" }}>
                          {sub.freq && sub.freq !== "mensuel" ? (
                            <>
                              <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--text-main)" }}>
                                {formatMoney(sub.monthlyAmount)}&nbsp;{curSym()}<span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: "500" }}>{t("home.perMonth")}</span>
                              </div>
                              <div style={{ fontSize: "10px", color: "var(--text-light)" }}>
                                {formatMoney(sub.avgAmount)}&nbsp;{curSym()}/{sub.freq === "annuel" ? t("home.perYear") : sub.freq === "semestriel" ? t("home.perHalf") : t("home.perQuarter")}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-main)" }}>
                              {formatMoney(sub.avgAmount)}&nbsp;{curSym()}
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
                    <div style={{ fontSize: "10px", color: "var(--text-light)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px", marginTop: subscriptions.some(s => s.isFixed) ? "14px" : "0" }}>
                      {t("home.variable")}
                    </div>
                    {subscriptions.filter(s => !s.isFixed).map((sub, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "7px 0",
                        borderBottom: "1px solid var(--border-color)",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {sub.description}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "1px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
                            {sub.account}
                            {sub.freq ? (
                              <span style={{ background: "#FF950018", color: "var(--warn-text)", borderRadius: "6px", padding: "1px 5px", fontWeight: "600" }}>
                                {FREQ_LABEL[sub.freq]}
                              </span>
                            ) : (
                              <span>{t("home.months", { n: sub.uniqueMonths })}</span>
                            )}
                            {!sub.freq && (
                              <button type="button" className="sub-dismiss" onClick={() => updateDismissed([...dismissedSubs, sub.key])}>
                                {t("home.notSub")}
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                          {Array.from({ length: 6 }).map((_, k) => {
                            const filled = k >= (6 - sub.uniqueMonths);
                            return (
                              <div key={k} style={{
                                width: "7px", height: "7px", borderRadius: "50%",
                                background: filled ? "#FF9500" : "var(--border-color)",
                              }} />
                            );
                          })}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, minWidth: "80px" }}>
                          {sub.freq && sub.freq !== "mensuel" ? (
                            <>
                              <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--warn-text)" }}>
                                ~{formatMoney(sub.monthlyAmount)}&nbsp;{curSym()}<span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: "500" }}>{t("home.perMonth")}</span>
                              </div>
                              <div style={{ fontSize: "10px", color: "var(--text-light)" }}>
                                {formatMoney(sub.avgAmount)}&nbsp;{curSym()}/{sub.freq === "annuel" ? t("home.perYear") : sub.freq === "semestriel" ? t("home.perHalf") : t("home.perQuarter")}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--warn-text)" }}>
                              ~{formatMoney(sub.avgAmount)}&nbsp;{curSym()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {dismissedSubs.length > 0 && (
                  <div style={{ marginTop: "10px", textAlign: "center" }}>
                    <button type="button" className="sub-dismiss" onClick={() => updateDismissed([])}>
                      {t("home.dismissedCount", { n: dismissedSubs.length })} · {t("home.restoreAll")}
                    </button>
                  </div>
                )}

                {/* Récap total */}
                <div style={{ marginTop: "12px", padding: "10px", background: "var(--bg-body)", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{t("home.totalFixed")}</div>
                    <div style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main)" }}>
                      {formatMoney(subscriptions.filter(s => s.isFixed).reduce((sum, s) => sum + s.monthlyAmount, 0))}&nbsp;{curSym()}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{t("home.totalVariable")}</div>
                    <div style={{ fontSize: "16px", fontWeight: "800", color: "var(--warn-text)" }}>
                      ~{formatMoney(subscriptions.filter(s => !s.isFixed).reduce((sum, s) => sum + s.monthlyAmount, 0))}&nbsp;{curSym()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
      {loaded && subscriptions.length === 0 && dismissedSubs.length === 0 && (
        <p className="subs-empty">{t("subs.none")}</p>
      )}

      <section className="subs-find">
        <h4 className="subs-find-title">{t("subs.findTitle")}</h4>
        <p className="subs-find-hint">{t("subs.findHint")}</p>
        <input
          type="search"
          className="jar-input subs-find-input"
          value={query}
          placeholder={t("subs.findPlaceholder")}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("subs.findTitle")}
        />
        {note && <p className="subs-find-note" role="status">{note}</p>}
        {query.trim().length >= 2 && found.length === 0 && loaded && <p className="subs-find-none">{t("subs.findNone")}</p>}
        <ul className="subs-find-list">
          {found.map((r) => (
            <li key={r.key} className="subs-find-row">
              <div className="subs-find-head">
                <strong className="subs-find-name">{r.label}</strong>
                <span className="subs-find-meta">{t("subs.findCount", { n: r.count })} · {t("subs.findLast", { date: r.lastDate })}</span>
              </div>
              <p className="subs-find-why">{reasonText(r.reason)}</p>
              {r.recentDates.length > 0 && <p className="subs-find-dates">{r.recentDates.slice(0, 6).join(" · ")}</p>}
              {(canAdd(r) || r.reason.code === "dismissed") && (
                <div className="subs-find-actions">
                  {r.reason.code === "dismissed" && (
                    <button type="button" className="push-btn push-btn--quiet" disabled={busy} onClick={() => updateDismissed(dismissedSubs.filter((k) => k !== r.key))}>
                      {t("subs.undismiss")}
                    </button>
                  )}
                  {canAdd(r) && (
                    <>
                      <select
                        className="jar-input subs-find-select"
                        aria-label={t("subs.freqLabel")}
                        value={freqPick[r.key] ?? "mensuel"}
                        onChange={(e) => setFreqPick((p) => ({ ...p, [r.key]: e.target.value as SubscriptionFreq }))}
                      >
                        {(["mensuel", "trimestriel", "semestriel", "annuel"] as SubscriptionFreq[]).map((f) => (
                          <option key={f} value={f}>{FREQ_LABEL[f]}</option>
                        ))}
                      </select>
                      <button type="button" className="push-btn" disabled={busy} onClick={() => addAsSubscription(r)}>
                        {t("subs.add")}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default SubscriptionsPanel;
