// src/components/QuickSpendingForm.tsx
import React, { useState, useEffect, useRef } from "react";
import { appendSpending, getAccounts } from "../api";
import { updateStreak } from "../streakUtils";
import { JarKey } from "../types";
import { loadAccounts } from "../accountsUtils";
import { tagsToString, loadTags } from "../tagsUtils";
import { loadPreferredCurrencies } from "../currencyUtils";
import { loadLastExpenseCurrency, saveLastExpenseCurrency } from "../currencySettings";
import { useExchangeRate } from "../hooks/useExchangeRate";
import CurrencySelector from "./CurrencySelector";

const JAR_LABELS: Record<JarKey, { label: string; emoji: string; color: string }> = {
  NEC: { label: "NEC", emoji: "🏺", color: "var(--jar-nec, #007AFF)" },
  FFA: { label: "FFA", emoji: "🌱", color: "var(--jar-ffa, #34C759)" },
  LTSS: { label: "LTSS", emoji: "🏦", color: "var(--jar-ltss, #FFD60A)" },
  PLAY: { label: "PLAY", emoji: "🎮", color: "var(--jar-play, #FF9500)" },
  EDUC: { label: "EDUC", emoji: "📚", color: "var(--jar-educ, #AF52DE)" },
  GIFT: { label: "GIFT", emoji: "🎁", color: "var(--jar-gift, #5AC8FA)" },
};

function getTagPresets() {
  return loadTags()
    .filter(t => t.favori !== false)
    .map(t => ({ id: t.id, emoji: t.emoji, label: t.name }));
}

const todayISO = () => new Date().toISOString().slice(0, 10);

interface QuickSpendingFormProps {
  onClose: () => void;
  onSuccess?: () => void;
  prefill?: any | null;
}

const QuickSpendingForm: React.FC<QuickSpendingFormProps> = ({ onClose, onSuccess, prefill }) => {
  const [date, setDate] = useState<string>(todayISO());
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(() => loadLastExpenseCurrency());
  const backspaceLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [jar, setJar] = useState<JarKey>("NEC");
  const [account, setAccount] = useState(() => localStorage.getItem("mjars:defaultSpendingAccount") || "Cash");
  const [description, setDescription] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [preferredCurrencies, setPreferredCurrencies] = useState<string[]>(loadPreferredCurrencies);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { rate, loading: rateLoading, error: rateError } = useExchangeRate(currency, date);

  const [accounts, setAccountsState] = useState(loadAccounts());
  useEffect(() => {
    getAccounts().then(setAccountsState).catch(() => setAccountsState(loadAccounts()));
  }, []);
  useEffect(() => {
    const reload = () => getAccounts().then(setAccountsState).catch(() => setAccountsState(loadAccounts()));
    window.addEventListener("spendingAccountsUpdated", reload);
    return () => window.removeEventListener("spendingAccountsUpdated", reload);
  }, []);

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
      if (prefill.description) setDescription(prefill.description);
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
      const baseDesc = description || `Dépense ${jar}`;
      const finalDescription = currency !== "EUR"
        ? `${baseDesc} (${originalAmount} ${currency})`
        : baseDesc;

      await appendSpending({
        date,
        jar,
        account,
        amount: Math.round(eurAmount * 100) / 100,
        description: finalDescription,
        tags: tagsString,
      });

      saveLastExpenseCurrency(currency);
      updateStreak();
      window.dispatchEvent(new CustomEvent("mjars:transactionSaved"));

      setMessage("✅ Enregistré !");

      setTimeout(() => {
        setDate(todayISO());
        setAmount("");
        setDescription("");
        setSelectedTags([]);
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

  const tagPresets = getTagPresets();
  const hasDetails = account !== (localStorage.getItem("mjars:defaultSpendingAccount") || "Cash")
    || selectedTags.length > 0
    || !!description
    || date !== todayISO();

  return (
    <div className="qsf-screen">
      {/* Header */}
      <div className="qsf-header">
        <button type="button" className="qsf-close" onClick={onClose} aria-label="Fermer">✕</button>
        <h2 className="qsf-title">Dépense</h2>
        <div className="qsf-currency-slot">
          <CurrencySelector value={currency} preferred={preferredCurrencies} onChange={setCurrency} />
        </div>
      </div>

      {/* Amount */}
      <div className="qsf-amount-area">
        <div className="qsf-amount-row">
          <span className="qsf-amount-number">{amount || "0"}</span>
          <span className="qsf-amount-unit">{currency}</span>
        </div>
        {currency !== "EUR" && amount && parseFloat(amount) > 0 && (
          <div className="qsf-rate-hint">
            {rateLoading && <span>⏳</span>}
            {!rateLoading && rate && <span>≈ {(parseFloat(amount) * rate).toFixed(2)} €</span>}
            {!rateLoading && rateError && <span className="qsf-rate-error">⚠️ {rateError}</span>}
          </div>
        )}
      </div>

      {/* Jar selector — 3×2 grid */}
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

      {/* Numpad — 4×3 grid */}
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

      {/* Collapsible details */}
      <div className="qsf-details">
        <button
          type="button"
          className="qsf-details-toggle"
          onClick={() => setDetailsOpen(o => !o)}
        >
          <span className="qsf-details-chevron">{detailsOpen ? "▲" : "▼"}</span>
          <span>Détails</span>
          {hasDetails && <span className="qsf-details-dot" />}
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
              <span className="qsf-field-icon">📝</span>
              <input
                type="text"
                className="qsf-input"
                placeholder="Description (optionnel)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

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
          disabled={loading || !amount}
        >
          {loading ? "⏳ Enregistrement…" : "✓ Enregistrer"}
        </button>
      </div>
    </div>
  );
};

export default QuickSpendingForm;
