// Réglages : transferts entre jarres (verser le non-dépensé vers l'épargne, combler un déficit…).
// Un transfert n'est ni un revenu ni une dépense : il ne change que le solde des deux jarres.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { addJarTransfer, deleteJarTransfer, fetchJarTransfers, fetchTotals } from "../api";
import { currencySymbol as curSym, formatMoney } from "../baseCurrency";
import { JAR_LABELS, useT } from "../i18n";
import {
  JAR_KEYS_ALL,
  SAVINGS_JARS,
  availableToTransfer,
  checkTransfer,
  isSavingsJar,
  leftoverSuggestions,
  round2,
  type JarTransfer,
} from "../jarTransfers";
import { JAR_ALERT_EMOJIS } from "../jarAlerts";
import type { JarKey, TotalsResponse } from "../types";

const money = (n: number) => formatMoney(n);

const JarTransfers: React.FC = () => {
  const t = useT();
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [transfers, setTransfers] = useState<JarTransfer[] | null | undefined>(undefined); // undefined = chargement, null = table absente
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reste non dépensé : jarres cochées et épargne de destination
  const [unchecked, setUnchecked] = useState<Set<JarKey>>(new Set());
  const [leftoverTarget, setLeftoverTarget] = useState<JarKey>(SAVINGS_JARS[0]);

  // Transfert libre
  const [from, setFrom] = useState<JarKey | "">("");
  const [to, setTo] = useState<JarKey>(SAVINGS_JARS[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [tot, list] = await Promise.all([fetchTotals(true), fetchJarTransfers()]);
      setTotals(tot);
      setTransfers(list);
    } catch {
      setTransfers(null);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const net = (k: JarKey) => (totals ? totals.jars[k].revenues - totals.jars[k].spendings : 0);
  const leftovers = useMemo(() => leftoverSuggestions(totals?.jars), [totals]);
  const sources = useMemo(() => JAR_KEYS_ALL.filter((k) => availableToTransfer(net(k)) > 0), [totals]); // eslint-disable-line react-hooks/exhaustive-deps

  // La source choisie doit rester valide quand les soldes changent
  useEffect(() => {
    if (from && !sources.includes(from)) setFrom("");
  }, [sources, from]);

  // La destination ne peut pas être la source : on bascule sur une autre jarre (l'épargne en priorité)
  useEffect(() => {
    if (from && from === to) {
      const next = [...SAVINGS_JARS, ...JAR_KEYS_ALL].find((k) => k !== from);
      if (next) setTo(next);
    }
  }, [from, to]);

  const flash = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage(null), 3500);
  };

  const done = async (m: string) => {
    window.dispatchEvent(new CustomEvent("mjars:transactionSaved")); // accueil et alertes se recalculent
    await load();
    flash(m);
  };

  const checkedLeftovers = leftovers.filter((l) => !unchecked.has(l.jar) && l.jar !== leftoverTarget);
  const leftoverTotal = round2(checkedLeftovers.reduce((s, l) => s + l.amount, 0));

  const onLeftover = async () => {
    if (checkedLeftovers.length === 0 || busy) return;
    setBusy(true);
    try {
      let ok = 0;
      for (const l of checkedLeftovers) {
        const r = await addJarTransfer({ from: l.jar, to: leftoverTarget, amount: l.amount });
        if (!r.ok) throw new Error(r.error);
        ok++;
      }
      await done(ok === 1 ? t("xfer.done") : t("xfer.doneMany", { n: ok }));
    } catch {
      flash("⚠️ " + t("xfer.err.generic"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const parsed = Number(amount.replace(",", "."));
  const manualError = from
    ? checkTransfer({ from, to, amount: parsed, fromNet: net(from) })
    : null;
  const showManualError = amount.trim() !== "" && manualError !== null;

  const onManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || busy) return;
    const err = checkTransfer({ from, to, amount: parsed, fromNet: net(from) });
    if (err) { flash("⚠️ " + t(`xfer.err.${err}`)); return; }
    setBusy(true);
    try {
      const r = await addJarTransfer({ from, to, amount: parsed, note });
      if (!r.ok) throw new Error(r.error);
      setAmount("");
      setNote("");
      await done(t("xfer.done"));
    } catch {
      flash("⚠️ " + t("xfer.err.generic"));
    } finally {
      setBusy(false);
    }
  };

  const onUndo = async (tr: JarTransfer) => {
    if (busy) return;
    if (!confirm(t("xfer.confirmUndo", { amount: money(tr.amount), from: JAR_LABELS[tr.fromJar], to: JAR_LABELS[tr.toJar] }))) return;
    setBusy(true);
    try {
      const r = await deleteJarTransfer(tr.id);
      if (!r.ok) throw new Error(r.error);
      await done(t("xfer.undone"));
    } catch {
      flash("⚠️ " + t("xfer.err.generic"));
    } finally {
      setBusy(false);
    }
  };

  const label = (k: JarKey) => `${JAR_ALERT_EMOJIS[k]} ${JAR_LABELS[k]}`;
  const afterFrom = from ? round2(net(from) - (Number.isFinite(parsed) && parsed > 0 ? parsed : 0)) : 0;
  const afterTo = round2(net(to) + (Number.isFinite(parsed) && parsed > 0 ? parsed : 0));

  return (
    <section className="settings-section jt">
      <h3 className="settings-section-title">{t("xfer.title")}</h3>
      <p className="jt-sub">{t("xfer.subtitle")}</p>

      {message && (
        <div className={`settings-message ${message.includes("✅") ? "success" : "error"}`}>{message}</div>
      )}

      {transfers === null && <p className="jt-missing" role="alert">{t("xfer.missing")}</p>}

      {transfers !== null && totals && (
        <>
          {/* Reste non dépensé → épargne */}
          <h4 className="jt-h">{t("xfer.leftoverTitle")}</h4>
          <p className="jt-sub">{t("xfer.leftoverHint")}</p>
          {leftovers.length === 0 ? (
            <p className="jt-empty">{t("xfer.leftoverNone")}</p>
          ) : (
            <>
              <ul className="jt-list">
                {leftovers.map((l) => (
                  <li key={l.jar} className="jt-row">
                    <label className="jt-check">
                      <input
                        type="checkbox"
                        checked={!unchecked.has(l.jar)}
                        onChange={(e) => {
                          const next = new Set(unchecked);
                          if (e.target.checked) next.delete(l.jar); else next.add(l.jar);
                          setUnchecked(next);
                        }}
                      />
                      <span>{label(l.jar)}</span>
                    </label>
                    <strong>{money(l.amount)}</strong>
                  </li>
                ))}
              </ul>
              <div className="jt-line">
                <label className="jt-field">
                  <span>{t("xfer.leftoverTo")}</span>
                  <select value={leftoverTarget} onChange={(e) => setLeftoverTarget(e.target.value as JarKey)} className="jar-input">
                    {SAVINGS_JARS.map((k) => <option key={k} value={k}>{label(k)}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  className="settings-btn settings-btn-primary"
                  disabled={busy || checkedLeftovers.length === 0}
                  onClick={onLeftover}
                >
                  {t("xfer.leftoverBtn", { amount: money(leftoverTotal) })}
                </button>
              </div>
            </>
          )}

          {/* Transfert libre */}
          <h4 className="jt-h">{t("xfer.manualTitle")}</h4>
          {sources.length === 0 ? (
            <p className="jt-empty">{t("xfer.noSource")}</p>
          ) : (
            <form className="jt-form" onSubmit={onManual}>
              <div className="jt-line">
                <label className="jt-field">
                  <span>{t("xfer.from")}</span>
                  <select value={from} onChange={(e) => setFrom(e.target.value as JarKey | "")} className="jar-input">
                    <option value="" disabled>—</option>
                    {sources.map((k) => (
                      <option key={k} value={k}>{label(k)} · {t("xfer.balance", { amount: money(availableToTransfer(net(k))) })}</option>
                    ))}
                  </select>
                </label>
                <label className="jt-field">
                  <span>{t("xfer.to")}</span>
                  <select value={to} onChange={(e) => setTo(e.target.value as JarKey)} className="jar-input">
                    {JAR_KEYS_ALL.filter((k) => k !== from).map((k) => <option key={k} value={k}>{label(k)}</option>)}
                  </select>
                </label>
              </div>

              <div className="jt-line">
                <label className="jt-field">
                  <span>{t("xfer.amount")} ({curSym()})</span>
                  <span className="jt-amount">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      placeholder="0,00"
                      onChange={(e) => setAmount(e.target.value)}
                      className="jar-input"
                      aria-invalid={showManualError}
                    />
                    <button
                      type="button"
                      className="push-btn push-btn--quiet"
                      disabled={!from}
                      onClick={() => from && setAmount(String(availableToTransfer(net(from))).replace(".", ","))}
                    >
                      {t("xfer.all")}
                    </button>
                  </span>
                </label>
                <label className="jt-field">
                  <span>{t("xfer.note")}</span>
                  <input type="text" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="jar-input" />
                </label>
              </div>

              {from && isSavingsJar(from) && <p className="jt-warn">{t("xfer.warnSavings")}</p>}
              {net(to) < -0.005 && <p className="jt-hint">{t("xfer.toDeficit", { amount: money(-net(to)) })}</p>}
              {from && Number.isFinite(parsed) && parsed > 0 && !manualError && (
                <p className="jt-hint">
                  {t("xfer.after", { from: label(from), fromAmount: money(afterFrom), to: label(to), toAmount: money(afterTo) })}
                </p>
              )}
              {showManualError && manualError && <p className="jt-warn" role="alert">{t(`xfer.err.${manualError}`)}</p>}

              <button type="submit" className="settings-btn settings-btn-primary" disabled={busy || !from || manualError !== null}>
                {t("xfer.submit")}
              </button>
            </form>
          )}

          {/* Historique */}
          <h4 className="jt-h">{t("xfer.historyTitle")}</h4>
          {!transfers || transfers.length === 0 ? (
            <p className="jt-empty">{t("xfer.historyEmpty")}</p>
          ) : (
            <ul className="jt-list">
              {transfers.map((tr) => (
                <li key={tr.id} className="jt-row jt-row--history">
                  <span className="jt-what">
                    <span>{label(tr.fromJar)} → {label(tr.toJar)}</span>
                    <span className="jt-meta">{tr.date}{tr.note ? ` · ${tr.note}` : ""}</span>
                  </span>
                  <strong>{money(tr.amount)}</strong>
                  <button type="button" className="push-btn push-btn--quiet" disabled={busy} onClick={() => onUndo(tr)}>
                    {t("xfer.undo")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
};

export default JarTransfers;
