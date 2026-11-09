// Réglages : virements entre comptes (ex. de Keystone vers Redotpay). Ni revenu ni dépense : seuls les soldes des deux
// comptes changent, dans Analyses > Par compte. Calculs : src/accountTransfers.ts.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { addAccountTransfer, deleteAccountTransfer, fetchAccountTransfers, fetchAllRevenuesCached, getAccounts } from "../api";
import { accountKey } from "../accountMerge";
import { checkAccountTransfer, parseTransferAmount, type AccountTransfer } from "../accountTransfers";
import { currencySymbol as curSym, formatMoney } from "../baseCurrency";
import { loadAccounts } from "../accountsUtils";
import { localeTag, t, useT } from "../i18n";

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(localeTag(), { day: "numeric", month: "short", year: "numeric" });
};

const AccountTransfers: React.FC = () => {
  useT();
  const [transfers, setTransfers] = useState<AccountTransfer[] | null | undefined>(undefined); // undefined = chargement, null = table absente
  const [known, setKnown] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setTransfers(await fetchAccountTransfers());
    } catch {
      setTransfers(null);
    }
  }, []);

  useEffect(() => {
    void load();
    // Comptes proposés : ceux des Réglages, plus les destinations déjà utilisées dans les revenus
    (async () => {
      const names: string[] = [];
      try { names.push(...(await getAccounts()).map((a) => a.name)); } catch { names.push(...loadAccounts().map((a) => a.name)); }
      try { names.push(...(await fetchAllRevenuesCached()).map((r) => r.destination || "")); } catch { /* sans importance */ }
      const seen = new Set<string>();
      setKnown(names.map((n) => n.trim()).filter((n) => n && !seen.has(accountKey(n)) && seen.add(accountKey(n))).sort((a, b) => a.localeCompare(b)));
    })();
  }, [load]);

  const parsed = parseTransferAmount(amount);
  const error = useMemo(() => checkAccountTransfer({ from, to, amount: parsed }), [from, to, parsed]);

  const flash = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    window.setTimeout(() => setMessage((m) => (m && m.text === text ? null : m)), 4000);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (busy || error) return;
    setBusy(true);
    const res = await addAccountTransfer({ from, to, amount: parsed, date, note });
    setBusy(false);
    if (!res.ok) {
      flash(t("atr.err.save"), false);
      return;
    }
    setAmount("");
    setNote("");
    setTouched(false);
    flash(t("atr.saved"), true);
    await load();
  };

  const onUndo = async (tr: AccountTransfer) => {
    if (busy) return;
    setBusy(true);
    const res = await deleteAccountTransfer(tr.id);
    setBusy(false);
    flash(res.ok ? t("atr.undone") : t("atr.err.save"), res.ok);
    if (res.ok) await load();
  };

  return (
    <section className="settings-section" id="account-transfers">
      <h3 className="settings-section-title">{t("atr.title")}</h3>
      <p className="jt-sub">{t("atr.hint")}</p>

      {transfers === undefined && <p className="jt-empty">…</p>}
      {transfers === null && <p className="jt-empty">{t("atr.unavailable")}</p>}

      {transfers !== undefined && transfers !== null && (
        <>
          <form className="jt-form" onSubmit={onSubmit}>
            <div className="jt-line">
              <label className="jt-field">
                <span>{t("atr.from")}</span>
                <input type="text" list="atr-accounts" value={from} onChange={(e) => setFrom(e.target.value)} className="jar-input" autoComplete="off" />
              </label>
              <label className="jt-field">
                <span>{t("atr.to")}</span>
                <input type="text" list="atr-accounts" value={to} onChange={(e) => setTo(e.target.value)} className="jar-input" autoComplete="off" />
              </label>
            </div>
            <datalist id="atr-accounts">
              {known.map((n) => <option key={n} value={n} />)}
            </datalist>

            <div className="jt-line">
              <label className="jt-field">
                <span>{t("atr.amount")} ({curSym()})</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  placeholder="0,00"
                  onChange={(e) => setAmount(e.target.value)}
                  className="jar-input"
                  aria-invalid={touched && error === "amount"}
                />
              </label>
              <label className="jt-field">
                <span>{t("atr.date")}</span>
                <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} className="jar-input" />
              </label>
            </div>
            <label className="jt-field">
              <span>{t("atr.note")}</span>
              <input type="text" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="jar-input" />
            </label>

            {touched && error && <p className="jt-warn" role="alert">{t(`atr.err.${error}`)}</p>}
            {message && <p className={message.ok ? "jt-hint" : "jt-warn"} role="status">{message.text}</p>}

            <button type="submit" className="settings-btn settings-btn-primary" disabled={busy}>
              {t("atr.submit")}
            </button>
          </form>

          <h4 className="jt-h">{t("atr.historyTitle")}</h4>
          {transfers.length === 0 ? (
            <p className="jt-empty">{t("atr.empty")}</p>
          ) : (
            <ul className="jt-list">
              {transfers.map((tr) => (
                <li key={tr.id} className="jt-row jt-row--history">
                  <span className="jt-what">
                    <span>{tr.from} → {tr.to}</span>
                    <span className="jt-meta">{shortDate(tr.date)}{tr.note ? ` · ${tr.note}` : ""}</span>
                  </span>
                  <strong>{formatMoney(tr.amount)}</strong>
                  <button type="button" className="push-btn push-btn--quiet" disabled={busy} onClick={() => onUndo(tr)}>
                    {t("atr.undo")}
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

export default AccountTransfers;
