// Réglages : virements entre comptes (ex. de Keystone vers Redotpay). Ni revenu ni dépense : seuls les soldes des deux
// comptes changent, dans Analyses > Par compte. Calculs : src/accountTransfers.ts.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addAccountTransfer, deleteAccountTransfer, fetchAccountTransfers, fetchAllRevenuesCached, getAccounts } from "../api";
import { accountKey } from "../accountMerge";
import { checkAccountTransfer, convertTransferAmount, parseTransferAmount, type AccountTransfer } from "../accountTransfers";
import { getRateToBase } from "../exchangeRate";
import { ALL_CURRENCIES, loadPreferredCurrencies } from "../currencyUtils";
import { loadCryptos } from "../cryptoUtils";
import { currencySymbol as curSym, formatMoney, getBaseCurrency, useBaseCurrency } from "../baseCurrency";
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

const num = (n: number, max = 2) => n.toLocaleString(localeTag(), { minimumFractionDigits: 0, maximumFractionDigits: max });

const OTHER = "__other__";
const LAST_CURRENCY_KEY = "mjars:lastTransferCurrency";
const CRYPTO_CODES = new Set(["BTC", "ETH", "USDT", "USDC", "SOL", "XRP", "ADA", "DOGE", "DOT", "MATIC", "LTC", "BCH", "XMR"]);

/**
 * Devises proposées, courtes et séparées : la devise de référence, tes cryptos favorites (Réglages), tes devises
 * préférées (Réglages) ; toutes les autres sont derrière « Autre… ».
 */
function currencyLists(base: string): { cryptos: string[]; fiats: string[]; otherFiats: string[]; otherCryptos: string[] } {
  const cryptos = loadCryptos().map((c) => c.ticker).filter((c) => c !== base);
  const fiats = loadPreferredCurrencies().filter((c) => c !== base && !CRYPTO_CODES.has(c));
  const shown = new Set([base, ...cryptos, ...fiats]);
  const rest = ALL_CURRENCIES.map((c) => c.code).filter((c) => !shown.has(c));
  return { cryptos, fiats, otherFiats: rest.filter((c) => !CRYPTO_CODES.has(c)), otherCryptos: rest.filter((c) => CRYPTO_CODES.has(c)) };
}

const readLastCurrency = (): string | null => {
  try { return localStorage.getItem(LAST_CURRENCY_KEY); } catch { return null; }
};

const AccountTransfers: React.FC = () => {
  useT();
  const base = useBaseCurrency();
  const [transfers, setTransfers] = useState<AccountTransfer[] | null | undefined>(undefined); // undefined = chargement, null = table absente
  const [known, setKnown] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(() => readLastCurrency() || getBaseCurrency()); // la dernière devise utilisée (virements en USDC répétés)
  const [rateText, setRateText] = useState("");
  const [rateState, setRateState] = useState<"idle" | "loading" | "failed">("idle");
  const rateTouched = useRef(false);
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

  // La devise de référence peut changer dans les Réglages : on la suit tant qu'on n'a pas choisi autre chose
  const foreign = currency !== base;
  const lists = useMemo(() => currencyLists(base), [base]);
  const inShortList = currency === base || lists.cryptos.includes(currency) || lists.fiats.includes(currency);
  const chooseCurrency = (c: string) => {
    setCurrency(c);
    try { localStorage.setItem(LAST_CURRENCY_KEY, c); } catch { /* sans importance */ }
  };

  // Cours du jour du virement (fiat : taux historique ; crypto : prix CoinGecko), modifiable à la main
  useEffect(() => {
    if (!foreign) { setRateState("idle"); return; }
    rateTouched.current = false;
    let alive = true;
    setRateState("loading");
    getRateToBase(currency, date).then((r) => {
      if (!alive || rateTouched.current) return;
      if (r && r > 0) {
        setRateText(String(Math.round(r * 1e6) / 1e6).replace(".", ","));
        setRateState("idle");
      } else {
        setRateText("");
        setRateState("failed");
      }
    });
    return () => { alive = false; };
  }, [currency, date, foreign]);

  const typed = parseTransferAmount(amount);
  const rate = foreign ? parseTransferAmount(rateText) : 1;
  const baseAmount = foreign ? convertTransferAmount(typed, rate) : typed;
  const error = useMemo(
    () => checkAccountTransfer({ from, to, amount: typed, foreign, rate: Number.isFinite(rate) ? rate : null }),
    [from, to, typed, foreign, rate]
  );

  const flash = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    window.setTimeout(() => setMessage((m) => (m && m.text === text ? null : m)), 4000);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (busy || error) return;
    setBusy(true);
    const res = await addAccountTransfer({
      from, to, amount: foreign ? baseAmount : typed, date, note,
      ...(foreign ? { original: { amount: typed, currency, rate } } : {}),
    });
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
                <span>{t("atr.amount")}</span>
                <span className="jt-amount">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    placeholder="0,00"
                    onChange={(e) => setAmount(e.target.value)}
                    className="jar-input"
                    aria-invalid={touched && error === "amount"}
                  />
                  <select
                    value={inShortList ? currency : OTHER}
                    onChange={(e) => chooseCurrency(e.target.value === OTHER ? (lists.otherFiats[0] ?? lists.otherCryptos[0] ?? base) : e.target.value)}
                    className="jar-input"
                    aria-label={t("atr.currency")}
                  >
                    <option value={base}>{base}</option>
                    {lists.cryptos.length > 0 && (
                      <optgroup label={t("atr.groupCrypto")}>
                        {lists.cryptos.map((c) => <option key={c} value={c}>{c}</option>)}
                      </optgroup>
                    )}
                    {lists.fiats.length > 0 && (
                      <optgroup label={t("atr.groupFiat")}>
                        {lists.fiats.map((c) => <option key={c} value={c}>{c}</option>)}
                      </optgroup>
                    )}
                    <option value={OTHER}>{t("atr.otherCurrency")}</option>
                  </select>
                </span>
              </label>
              <label className="jt-field">
                <span>{t("atr.date")}</span>
                <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} className="jar-input" />
              </label>
            </div>

            {!inShortList && (
              <label className="jt-field">
                <span>{t("atr.otherCurrencyLabel")}</span>
                <select value={currency} onChange={(e) => chooseCurrency(e.target.value)} className="jar-input">
                  <optgroup label={t("atr.groupFiat")}>
                    {lists.otherFiats.map((c) => <option key={c} value={c}>{c} · {ALL_CURRENCIES.find((x) => x.code === c)?.label}</option>)}
                  </optgroup>
                  {lists.otherCryptos.length > 0 && (
                    <optgroup label={t("atr.groupCrypto")}>
                      {lists.otherCryptos.map((c) => <option key={c} value={c}>{c}</option>)}
                    </optgroup>
                  )}
                </select>
              </label>
            )}

            {foreign && (
              <div className="jt-line">
                <label className="jt-field">
                  <span>{t("atr.rate", { cur: currency, base: curSym() })}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rateText}
                    placeholder={rateState === "loading" ? "…" : "0,00"}
                    onChange={(e) => { rateTouched.current = true; setRateText(e.target.value); }}
                    className="jar-input"
                    aria-invalid={touched && error === "rate"}
                  />
                </label>
                <div className="jt-field">
                  <span>{t("atr.convertedLabel")}</span>
                  <strong className="atr-converted">{Number.isFinite(baseAmount) ? `≈ ${formatMoney(baseAmount)}` : "—"}</strong>
                </div>
              </div>
            )}
            {foreign && rateState === "failed" && <p className="jt-warn">{t("atr.rateFailed")}</p>}
            {foreign && rateState !== "failed" && <p className="jt-hint">{t("atr.rateHint")}</p>}

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
                  <strong className="atr-amount">
                    {formatMoney(tr.amount)}
                    {tr.originalAmount != null && tr.originalCurrency && (
                      <small>{num(tr.originalAmount, 8)} {tr.originalCurrency}{tr.rate ? ` × ${num(tr.rate, 6)}` : ""}</small>
                    )}
                  </strong>
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
