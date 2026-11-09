import React, { useEffect, useRef, useState } from "react";
import { appendRevenue, getAccounts, getRevenueAccounts, setRevenueAccounts as setRevenueAccountsApi, fetchEntryRules, searchRevenues } from "../api";
import { findBestRule, resolveAccountName, describeRule, distinctLabels, type EntryRule } from "../entryRules";
import { loadRevenueAccounts, saveRevenueAccounts } from "../revenueAccountsUtils";
import { loadAccounts } from "../accountsUtils";
import { loadPreferredCurrencies } from "../currencyUtils";
import { useExchangeRate } from "../hooks/useExchangeRate";
import CurrencySelector from "./CurrencySelector";
import { useT } from "../i18n";
import { useBaseCurrency, formatMoney, formatRevenueValue, parseRevenueValue } from "../baseCurrency";
import { CryptoFav, loadCryptos, fetchCryptosFromCloud, detectCryptoTicker } from "../cryptoUtils";

// ── Crypto rate helper ────────────────────────────────────────────────────────

// "USDT (TRC20)" → "TRC20"
function parseNetwork(methodStr: string): string {
  const m = methodStr.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : "";
}

interface RevenueFormProps {
  prefill?: any | null;
  onClearPrefill?: () => void;
  onSuccess?: () => void;
  fullscreen?: boolean;
  onClose?: () => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const formatDateForGoogleSheets = (isoDate: string): string => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1px solid var(--border-color)",
  backgroundColor: "var(--bg-body)",
  color: "var(--text-main)",
  fontSize: "15px",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontWeight: "600",
  fontSize: "14px",
  color: "var(--text-main)",
};

const RevenueForm: React.FC<RevenueFormProps> = ({ prefill, onClearPrefill, onSuccess, fullscreen, onClose }) => {
  const t = useT();
  // ── Mode toggle ──────────────────────────────────────────────────────────────
  const [isCryptoMode, setIsCryptoMode] = useState(false);

  // ── Champs communs ───────────────────────────────────────────────────────────
  const [date, setDate] = useState<string>(todayISO());
  const [source, setSource] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  // ── Champs crypto uniquement ─────────────────────────────────────────────────
  const base = useBaseCurrency();
  const lastCurrency = (() => { try { return localStorage.getItem("mjars:lastRevenueCurrency"); } catch { return null; } })();
  const [value, setValue] = useState<string>(lastCurrency || "USD");
  const [cryptoQuantity, setCryptoQuantity] = useState<string>("");
  const [method, setMethod] = useState<string>("");
  const [otherCrypto, setOtherCrypto] = useState(false);
  const [rate, setRate] = useState<string>("");
  const [cryptoAddress, setCryptoAddress] = useState<string>("");
  const [destination, setDestination] = useState<string>(() => localStorage.getItem("mjars:defaultRevenueAccount") || localStorage.getItem("mjars:lastRevenueDestination") || "");
  const [incomeType, setIncomeType] = useState<string>("");

  const [preferredCurrencies] = useState<string[]>(loadPreferredCurrencies);
  const [rateManuallyEdited, setRateManuallyEdited] = useState(false);

  // Taux de la devise saisie vers la devise de référence (modifiable)
  const { rate: fetchedRate, loading: rateLoading, error: rateError } = useExchangeRate(value, date, base);

  useEffect(() => {
    if (rateManuallyEdited) return;
    if (value === base) {
      setRate("1");
    } else if (fetchedRate !== null) {
      setRate(fetchedRate.toFixed(6).replace(/\.?0+$/, ""));
    } else {
      setRate("");
    }
  }, [fetchedRate, value, base, rateManuallyEdited]);

  useEffect(() => {
    setCryptoFetchedInfo(null);
  }, [amount, value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setRateManuallyEdited(false);
  }, [value, date]);

  // ── Cours crypto live ────────────────────────────────────────────────────────
  const [cryptoFetching, setCryptoFetching] = useState(false);
  const [cryptoFetchError, setCryptoFetchError] = useState<string | null>(null);
  const [cryptoFetchedInfo, setCryptoFetchedInfo] = useState<{ coin: string; price: number; priceBase: number } | null>(null);

  // Cryptos favorites (configurables dans Réglages)
  const [cryptos, setCryptos] = useState<CryptoFav[]>(loadCryptos);
  useEffect(() => {
    const reload = () => setCryptos(loadCryptos());
    window.addEventListener("cryptosUpdated", reload);
    fetchCryptosFromCloud().then((list) => { if (list) setCryptos(list); });
    return () => window.removeEventListener("cryptosUpdated", reload);
  }, []);
  const detectCoin = (m: string) => detectCryptoTicker(m, cryptos);
  const coinInfo = (t: string | null) => cryptos.find((c) => c.ticker === t);

  const fetchCryptoRates = async () => {
    const coin = detectCoin(method);
    if (!coin) return;
    const amountNum = parseFloat(amount.replace(",", "."));
    if (isNaN(amountNum) || amountNum <= 0) return;

    setCryptoFetching(true);
    setCryptoFetchError(null);
    setCryptoFetchedInfo(null);
    try {
      const coinId = coinInfo(coin)?.coingeckoId;
      if (!coinId) throw new Error(t("rev.errCoingecko"));
      const vsValue = value.toLowerCase();
      const vsBase = base.toLowerCase();
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${[...new Set([vsValue, vsBase])].join(",")}`
      );
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const data = await res.json() as Record<string, Record<string, number>>;
      const prices = data[coinId];
      if (!prices) throw new Error(t("rev.errCoinNotFound"));

      const price = prices[vsValue];      // prix d'1 coin dans la devise saisie
      const priceBase = prices[vsBase];   // prix d'1 coin dans la devise de référence
      if (!price || !priceBase) throw new Error(t("rev.errPrice", { coin, cur: !price ? value : base }));

      // Quantité : stablecoin saisi en USD ≈ parité 1:1 ; sinon montant / cours
      const isStable = !!coinInfo(coin)?.stable && value === "USD";
      const qty = isStable ? amountNum : amountNum / price;
      setCryptoQuantity(qty.toFixed(isStable ? 2 : 8).replace(/\.?0+$/, ""));

      setCryptoFetchedInfo({ coin, price, priceBase });
    } catch (e: any) {
      setCryptoFetchError(t("rev.errFetch", { msg: e.message || String(e) }));
    } finally {
      setCryptoFetching(false);
    }
  };

  // Règles automatiques (Réglages) : un mot-clé dans la source remplit le compte de destination et le type de revenu.
  const [appliedRule, setAppliedRule] = useState<EntryRule | null>(null);
  const [entryRules, setEntryRules] = useState<EntryRule[]>([]);
  const [historyTypes, setHistoryTypes] = useState<string[]>([]);
  // Champs choisis par la personne elle-même : une règle ne les remplace jamais.
  const touched = useRef({ destination: false, type: false });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ── Comptes ──────────────────────────────────────────────────────────────────
  const [revenueAccounts, setRevenueAccounts] = useState(loadRevenueAccounts());
  const [spendingAccounts, setSpendingAccounts] = useState(loadAccounts());

  useEffect(() => {
    let cancelled = false;
    fetchEntryRules().then((list) => { if (!cancelled) setEntryRules(list.filter((r) => r.mode === "revenue")); }).catch(() => {});
    searchRevenues("", 300)
      .then((res) => { if (!cancelled) setHistoryTypes(distinctLabels(res.rows.map((r) => r.incomeType))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const reload = () =>
      getRevenueAccounts()
        .then((list) => setRevenueAccounts(list.length > 0 ? list : loadRevenueAccounts()))
        .catch(() => setRevenueAccounts(loadRevenueAccounts()));
    reload();
    window.addEventListener("revenueAccountsUpdated", reload);
    return () => window.removeEventListener("revenueAccountsUpdated", reload);
  }, []);
  useEffect(() => {
    getAccounts()
      .then((list) => setSpendingAccounts(list.length > 0 ? list : loadAccounts()))
      .catch(() => setSpendingAccounts(loadAccounts()));
  }, []);

  // Mémorise la source du prefill pour le matching différé (chargement Supabase async)
  const pendingPrefillSource = useRef<string | null>(null);
  const pendingPrefillIncomeType = useRef<string | null>(null);

  // ── Prefill ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!prefill) return;

    const hasCrypto =
      prefill.cryptoQuantity != null ||
      prefill.cryptoAddress ||
      prefill.method;
    if (hasCrypto) setIsCryptoMode(true);

    if (prefill.source) {
      pendingPrefillSource.current = prefill.source;
      pendingPrefillIncomeType.current = prefill.incomeType ?? null;
      const matchedAccount = revenueAccounts.find(
        (acc) => acc.name.trim().toLowerCase() === prefill.source.trim().toLowerCase()
      );
      if (matchedAccount) {
        setSource(matchedAccount.name);
        if (matchedAccount.type && !prefill.incomeType) setIncomeType(matchedAccount.type);
      } else {
        setSource(prefill.source);
      }
    }

    // Nouveau format : value = "1000 USD" (montant d'origine) ; ancien : value = "USD"
    const pv = parseRevenueValue(prefill.value);
    if (pv.converted && pv.original != null) setAmount(String(pv.original));
    else if (prefill.amount != null) setAmount(String(prefill.amount));
    if (pv.currency) setValue(pv.currency);
    if (prefill.cryptoQuantity != null) setCryptoQuantity(String(prefill.cryptoQuantity));
    if (prefill.method) setMethod(prefill.method);
    if (prefill.rate != null) setRate(String(prefill.rate));
    if (prefill.cryptoAddress) setCryptoAddress(prefill.cryptoAddress);
    if (prefill.destination) setDestination(prefill.destination);
    if (prefill.incomeType) setIncomeType(prefill.incomeType);

    setAppliedRule(null);
    onClearPrefill?.();
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  // Relance le matching de source quand les comptes Supabase arrivent après le prefill
  useEffect(() => {
    const src = pendingPrefillSource.current;
    if (!src || !revenueAccounts.length) return;
    const matchedAccount = revenueAccounts.find(
      (acc) => acc.name.trim().toLowerCase() === src.trim().toLowerCase()
    );
    if (matchedAccount) {
      setSource(matchedAccount.name);
      if (matchedAccount.type && !pendingPrefillIncomeType.current) setIncomeType(matchedAccount.type);
      pendingPrefillSource.current = null;
    }
  }, [revenueAccounts]);

  // Types de revenu déjà utilisés (comptes de revenus + historique), sans doublon de casse
  const typeSuggestions = distinctLabels([...revenueAccounts.map((a) => a.type), ...historyTypes]);

  // ── Source change (auto-rules) ───────────────────────────────────────────────
  const handleSourceChange = (v: string) => {
    setSource(v);
    if (!v.trim()) { setAppliedRule(null); return; }
    const rule = findBestRule(v, entryRules, "revenue");
    if (!rule) { setAppliedRule(null); return; }
    // Compte retrouvé dans la liste sans tenir compte de la casse ; type écrit comme un type déjà utilisé s'il existe
    const dest = touched.current.destination ? null : resolveAccountName(rule.destination, spendingAccounts.map((a) => a.name));
    const known = typeSuggestions.find((x) => x.toLowerCase() === (rule.incomeType ?? "").toLowerCase());
    const type = touched.current.type || !rule.incomeType ? null : (known ?? rule.incomeType);
    if (!dest && !type) { setAppliedRule(null); return; }
    setAppliedRule({ ...rule, destination: dest ?? undefined, incomeType: type ?? undefined });
    if (dest) setDestination(dest);
    if (type) setIncomeType(type);
  };

  // ── Auto-ajout de comptes ────────────────────────────────────────────────────
  const ensureRevenueAccountExists = (name: string) => {
    if (!name.trim()) return;
    if (revenueAccounts.some((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase())) return;
    const updated = [...revenueAccounts, { id: `revaccount_${Date.now()}`, name: name.trim(), icon: "💰", type: incomeType.trim() || "" }];
    saveRevenueAccounts(updated);
    setRevenueAccounts(updated);
    // Sync Supabase pour que les Réglages voient le nouveau compte
    setRevenueAccountsApi(updated).catch(() => {});
    window.dispatchEvent(new CustomEvent("revenueAccountsUpdated"));
  };

  const isPositive = (v: string) => {
    const n = parseFloat(v.replace(",", "."));
    return !isNaN(n) && n > 0;
  };
  // Réseau obligatoire dès que la crypto en propose (ou en saisie libre « Autre »)
  const selCoin = detectCoin(method);
  const selNetwork = parseNetwork(method);
  const selFree = otherCrypto || (method.trim() !== "" && !selCoin);
  const networkRequired = selFree ? method.trim() !== "" : (coinInfo(selCoin)?.networks.length ?? 0) > 0;
  const networkOk = !networkRequired || !!selNetwork;
  // Montant converti dans la devise de référence (taux modifiable)
  const amountNumV = parseFloat(amount.replace(",", "."));
  const fxRate = value === base ? 1 : parseFloat(rate.replace(",", "."));
  const baseAmount: number | null =
    !isNaN(amountNumV) && amountNumV > 0 && fxRate > 0
      ? Math.round(amountNumV * fxRate * 100) / 100
      : null;
  const formValid =
    !!destination.trim() &&
    isPositive(amount) &&
    baseAmount !== null &&
    (!isCryptoMode || (!!method.trim() && isPositive(cryptoQuantity) && networkOk));

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!date || !source) {
      setMessage(t("rev.errDate"));
      return;
    }
    if (!destination.trim()) {
      setMessage(t("rev.errDestination"));
      return;
    }
    if (!isPositive(amount)) {
      setMessage(t("rev.errAmount", { cur: value }));
      return;
    }
    if (baseAmount === null) {
      setMessage(t("rev.errRate", { from: value, to: base }));
      return;
    }
    if (isCryptoMode) {
      if (!method.trim()) {
        setMessage(t("rev.errCrypto"));
        return;
      }
      if (!isPositive(cryptoQuantity)) {
        setMessage(t("rev.errCryptoQty"));
        return;
      }
      if (!networkOk) {
        setMessage(t("rev.errNetwork"));
        return;
      }
    }

    try {
      setLoading(true);
      ensureRevenueAccountExists(source);
      // Compte de destination : s'applique en mode simple ET crypto
      try {
        localStorage.setItem("mjars:lastRevenueDestination", destination.trim());
        localStorage.setItem("mjars:lastRevenueCurrency", value);
      } catch { /* ignore */ }

      if (isCryptoMode) {
        const numCryptoQty = cryptoQuantity.trim() === "" ? null : parseFloat(cryptoQuantity.replace(",", "."));
        // Taux enregistré : cours de la crypto dans la devise de référence si récupéré en live, sinon taux de change
        const storedRate = cryptoFetchedInfo ? cryptoFetchedInfo.priceBase : fxRate;
        await appendRevenue({
          date: formatDateForGoogleSheets(date),
          source,
          amount: baseAmount,
          value: formatRevenueValue(amountNumV, value),
          cryptoQuantity: numCryptoQty ?? undefined,
          method,
          rate: storedRate,
          cryptoAddress,
          destination,
          incomeType,
        });
      } else {
        // Mode simple : pas de champs crypto, mais devise/destination/type inclus
        await appendRevenue({
          date: formatDateForGoogleSheets(date),
          source,
          amount: baseAmount,
          value: formatRevenueValue(amountNumV, value),
          rate: value !== base ? fxRate : undefined,
          destination: destination.trim(),
          incomeType: incomeType.trim() || undefined,
        });
      }

      setMessage(t("rev.saved"));

      // Notifie le dashboard pour rafraîchir analytics + jar projections
      window.dispatchEvent(new CustomEvent("mjars:revenueSaved"));

      // Reset puis fermeture automatique
      setSource("");
      setAmount("");
      setCryptoQuantity("");
      setMethod("");
      setOtherCrypto(false);
      setRate("");
      setCryptoAddress("");
      setIncomeType("");
      touched.current = { destination: false, type: false };
      setAppliedRule(null);
      setDate(todayISO());
      setRevenueAccounts(loadRevenueAccounts());
      setSpendingAccounts(loadAccounts());

      // Fermeture automatique après 800ms (laisse le message se lire)
      setTimeout(() => onSuccess?.(), 800);

    } catch (err: any) {
      setMessage(t("rev.errGeneric", { msg: err.message || String(err) }));
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const fields = (
    <>
      {/* ── Toggle Simple / Crypto ── */}
      <div style={{
        display: "flex",
        backgroundColor: "var(--bg-body)",
        borderRadius: "12px",
        padding: "4px",
        border: "1px solid var(--border-color)",
      }}>
        <button
          type="button"
          onClick={() => setIsCryptoMode(false)}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: "9px",
            border: "none",
            fontSize: "14px",
            fontWeight: "700",
            cursor: "pointer",
            transition: "all 0.2s",
            background: !isCryptoMode
              ? "linear-gradient(135deg, #34C759 0%, #28A745 100%)"
              : "transparent",
            color: !isCryptoMode ? "#fff" : "var(--text-muted)",
            boxShadow: !isCryptoMode ? "0 2px 8px rgba(52,199,89,0.35)" : "none",
          }}
        >
          {t("rev.simple")}
        </button>
        <button
          type="button"
          onClick={() => setIsCryptoMode(true)}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: "9px",
            border: "none",
            fontSize: "14px",
            fontWeight: "700",
            cursor: "pointer",
            transition: "all 0.2s",
            background: isCryptoMode
              ? "linear-gradient(135deg, #FF9500 0%, #E08600 100%)"
              : "transparent",
            color: isCryptoMode ? "#fff" : "var(--text-muted)",
            boxShadow: isCryptoMode ? "0 2px 8px rgba(255,149,0,0.35)" : "none",
          }}
        >
          {t("rev.crypto")}
        </button>
      </div>

      {/* ── Source ── */}
      <div>
        <label htmlFor="rev-source" style={labelStyle}>{t("rev.source")}</label>
        {revenueAccounts.length > 0 && (
          <div className="rsf-accounts" role="radiogroup" aria-label={t("rev.sourcesAria")} style={{ marginBottom: 8 }}>
            {revenueAccounts.map((acc) => {
              const active = acc.name.trim().toLowerCase() === source.trim().toLowerCase();
              return (
                <button
                  key={acc.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`rsf-account${active ? " active" : ""}`}
                  onClick={() => handleSourceChange(acc.name)}
                >
                  <span aria-hidden="true">{acc.icon || "💰"}</span> {acc.name}
                </button>
              );
            })}
          </div>
        )}
        <input
          id="rev-source"
          type="text"
          list="revenue-accounts-list"
          value={source}
          onChange={(e) => handleSourceChange(e.target.value)}
          placeholder={revenueAccounts.length > 0 ? t("rev.sourcePlaceholderMore") : t("rev.sourcePlaceholder")}
          style={fieldStyle}
        />
        <datalist id="revenue-accounts-list">
          {revenueAccounts.map((acc) => (
            <option key={acc.id} value={acc.name}>
              {acc.icon} {acc.name} {acc.type && `(${acc.type})`}
            </option>
          ))}
        </datalist>
      </div>

      {/* ── Montant ── */}
      <div>
        <label htmlFor="rev-amount" style={labelStyle}>
          {t("rev.amount")}<span style={{ fontWeight: 400, fontSize: "12px", color: "var(--text-muted)", marginLeft: "6px" }}>{value}</span>
        </label>
        <input
          id="rev-amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1500"
          style={fieldStyle}
        />
        {value !== base && (
          <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>
            {baseAmount !== null
              ? <>≈ <strong style={{ color: "var(--text-main)" }}>{formatMoney(baseAmount, base)}</strong> {t("rev.convertedPreview", { rate: fxRate.toFixed(4) })}</>
              : rateLoading ? t("rev.converting") : t("rev.enterAmount", { from: value, to: base })}
          </div>
        )}
      </div>

      {/* ── Date ── */}
      <div>
        <label htmlFor="rev-date" style={labelStyle}>{t("rev.date")}</label>
        <input
          id="rev-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={fieldStyle}
        />
      </div>

      {/* ── Devise (toujours visible) ── */}
      <div>
        <label style={labelStyle}>{t("rev.currency")}</label>
        <CurrencySelector value={value} preferred={preferredCurrencies} onChange={setValue} />
      </div>

      {/* ── Taux de change vers la devise de référence (devise du revenu ≠ devise de référence) ── */}
      {value !== base && (
        <div>
          <label htmlFor="rev-rate" style={labelStyle}>
            {t("rev.rate")}
            <span style={{ fontWeight: 400, fontSize: "12px", color: "var(--text-muted)", marginLeft: "6px" }}>
              ({value} → {base})
            </span>
            {rateLoading && (
              <span style={{ fontWeight: 400, fontSize: "12px", color: "var(--jar-nec)", marginLeft: "8px" }}>{t("rev.rateLoading")}</span>
            )}
            {!rateLoading && !rateManuallyEdited && rate && (
              <span style={{ fontWeight: 400, fontSize: "12px", color: "#34C759", marginLeft: "8px" }}>{t("rev.rateAuto")}</span>
            )}
          </label>
          <input
            id="rev-rate"
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={(e) => { setRate(e.target.value); setRateManuallyEdited(true); }}
            placeholder={rateError ? t("rev.rateUnavailable") : t("rev.rateAutoLoading")}
            style={{
              ...fieldStyle,
              border: `1px solid ${!rateManuallyEdited && rate ? "rgba(52,199,89,0.5)" : "var(--border-color)"}`,
            }}
          />
        </div>
      )}

      {/* ── Compte de destination (obligatoire, liste fermée : pas de doublon par faute de frappe) ── */}
      <div>
        <label style={labelStyle}>{t("rev.destination")}</label>
        {spendingAccounts.length === 0 && !destination ? (
          <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            {t("rev.noAccounts")}
          </div>
        ) : (
          <div className="rsf-accounts" role="radiogroup" aria-label={t("rev.destinationAria")}>
            {[
              ...spendingAccounts,
              ...(destination && !spendingAccounts.some((a) => a.name.trim().toLowerCase() === destination.trim().toLowerCase())
                ? [{ id: "__current", name: destination, icon: "💳" }]
                : []),
            ].map((acc) => {
              const active = acc.name.trim().toLowerCase() === destination.trim().toLowerCase();
              return (
                <button
                  key={acc.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`rsf-account${active ? " active" : ""}`}
                  onClick={() => { touched.current.destination = true; setAppliedRule(null); setDestination(acc.name); }}
                >
                  <span aria-hidden="true">{acc.icon || "💳"}</span> {acc.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Type de revenu (toujours visible) ── */}
      <div>
        <label htmlFor="rev-type" style={labelStyle}>{t("rev.type")} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>{t("common.optional")}</span></label>
        <input
          id="rev-type"
          type="text"
          list="rev-type-list"
          value={incomeType}
          onChange={(e) => { touched.current.type = true; setIncomeType(e.target.value); }}
          placeholder={t("rev.typePlaceholder")}
          style={fieldStyle}
        />
        {/* Types déjà utilisés dans tes comptes de revenus : on réutilise la même écriture plutôt que d'en créer une variante */}
        <datalist id="rev-type-list">
          {typeSuggestions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>

      {/* ── Champs crypto uniquement ── */}
      {isCryptoMode && (
        <>
          {/* Montant en crypto */}
          <div>
            <label htmlFor="rev-qty" style={labelStyle}>{t("rev.cryptoAmount")}</label>
            <input
              id="rev-qty"
              type="text"
              inputMode="decimal"
              value={cryptoQuantity}
              onChange={(e) => setCryptoQuantity(e.target.value)}
              placeholder={t("rev.cryptoQtyPlaceholder")}
              style={fieldStyle}
            />
          </div>

          {/* Crypto + Réseau (stockés ensemble : "USDT (TRC20)") */}
          {(() => {
            const coin = detectCoin(method);
            const network = parseNetwork(method);
            const networks = coin ? coinInfo(coin)?.networks ?? [] : [];
            const showFree = otherCrypto || (method.trim() !== "" && !coin);
            const reset = () => { setCryptoFetchedInfo(null); setCryptoFetchError(null); };
            return (
              <>
                <div>
                  <label style={labelStyle}>{t("rev.cryptoLabel")}</label>
                  <div className="rsf-accounts" role="radiogroup" aria-label={t("rev.cryptoAria")}>
                    {cryptos.map((cf) => cf.ticker).map((c) => {
                      const active = !showFree && coin === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`rsf-account${active ? " active" : ""}`}
                          onClick={() => {
                            setOtherCrypto(false);
                            reset();
                            if (coin === c && !showFree) { setMethod(""); return; }
                            setMethod(c);
                          }}
                        >
                          {c}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={showFree}
                      className={`rsf-account${showFree ? " active" : ""}`}
                      onClick={() => { setOtherCrypto(true); setMethod(""); reset(); }}
                    >
                      {t("rev.other")}
                    </button>
                  </div>
                  {showFree && (
                    <input
                      id="rev-method"
                      type="text"
                      value={method}
                      onChange={(e) => { setMethod(e.target.value); reset(); }}
                      placeholder={t("rev.otherPlaceholder")}
                      style={{ ...fieldStyle, marginTop: 8 }}
                    />
                  )}
                </div>

                <div>
                  <label style={labelStyle}>{t("rev.network")}</label>
                  {!showFree && networks.length > 0 ? (
                    <div className="rsf-accounts" role="radiogroup" aria-label={t("rev.network").replace(/^\S+\s/, "")}>
                      {networks.map((n) => {
                        const active = network.toLowerCase() === n.toLowerCase();
                        return (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            className={`rsf-account${active ? " active" : ""}`}
                            onClick={() => setMethod(active ? coin! : `${coin} (${n})`)}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {showFree
                        ? t("rev.networkFree")
                        : coin
                          ? t("rev.networkNone", { coin })
                          : t("rev.networkFirst")}
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* ── Bouton cours live — visible si coin détecté + montant renseigné ── */}
          {(() => {
            const coin = detectCoin(method);
            const amountNum = parseFloat(amount.replace(",", "."));
            if (!coin || isNaN(amountNum) || amountNum <= 0) return null;
            const isStable = !!coinInfo(coin)?.stable;
            const canFetch = !!coinInfo(coin)?.coingeckoId;
            return (
              <div style={{ background: "rgba(255,149,0,0.08)", border: "1px solid rgba(255,149,0,0.25)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Coin détecté */}
                <div style={{ fontSize: 13, color: "#FF9500", fontWeight: 600 }}>
                  {coin === "BTC" ? "₿" : coin === "ETH" ? "Ξ" : "🪙"} {t("rev.detected", { coin })}
                  {isStable && <span style={{ fontWeight: 400, marginLeft: 6, color: "var(--text-muted)" }}>{t("rev.stableNote")}</span>}
                </div>

                {/* Bouton (si un identifiant CoinGecko est connu) */}
                {canFetch && (
                <button
                  type="button"
                  onClick={fetchCryptoRates}
                  disabled={cryptoFetching}
                  style={{
                    padding: "11px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: cryptoFetching ? "#ccc" : "linear-gradient(135deg, #FF9500, #E08600)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: cryptoFetching ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {cryptoFetching
                    ? t("rev.fetching")
                    : t("rev.fetchRates", { coin })}
                </button>
                )}

                {/* Résultat du fetch */}
                {cryptoFetchedInfo && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)" }}>{t("rev.priceOf", { coin: cryptoFetchedInfo.coin, cur: value })}</span>
                      <span style={{ fontWeight: 600 }}>{formatMoney(cryptoFetchedInfo.price, value, 2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)" }}>{t("rev.priceOf", { coin: cryptoFetchedInfo.coin, cur: base })}</span>
                      <span style={{ fontWeight: 600 }}>{formatMoney(cryptoFetchedInfo.priceBase, base, 2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)" }}>{t("rev.amountOf", { coin: cryptoFetchedInfo.coin })}</span>
                      <span style={{ fontWeight: 700, color: "#FF9500" }}>{cryptoQuantity}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#34C759", marginTop: 2 }}>
                      {t("rev.cryptoFilled")}
                    </div>
                  </div>
                )}

                {/* Erreur */}
                {cryptoFetchError && (
                  <div style={{ fontSize: 13, color: "#FF3B30" }}>⚠️ {cryptoFetchError}</div>
                )}
              </div>
            );
          })()}

          {/* Adresse Crypto */}
          <div>
            <label htmlFor="rev-addr" style={labelStyle}>{t("rev.address")} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>{t("common.optional")}</span></label>
            <input
              id="rev-addr"
              type="text"
              value={cryptoAddress}
              onChange={(e) => setCryptoAddress(e.target.value)}
              placeholder={t("rev.addressPlaceholder")}
              style={fieldStyle}
            />
          </div>
        </>
      )}

    </>
  );

  const ruleEl = appliedRule ? (
    <div style={{ padding: "10px", borderRadius: "8px", backgroundColor: "rgba(52,199,89,0.1)", border: "1px solid rgba(52,199,89,0.3)", fontSize: "13px", color: "var(--text-main)" }}>
      {t("rev.ruleApplied", { keyword: appliedRule.keyword })}{describeRule(appliedRule) && ` → ${describeRule(appliedRule)}`}
    </div>
  ) : null;

  const messageEl = message ? (
    <div style={{
      padding: "10px",
      borderRadius: "8px",
      backgroundColor: message.includes("✅") ? "rgba(52,199,89,0.1)" : "rgba(255,59,48,0.1)",
      color: message.includes("✅") ? "#34C759" : "#FF3B30",
      fontSize: "14px",
      fontWeight: "600",
    }}>
      {message}
    </div>
  ) : null;

  const submitBtn = (
    <button
      type="submit"
      disabled={loading || !formValid}
      style={{
        padding: "14px",
        borderRadius: "12px",
        border: "none",
        background: loading
          ? "#999"
          : isCryptoMode
            ? "linear-gradient(135deg, #FF9500 0%, #E08600 100%)"
            : "linear-gradient(135deg, #34C759 0%, #30B350 100%)",
        color: "white",
        fontSize: "16px",
        fontWeight: "700",
        cursor: loading || !formValid ? "not-allowed" : "pointer",
        opacity: !loading && !formValid ? 0.45 : 1,
        boxShadow: loading ? "none" : isCryptoMode
          ? "0 2px 8px rgba(255,149,0,0.35)"
          : "0 2px 8px rgba(52,199,89,0.35)",
      }}
    >
      {loading ? t("rev.saving") : isCryptoMode ? t("rev.saveCrypto") : t("rev.save")}
    </button>
  );

  if (fullscreen) {
    return (
      <form className="rsf-screen" onSubmit={handleSubmit}>
        <div className="rsf-header">
          <button type="button" className="qsf-close" onClick={onClose} aria-label={t("qsf.close")}>✕</button>
          <h2 className="qsf-title">{t("rev.title")}</h2>
          <span className="rsf-header-spacer" />
        </div>
        <div className="rsf-body">
          {fields}
          {ruleEl}
        </div>
        <div className="rsf-footer">
          {messageEl}
          {submitBtn}
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px", backgroundColor: "var(--bg-card)", borderRadius: "12px" }}
    >
      {fields}
      {ruleEl}
      {messageEl}
      {submitBtn}
    </form>
  );
};

export default RevenueForm;
