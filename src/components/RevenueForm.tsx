import React, { useEffect, useState } from "react";
import { appendRevenue, getAccounts, getRevenueAccounts } from "../api";
import { loadAutoRules, AutoRule } from "../autoRules";
import { loadRevenueAccounts, saveRevenueAccounts } from "../revenueAccountsUtils";
import { loadAccounts, saveAccounts } from "../accountsUtils";
import { loadPreferredCurrencies } from "../currencyUtils";
import { useExchangeRate } from "../hooks/useExchangeRate";
import CurrencySelector from "./CurrencySelector";

// ── Crypto rate helper ────────────────────────────────────────────────────────

const COIN_IDS: Record<string, string> = {
  BTC:  "bitcoin",
  ETH:  "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  XMR:  "monero",
  SOL:  "solana",
};

// Détecte le ticker crypto dans la chaîne "méthode" (ex: "BTC", "USDC_ETH", "Virement BTC")
function detectCoin(methodStr: string): string | null {
  const upper = methodStr.toUpperCase();
  // Ordre important : USDT avant USD, USDC avant USD
  for (const ticker of ["USDT", "USDC", "BTC", "ETH", "XMR", "SOL"]) {
    if (upper.includes(ticker)) return ticker;
  }
  return null;
}

interface RevenueFormProps {
  prefill?: any | null;
  onClearPrefill?: () => void;
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

const RevenueForm: React.FC<RevenueFormProps> = ({ prefill, onClearPrefill }) => {
  // ── Mode toggle ──────────────────────────────────────────────────────────────
  const [isCryptoMode, setIsCryptoMode] = useState(false);

  // ── Champs communs ───────────────────────────────────────────────────────────
  const [date, setDate] = useState<string>(todayISO());
  const [source, setSource] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  // ── Champs crypto uniquement ─────────────────────────────────────────────────
  const [value, setValue] = useState<string>("USD");
  const [cryptoQuantity, setCryptoQuantity] = useState<string>("");
  const [method, setMethod] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [cryptoAddress, setCryptoAddress] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [incomeType, setIncomeType] = useState<string>("");

  const [preferredCurrencies] = useState<string[]>(loadPreferredCurrencies);
  const [rateManuallyEdited, setRateManuallyEdited] = useState(false);

  const { rate: fetchedRate, loading: rateLoading } = useExchangeRate(
    isCryptoMode ? value : "EUR",
    date
  );

  // Auto-remplir le taux dès que la devise ou la date change
  useEffect(() => {
    if (!isCryptoMode) return;
    if (rateManuallyEdited) return;
    if (value === "EUR") {
      setRate("1");
    } else if (fetchedRate !== null) {
      setRate(fetchedRate.toFixed(6).replace(/\.?0+$/, ""));
    }
  }, [fetchedRate, value, isCryptoMode]);

  useEffect(() => {
    setRateManuallyEdited(false);
  }, [value, date]);

  // ── Cours crypto live ────────────────────────────────────────────────────────
  const [cryptoFetching, setCryptoFetching] = useState(false);
  const [cryptoFetchError, setCryptoFetchError] = useState<string | null>(null);
  const [cryptoFetchedInfo, setCryptoFetchedInfo] = useState<{ coin: string; usd: number; eur: number } | null>(null);

  const fetchCryptoRates = async () => {
    const coin = detectCoin(method);
    if (!coin) return;
    const amountNum = parseFloat(amount.replace(",", "."));
    if (isNaN(amountNum) || amountNum <= 0) return;

    setCryptoFetching(true);
    setCryptoFetchError(null);
    setCryptoFetchedInfo(null);
    try {
      const coinId = COIN_IDS[coin];
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,eur`
      );
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const data = await res.json() as Record<string, { usd: number; eur: number }>;
      const prices = data[coinId];
      if (!prices) throw new Error("Coin non trouvé");

      const usdPrice = prices.usd;  // prix 1 coin en USD
      const eurPrice = prices.eur;  // prix 1 coin en EUR

      // Quantité : pour stablecoins (USDT/USDC) ≈ parité 1:1 avec USD
      const isStable = coin === "USDT" || coin === "USDC";
      const qty = isStable ? amountNum : amountNum / usdPrice;
      setCryptoQuantity(qty.toFixed(isStable ? 2 : 8).replace(/\.?0+$/, ""));

      // Taux = prix crypto/EUR (utilisé pour le calcul EUR dans Google Sheets)
      setRate(eurPrice.toFixed(isStable ? 6 : 2).replace(/\.?0+$/, ""));
      setRateManuallyEdited(true); // empêche useExchangeRate d'écraser

      setCryptoFetchedInfo({ coin, usd: usdPrice, eur: eurPrice });
    } catch (e: any) {
      setCryptoFetchError("Impossible de récupérer les cours : " + (e.message || String(e)));
    } finally {
      setCryptoFetching(false);
    }
  };

  const [appliedRule, setAppliedRule] = useState<AutoRule | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ── Comptes ──────────────────────────────────────────────────────────────────
  const [revenueAccounts, setRevenueAccounts] = useState(loadRevenueAccounts());
  const [spendingAccounts, setSpendingAccounts] = useState(loadAccounts());

  useEffect(() => {
    getRevenueAccounts().then(setRevenueAccounts).catch(() => setRevenueAccounts(loadRevenueAccounts()));
  }, []);
  useEffect(() => {
    const reload = () =>
      getRevenueAccounts().then(setRevenueAccounts).catch(() => setRevenueAccounts(loadRevenueAccounts()));
    window.addEventListener("revenueAccountsUpdated", reload);
    return () => window.removeEventListener("revenueAccountsUpdated", reload);
  }, []);
  useEffect(() => {
    getAccounts().then(setSpendingAccounts).catch(() => setSpendingAccounts(loadAccounts()));
  }, []);

  // ── Prefill ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!prefill) return;

    // Si des champs crypto sont présents → basculer en mode crypto
    const hasCrypto =
      prefill.cryptoQuantity != null ||
      prefill.cryptoAddress ||
      prefill.method ||
      (prefill.value && prefill.value !== "EUR");
    if (hasCrypto) setIsCryptoMode(true);

    // Date = aujourd'hui, pas celle de la transaction source

    if (prefill.source) {
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

    if (prefill.amount != null) setAmount(String(prefill.amount));
    if (prefill.value) setValue(prefill.value);
    if (prefill.cryptoQuantity != null) setCryptoQuantity(String(prefill.cryptoQuantity));
    if (prefill.method) setMethod(prefill.method);
    if (prefill.rate != null) setRate(String(prefill.rate));
    if (prefill.cryptoAddress) setCryptoAddress(prefill.cryptoAddress);
    if (prefill.destination) setDestination(prefill.destination);
    if (prefill.incomeType) setIncomeType(prefill.incomeType);

    setAppliedRule(null);
    onClearPrefill?.();
  }, [prefill, onClearPrefill, revenueAccounts]);

  // ── Source change (auto-rules) ───────────────────────────────────────────────
  const handleSourceChange = (v: string) => {
    setSource(v);
    const text = v.trim().toLowerCase();
    if (!text) { setAppliedRule(null); return; }
    const rules = loadAutoRules().filter((r) => r.mode === "revenue");
    const rule = rules.find((r) => text.includes(r.keyword.toLowerCase()));
    if (!rule) { setAppliedRule(null); return; }
    setAppliedRule(rule);
    if (rule.destination) setDestination(rule.destination);
  };

  // ── Auto-ajout de comptes ────────────────────────────────────────────────────
  const ensureRevenueAccountExists = (name: string) => {
    if (!name.trim()) return;
    if (revenueAccounts.some((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase())) return;
    const updated = [...revenueAccounts, { id: `revaccount_${Date.now()}`, name: name.trim(), icon: "💰", type: incomeType.trim() || "" }];
    saveRevenueAccounts(updated);
    setRevenueAccounts(updated);
    window.dispatchEvent(new CustomEvent("revenueAccountsUpdated"));
  };

  const ensureSpendingAccountExists = (name: string) => {
    if (!name.trim()) return;
    if (spendingAccounts.some((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase())) return;
    const updated = [...spendingAccounts, { id: `account_${Date.now()}`, name: name.trim(), icon: "💳" }];
    saveAccounts(updated);
    setSpendingAccounts(updated);
    window.dispatchEvent(new CustomEvent("spendingAccountsUpdated"));
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const numAmount = amount.trim() === "" ? null : parseFloat(amount.replace(",", "."));
    if (!date || !source) {
      setMessage("Merci de saisir au minimum la date et la source.");
      return;
    }

    try {
      setLoading(true);
      ensureRevenueAccountExists(source);
      if (isCryptoMode && destination.trim()) ensureSpendingAccountExists(destination);

      if (isCryptoMode) {
        const numCryptoQty = cryptoQuantity.trim() === "" ? null : parseFloat(cryptoQuantity.replace(",", "."));
        const numRate = rate.trim() === "" ? null : parseFloat(rate.replace(",", "."));
        await appendRevenue({
          date: formatDateForGoogleSheets(date),
          source,
          amount: numAmount ?? undefined,
          value,
          cryptoQuantity: numCryptoQty ?? undefined,
          method,
          rate: numRate ?? undefined,
          cryptoAddress,
          destination,
          incomeType,
        });
      } else {
        // Mode simple : pas de champs crypto, mais devise/destination/type inclus
        await appendRevenue({
          date: formatDateForGoogleSheets(date),
          source,
          amount: numAmount ?? undefined,
          value,
          destination: destination.trim() || undefined,
          incomeType: incomeType.trim() || undefined,
        });
      }

      setMessage("✅ Revenu enregistré avec succès");

      // Reset
      setSource("");
      setAmount("");
      setValue("USD");
      setCryptoQuantity("");
      setMethod("");
      setRate("");
      setCryptoAddress("");
      setDestination("");
      setIncomeType("");
      setDate(todayISO());
      setRevenueAccounts(loadRevenueAccounts());
      setSpendingAccounts(loadAccounts());

    } catch (err: any) {
      setMessage("❌ Erreur : " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px", backgroundColor: "var(--bg-card)", borderRadius: "12px" }}
    >
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
          💶 Revenu simple
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
          ₿ Revenu crypto
        </button>
      </div>

      {/* ── Date ── */}
      <div>
        <label htmlFor="rev-date" style={labelStyle}>📅 Date</label>
        <input
          id="rev-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={fieldStyle}
        />
      </div>

      {/* ── Source ── */}
      <div>
        <label htmlFor="rev-source" style={labelStyle}>💰 Source de revenu</label>
        <input
          id="rev-source"
          type="text"
          list="revenue-accounts-list"
          value={source}
          onChange={(e) => handleSourceChange(e.target.value)}
          placeholder="Sélectionner ou saisir une source..."
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
          💵 Montant{!isCryptoMode && <span style={{ fontWeight: 400, fontSize: "12px", color: "var(--text-muted)", marginLeft: "6px" }}>€</span>}
        </label>
        <input
          id="rev-amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={isCryptoMode ? "ex: 1500" : "ex: 1500"}
          style={fieldStyle}
        />
      </div>

      {/* ── Devise (toujours visible) ── */}
      <div>
        <label style={labelStyle}>💱 Devise du revenu</label>
        <CurrencySelector value={value} preferred={preferredCurrencies} onChange={setValue} />
      </div>

      {/* ── Compte de destination (toujours visible) ── */}
      <div>
        <label htmlFor="rev-dest" style={labelStyle}>🏦 Compte de destination <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optionnel)</span></label>
        <input
          id="rev-dest"
          type="text"
          list="spending-accounts-list"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Sélectionner ou saisir un compte..."
          style={fieldStyle}
        />
        <datalist id="spending-accounts-list">
          {spendingAccounts.map((acc) => (
            <option key={acc.id} value={acc.name}>
              {acc.icon} {acc.name}
            </option>
          ))}
        </datalist>
      </div>

      {/* ── Type de revenu (toujours visible) ── */}
      <div>
        <label htmlFor="rev-type" style={labelStyle}>📋 Type de revenu <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optionnel)</span></label>
        <input
          id="rev-type"
          type="text"
          value={incomeType}
          onChange={(e) => setIncomeType(e.target.value)}
          placeholder="ex: Salaire, Freelance, Crypto..."
          style={fieldStyle}
        />
      </div>

      {/* ── Champs crypto uniquement ── */}
      {isCryptoMode && (
        <>
          {/* Quantité Crypto */}
          <div>
            <label htmlFor="rev-qty" style={labelStyle}>🪙 Quantité Crypto <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optionnel)</span></label>
            <input
              id="rev-qty"
              type="text"
              inputMode="decimal"
              value={cryptoQuantity}
              onChange={(e) => setCryptoQuantity(e.target.value)}
              placeholder="ex: 0.05"
              style={fieldStyle}
            />
          </div>

          {/* Méthode */}
          <div>
            <label htmlFor="rev-method" style={labelStyle}>💳 Méthode <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optionnel)</span></label>
            <input
              id="rev-method"
              type="text"
              value={method}
              onChange={(e) => { setMethod(e.target.value); setCryptoFetchedInfo(null); setCryptoFetchError(null); }}
              placeholder="ex: BTC, USDT, ETH, USDC…"
              style={fieldStyle}
            />
          </div>

          {/* ── Bouton cours live — visible si coin détecté + montant renseigné ── */}
          {(() => {
            const coin = detectCoin(method);
            const amountNum = parseFloat(amount.replace(",", "."));
            if (!coin || isNaN(amountNum) || amountNum <= 0) return null;
            const isStable = coin === "USDT" || coin === "USDC";
            return (
              <div style={{ background: "rgba(255,149,0,0.08)", border: "1px solid rgba(255,149,0,0.25)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Coin détecté */}
                <div style={{ fontSize: 13, color: "#FF9500", fontWeight: 600 }}>
                  {coin === "BTC" ? "₿" : coin === "ETH" ? "Ξ" : "🪙"} {coin} détecté
                  {isStable && <span style={{ fontWeight: 400, marginLeft: 6, color: "var(--text-muted)" }}>(stablecoin — parité ~1:1 avec USD)</span>}
                </div>

                {/* Bouton */}
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
                    ? "⏳ Récupération en cours…"
                    : `💱 Récupérer les cours ${coin} (live)`}
                </button>

                {/* Résultat du fetch */}
                {cryptoFetchedInfo && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)" }}>Prix {cryptoFetchedInfo.coin}/USD</span>
                      <span style={{ fontWeight: 600 }}>{cryptoFetchedInfo.usd.toLocaleString("fr-FR")} $</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)" }}>Prix {cryptoFetchedInfo.coin}/EUR</span>
                      <span style={{ fontWeight: 600 }}>{cryptoFetchedInfo.eur.toLocaleString("fr-FR")} €</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)" }}>Quantité {cryptoFetchedInfo.coin}</span>
                      <span style={{ fontWeight: 700, color: "#FF9500" }}>{cryptoQuantity}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#34C759", marginTop: 2 }}>
                      ✓ Quantité crypto et taux auto-remplis
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

          {/* Taux de change */}
          <div>
            <label htmlFor="rev-rate" style={labelStyle}>
              📊 Taux de change
              {value !== "EUR" && (
                <span style={{ fontWeight: 400, fontSize: "12px", color: "var(--text-muted)", marginLeft: "6px" }}>
                  ({value} → EUR)
                </span>
              )}
              {rateLoading && (
                <span style={{ fontWeight: 400, fontSize: "12px", color: "#007AFF", marginLeft: "8px" }}>⏳ Chargement…</span>
              )}
              {!rateLoading && !rateManuallyEdited && rate && value !== "EUR" && (
                <span style={{ fontWeight: 400, fontSize: "12px", color: "#34C759", marginLeft: "8px" }}>✓ Auto</span>
              )}
            </label>
            <input
              id="rev-rate"
              type="text"
              inputMode="decimal"
              value={rate}
              onChange={(e) => { setRate(e.target.value); setRateManuallyEdited(true); }}
              placeholder={value === "EUR" ? "1" : "Chargement automatique…"}
              style={{
                ...fieldStyle,
                border: `1px solid ${!rateManuallyEdited && rate && value !== "EUR" ? "rgba(52,199,89,0.5)" : "var(--border-color)"}`,
              }}
            />
          </div>

          {/* Adresse Crypto */}
          <div>
            <label htmlFor="rev-addr" style={labelStyle}>🔐 Adresse Crypto <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optionnel)</span></label>
            <input
              id="rev-addr"
              type="text"
              value={cryptoAddress}
              onChange={(e) => setCryptoAddress(e.target.value)}
              placeholder="ex: 0x..."
              style={fieldStyle}
            />
          </div>
        </>
      )}

      {/* ── Règle appliquée ── */}
      {appliedRule && (
        <div style={{ padding: "10px", borderRadius: "8px", backgroundColor: "rgba(52,199,89,0.1)", border: "1px solid rgba(52,199,89,0.3)", fontSize: "13px", color: "var(--text-main)" }}>
          ✅ Règle appliquée : "{appliedRule.keyword}"{appliedRule.destination && ` → ${appliedRule.destination}`}
        </div>
      )}

      {/* ── Message ── */}
      {message && (
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
      )}

      {/* ── Bouton ── */}
      <button
        type="submit"
        disabled={loading}
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
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: loading ? "none" : isCryptoMode
            ? "0 2px 8px rgba(255,149,0,0.35)"
            : "0 2px 8px rgba(52,199,89,0.35)",
        }}
      >
        {loading ? "Enregistrement..." : isCryptoMode ? "Enregistrer le revenu crypto" : "Enregistrer le revenu"}
      </button>
    </form>
  );
};

export default RevenueForm;
