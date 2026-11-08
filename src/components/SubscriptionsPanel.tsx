// Abonnements récurrents détectés dans les dépenses (onglet « Abonnements » de l'écran Analyses).
// Détection : src/subscriptions.ts. L'utilisateur peut écarter un faux positif (« ce n'est pas un abonnement »).
import React, { useEffect, useMemo, useState } from "react";
import { fetchDismissedSubscriptions, fetchSpendingRowsSince, saveDismissedSubscriptions } from "../api";
import { detectRecurring, type RecurringItem, type SubscriptionFreq } from "../subscriptions";
import type { SearchSpendingResult } from "../types";
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

const SubscriptionsPanel: React.FC = () => {
  useT(); // re-rendu au changement de langue
  const [transactions, setTransactions] = useState<SearchSpendingResult[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissedSubs, setDismissedSubs] = useState<string[]>([]);
  const [showSubscriptions, setShowSubscriptions] = useState(true);

  useEffect(() => {
    // 14 mois de dépenses, lus en entier : les abonnements annuels et la détection sur 6 mois en ont besoin
    const since = new Date();
    since.setMonth(since.getMonth() - 14, 1);
    const from = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-01`;
    Promise.all([fetchSpendingRowsSince(from), fetchDismissedSubscriptions()])
      .then(([rows, dismissed]) => {
        setTransactions(rows);
        setDismissedSubs(dismissed);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  /** Abonnements détectés (recalculés quand l'utilisateur en écarte un) */
  const subscriptions = useMemo<RecurringItem[]>(
    () => detectRecurring(transactions, new Date(), new Set(dismissedSubs)),
    [transactions, dismissedSubs],
  );

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
    </div>
  );
};

export default SubscriptionsPanel;
