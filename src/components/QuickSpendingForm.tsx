// src/components/QuickSpendingForm.tsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { appendSpending, getAccounts, searchSpendings } from "../api";
import { updateStreak } from "../streakUtils";
import { JarKey } from "../types";
import { loadAccounts } from "../accountsUtils";
import { tagsToString, loadTags } from "../tagsUtils";
import { loadPreferredCurrencies, getCurrencyInfo } from "../currencyUtils";
import { loadLastExpenseCurrency, saveLastExpenseCurrency } from "../currencySettings";
import { useExchangeRate } from "../hooks/useExchangeRate";
import {
  Supplier,
  buildSuppliers,
  topSuppliers,
  searchSuppliers,
  cleanSupplierName,
} from "../suppliersUtils";
import CurrencySelector from "./CurrencySelector";

const JAR_LABELS: Record<JarKey, { label: string; emoji: string; color: string }> = {
  NEC: { label: "NEC", emoji: "🏺", color: "var(--jar-nec, #007AFF)" },
  FFA: { label: "FFA", emoji: "🌱", color: "var(--jar-ffa, #34C759)" },
  LTSS: { label: "LTSS", emoji: "🏦", color: "var(--jar-ltss, #FFD60A)" },
  PLAY: { label: "PLAY", emoji: "🎮", color: "var(--jar-play, #FF9500)" },
  EDUC: { label: "EDUC", emoji: "📚", color: "var(--jar-educ, #AF52DE)" },
  GIFT: { label: "GIFT", emoji: "🎁", color: "var(--jar-gift, #5AC8FA)" },
};

const LAST_TAGS_KEY = "mjars:lastSpendingTags";
const LAST_JAR_KEY = "mjars:lastSpendingJar";

let suppliersCache: Supplier[] | null = null;

const todayISO = () => new Date().toISOString().slice(0, 10);

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function formatDateLabel(iso: string): string {
  if (iso === todayISO()) return "Aujourd'hui";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface QuickSpendingFormProps {
  onClose: () => void;
  onSuccess?: () => void;
  prefill?: any | null;
}

const QuickSpendingForm: React.FC<QuickSpendingFormProps> = ({ onClose, onSuccess, prefill }) => {
  const [date, setDate] = useState<string>(todayISO());
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(() => loadLastExpenseCurrency());
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const backspaceLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const [jar, setJar] = useState<JarKey>(() => readLS<JarKey>(LAST_JAR_KEY, "NEC"));
  const [account, setAccount] = useState(() => localStorage.getItem("mjars:defaultSpendingAccount") || "Cash");
  const [supplier, setSupplier] = useState("");
  const [picked, setPicked] = useState<Supplier | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>(() => readLS<string[]>(LAST_TAGS_KEY, []));
  const [preferredCurrencies, setPreferredCurrencies] = useState<string[]>(loadPreferredCurrencies);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>(suppliersCache ?? []);

  const { rate, loading: rateLoading, error: rateError } = useExchangeRate(currency, date);

  const [accounts, setAccountsState] = useState(loadAccounts());

  useEffect(() => {
    let cancelled = false;
    searchSpendings("", 500)
      .then((res) => {
        if (cancelled) return;
        const built = buildSuppliers(res.rows);
        suppliersCache = built;
        setSuppliers(built);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const reload = () =>
      getAccounts()
        .then((list) => setAccountsState(list.length > 0 ? list : loadAccounts()))
        .catch(() => setAccountsState(loadAccounts()));
    reload();
    window.addEventListener("spendingAccountsUpdated", reload);
    return () => window.removeEventListener("spendingAccountsUpdated", reload);
  }, []);

  useEffect(() => {
    if (accounts.length > 0 && !accounts.some(a => a.name === account)) {
      setAccount(accounts[0].name);
    }
  }, [accounts, account]);

  useEffect(() => {
    const reload = () => setPreferredCurrencies(loadPreferredCurrencies());
    window.addEventListener("preferredCurrenciesUpdated", reload);
    return () => window.removeEventListener("preferredCurrenciesUpdated", reload);
  }, []);

  useEffect(() => {
    if (prefill) {
      if (prefill.jar) setJar(prefill.jar);
      if (prefill.account) setAccount(prefill.account);
      if (prefill.amount != null) setAmount(String(prefill.amount));
      if (prefill.description) setSupplier(cleanSupplierName(prefill.description));
      if (prefill.tags && typeof prefill.tags === "string") {
        const tagIds = prefill.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
        setSelectedTags(tagIds);
      }
    }
  }, [prefill]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const frequent = useMemo(() => topSuppliers(suppliers, 6), [suppliers]);
  const search = useMemo(() => searchSuppliers(suppliers, supplier), [suppliers, supplier]);
  const typing = supplier.trim().length > 0 && !picked;
  const tagPresets = useMemo(
    () => loadTags().filter(t => t.favori !== false).map(t => ({ id: t.id, emoji: t.emoji, label: t.name })),
    []
  );
  const allTags = useMemo(() => loadTags(), []);

  const applySupplier = (s: Supplier) => {
    setSupplier(s.name);
    setPicked(s);
    setJar(s.jar);
    if (accounts.some(a => a.name === s.account)) setAccount(s.account);
    if (s.tags.length > 0) setSelectedTags(s.tags);
    supplierInputRef.current?.blur();
  };

  const clearSupplier = () => {
    setSupplier("");
    setPicked(null);
  };

  const handleNumberClick = (num: string) => {
    if (num === "." && amount.includes(".")) return;
    setAmount(prev => prev + num);
  };

  const handleBackspace = () => setAmount(prev => prev.slice(0, -1));
  const handleClear = () => setAmount("");

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    );
  };

  const handleSubmit = async () => {
    const name = search.exact?.name ?? cleanSupplierName(supplier);
    if (!name) {
      setMessage("❌ Fournisseur requis");
      return;
    }
    const raw = parseFloat(amount.replace(",", "."));
    if (!amount || !isFinite(raw) || raw <= 0) {
      setMessage("❌ Montant requis");
      return;
    }
    if (currency !== "EUR" && !rate) {
      setMessage("❌ Taux de change indisponible");
      return;
    }

    try {
      setLoading(true);

      const tagsString = selectedTags.length > 0 ? tagsToString(selectedTags) : undefined;
      const originalAmount = parseFloat(amount);
      const eurAmount = currency === "EUR" ? originalAmount : originalAmount * rate!;
      const finalDescription = currency !== "EUR"
        ? `${name} (${originalAmount} ${currency})`
        : name;

      await appendSpending({
        date,
        jar,
        account,
        amount: Math.round(eurAmount * 100) / 100,
        description: finalDescription,
        tags: tagsString,
      });

      saveLastExpenseCurrency(currency);
      writeLS(LAST_TAGS_KEY, selectedTags);
      writeLS(LAST_JAR_KEY, jar);
      suppliersCache = null;
      updateStreak();
      window.dispatchEvent(new CustomEvent("mjars:transactionSaved"));

      setMessage("✅ Enregistré !");

      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 800);

    } catch (error: any) {
      console.error("Erreur:", error);
      setMessage(`❌ ${error.message || "Erreur"}`);
    } finally {
      setLoading(false);
    }
  };

  const selectedTagObjects = selectedTags
    .map(id => allTags.find(t => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);

  const currencyInfo = getCurrencyInfo(currency);
  const canSubmit = !loading && !!amount && supplier.trim().length > 0;

  return (
    <div className="qsf-screen">
      {/* Header */}
      <div className="qsf-header">
        <button type="button" className="qsf-close" onClick={onClose} aria-label="Fermer">✕</button>
        <h2 className="qsf-title">Dépense</h2>
        <button
          type="button"
          className={`qsf-currency-pill${currency !== "EUR" ? " qsf-currency-pill--foreign" : ""}`}
          onClick={() => setCurrencyOpen(o => !o)}
          aria-expanded={currencyOpen}
        >
          {currencyInfo.flag} {currency} ▾
        </button>
      </div>

      {currencyOpen && (
        <div className="qsf-currency-panel">
          <CurrencySelector
            value={currency}
            preferred={preferredCurrencies}
            onChange={(c) => { setCurrency(c); setCurrencyOpen(false); }}
          />
        </div>
      )}

      {/* Fournisseur */}
      <div className="qsf-supplier">
        <div className="qsf-supplier-field">
          <input
            ref={supplierInputRef}
            type="text"
            className="qsf-supplier-input"
            placeholder="Fournisseur (magasin, enseigne…)"
            value={supplier}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            onChange={(e) => { setSupplier(e.target.value); setPicked(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
          {supplier && (
            <button type="button" className="qsf-supplier-clear" onClick={clearSupplier} aria-label="Effacer">✕</button>
          )}
        </div>

        <div className="qsf-chips">
          {!typing && frequent.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`qsf-chip${picked?.key === s.key ? " qsf-chip--active" : ""}`}
              onClick={() => applySupplier(s)}
            >
              {s.name}
            </button>
          ))}
          {!typing && frequent.length === 0 && (
            <span className="qsf-chips-hint">Tes fournisseurs fréquents apparaîtront ici</span>
          )}
          {typing && (
            <>
              {search.didYouMean && (
                <button type="button" className="qsf-chip qsf-chip--suggest" onClick={() => applySupplier(search.didYouMean!)}>
                  Vouliez-vous dire « {search.didYouMean.name} » ?
                </button>
              )}
              {search.matches.map((s) => (
                <button key={s.key} type="button" className="qsf-chip" onClick={() => applySupplier(s)}>
                  {s.name}
                </button>
              ))}
              {!search.exact && (
                <span className="qsf-chips-hint">Nouveau : « {cleanSupplierName(supplier)} »</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="qsf-amount-area">
        <div className="qsf-amount-row">
          <span className={`qsf-amount-number${amount ? "" : " qsf-amount-number--empty"}`}>{amount || "0"}</span>
          <span className="qsf-amount-unit">{currency}</span>
        </div>
        {currency !== "EUR" && amount && parseFloat(amount) > 0 ? (
          <div className="qsf-rate-hint">
            {rateLoading && <span>⏳</span>}
            {!rateLoading && rate && <span>≈ {(parseFloat(amount) * rate).toFixed(2)} €</span>}
            {!rateLoading && rateError && <span className="qsf-rate-error">⚠️ {rateError}</span>}
          </div>
        ) : !amount && picked && currency === "EUR" ? (
          <button type="button" className="qsf-last-amount" onClick={() => setAmount(String(picked.lastAmount))}>
            Dernier : {picked.lastAmount.toFixed(2)} €
          </button>
        ) : (
          <div className="qsf-rate-hint" />
        )}
      </div>

      {/* Jars */}
      <div className="qsf-jars">
        {(Object.keys(JAR_LABELS) as JarKey[]).map((jarKey) => (
          <button
            key={jarKey}
            type="button"
            className={`qsf-jar${jar === jarKey ? " qsf-jar--active" : ""}`}
            style={{ "--jar-color": JAR_LABELS[jarKey].color } as React.CSSProperties}
            onClick={() => setJar(jarKey)}
          >
            <span className="qsf-jar-emoji">{JAR_LABELS[jarKey].emoji}</span>
            <span className="qsf-jar-label">{JAR_LABELS[jarKey].label}</span>
          </button>
        ))}
      </div>

      {/* Numpad */}
      <div className="qsf-numpad">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"].map((key) => (
          <button
            key={key}
            type="button"
            className={`qsf-key${key === "⌫" ? " qsf-key--back" : ""}`}
            onClick={() => key === "⌫" ? handleBackspace() : handleNumberClick(key)}
            onPointerDown={() => {
              if (key === "⌫") backspaceLongPressRef.current = setTimeout(handleClear, 600);
            }}
            onPointerUp={() => { if (backspaceLongPressRef.current) clearTimeout(backspaceLongPressRef.current); }}
            onPointerLeave={() => { if (backspaceLongPressRef.current) clearTimeout(backspaceLongPressRef.current); }}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Résumé + détails */}
      <div className="qsf-details">
        <button
          type="button"
          className="qsf-summary"
          onClick={() => setDetailsOpen(o => !o)}
          aria-expanded={detailsOpen}
        >
          <span className="qsf-summary-main">
            <span className="qsf-summary-text">
              💳 {account} · 📅 {formatDateLabel(date)}
            </span>
            <span className="qsf-summary-edit">{detailsOpen ? "Fermer" : "Modifier"}</span>
          </span>
          <span className="qsf-summary-tags">
            {selectedTagObjects.length === 0 && <span className="qsf-summary-notag">Aucun tag</span>}
            {selectedTagObjects.map(t => (
              <span key={t.id} className="qsf-summary-tag">{t.emoji} {t.name}</span>
            ))}
          </span>
        </button>

        {detailsOpen && (
          <div className="qsf-details-body">
            <label className="qsf-field">
              <span className="qsf-field-icon">💳</span>
              <select className="qsf-select" value={account} onChange={(e) => setAccount(e.target.value)}>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.name}>{acc.icon} {acc.name}</option>
                ))}
              </select>
            </label>

            {tagPresets.length > 0 && (
              <div className="qsf-field qsf-field--wrap">
                <span className="qsf-field-icon">🏷️</span>
                <div className="qsf-tags-wrap">
                  {tagPresets.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`qsf-tag${selectedTags.includes(tag.id) ? " qsf-tag--active" : ""}`}
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.emoji} {tag.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="qsf-field">
              <span className="qsf-field-icon">📅</span>
              <input
                type="date"
                className="qsf-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="qsf-footer">
        {message && (
          <div className={`qsf-message${message.includes("✅") ? " qsf-message--ok" : " qsf-message--err"}`}>
            {message}
          </div>
        )}
        <button
          type="button"
          className="qsf-submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {loading ? "⏳ Enregistrement…" : "✓ Enregistrer"}
        </button>
      </div>
    </div>
  );
};

export default QuickSpendingForm;
