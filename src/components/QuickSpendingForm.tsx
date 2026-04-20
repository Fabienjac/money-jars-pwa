// src/components/QuickSpendingForm.tsx
// FORMULAIRE DÉPENSE OPTIMISÉ - Quick Input avec Numpad Intégré
import React, { useState, useEffect, useRef, useMemo } from "react";
import { appendSpending, searchSpendings, getAccounts } from "../api";
import { JarKey } from "../types";
import { loadAccounts } from "../accountsUtils";
import { tagsToString, tagsFromString } from "../tagsUtils";
import { loadPreferredCurrencies } from "../currencyUtils";
import { useExchangeRate } from "../hooks/useExchangeRate";
import CurrencySelector from "./CurrencySelector";

interface RecentTransaction {
  description: string;
  amount: number;
  jar: JarKey;
  account: string;
  date: string;
  tags?: string;
}

const JAR_LABELS: Record<JarKey, { label: string; emoji: string }> = {
  NEC: { label: "NEC", emoji: "🏺" },
  FFA: { label: "FFA", emoji: "🌱" },
  LTSS: { label: "LTSS", emoji: "🏦" },
  PLAY: { label: "PLAY", emoji: "🎮" },
  EDUC: { label: "EDUC", emoji: "📚" },
  GIFT: { label: "GIFT", emoji: "🎁" },
};

const TAG_PRESETS = [
  { id: "vie_quotidienne", emoji: "🛒", label: "Vie quotidienne" },
  { id: "sante_corps", emoji: "🧘", label: "Santé & corps" },
  { id: "transport", emoji: "🚗", label: "Transport" },
  { id: "habitat", emoji: "🏠", label: "Habitat" },
  { id: "loisirs", emoji: "🎉", label: "Loisirs" },
  { id: "don_cadeau", emoji: "🎁", label: "Don / Cadeau" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

function formatEur(value: number): string {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface QuickSpendingFormProps {
  onClose: () => void;
  onSuccess?: () => void;
  prefill?: any | null; // ✅ Ajouté pour pré-remplir depuis historique
}

const QuickSpendingForm: React.FC<QuickSpendingFormProps> = ({ onClose, onSuccess, prefill }) => {
  const [date, setDate] = useState<string>(todayISO());
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(() => loadLastExpenseCurrency());
  const [currencyFavorites, setCurrencyFavorites] = useState<string[]>(() => loadCurrencyFavorites());
  const [eurPreview, setEurPreview] = useState<number | null>(null);
  const [eurPreviewError, setEurPreviewError] = useState<string | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [jar, setJar] = useState<JarKey>("NEC");
  const [account, setAccount] = useState("Cash");
  const [description, setDescription] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currency, setCurrency] = useState("EUR");
  const [preferredCurrencies, setPreferredCurrencies] = useState<string[]>(loadPreferredCurrencies);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { rate, loading: rateLoading, error: rateError } = useExchangeRate(currency, date);
  
  // Les 2 dernières dépenses (chargées depuis le Google Sheet)
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setRecentLoading(true);
    searchSpendings("", 10)
      .then((res) => {
        if (cancelled || !res.rows?.length) return;
        const rows = res.rows as Array<{ date: string; description: string; amount: number; jar: string; account: string; tags?: string }>;
        const sorted = [...rows].sort((a, b) => {
          const dA = parseSheetDate(a.date);
          const dB = parseSheetDate(b.date);
          return dB.getTime() - dA.getTime();
        });
        const two: RecentTransaction[] = sorted.slice(0, 2).map((r) => ({
          description: r.description || "",
          amount: Number(r.amount) || 0,
          jar: (r.jar as JarKey) || "NEC",
          account: r.account || "Cash",
          date: toInputDate(r.date),
          tags: r.tags,
        }));
        setRecentTransactions(two);
      })
      .catch(() => setRecentTransactions([]))
      .finally(() => { if (!cancelled) setRecentLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function parseSheetDate(s: string): Date {
    if (!s) return new Date(0);
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
    const dmy = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    return new Date(s);
  }

  function toInputDate(s: string): string {
    if (!s) return todayISO();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return s.slice(0, 10);
    const dmy = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return todayISO();
  }

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

  // ✅ Gérer le prefill depuis l'historique
  useEffect(() => {
    if (prefill) {
      if (prefill.date) setDate(prefill.date);
      if (prefill.jar) setJar(prefill.jar);
      if (prefill.account) setAccount(prefill.account);
      if (prefill.amount != null) setAmount(String(prefill.amount));
      if (prefill.description) setDescription(prefill.description);
      // Tags : à parser si présents
      if (prefill.tags && typeof prefill.tags === "string") {
        const tagIds = prefill.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
        setSelectedTags(tagIds);
      }
    }
  }, [prefill]);

  // Auto-dismiss message
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

  const handleBackspace = () => {
    setAmount(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setAmount("");
  };

  const handleRecentClick = (recent: RecentTransaction) => {
    setDescription(recent.description);
    setAmount(recent.amount.toString());
    setJar(recent.jar);
    setAccount(recent.account);
    setDate(recent.date);
    setSelectedTags(recent.tags ? tagsFromString(recent.tags) : []);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(t => t !== tagId)
        : [...prev, tagId]
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
      
      setMessage("✅ Enregistré !");
      
      // Reset form
      setTimeout(() => {
        setDate(todayISO()); // ✅ Réinitialiser à aujourd'hui
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

  return (
    <div className="quick-spending-modal">
      <div className="quick-spending-overlay" onClick={onClose} />
      
      <div className="quick-spending-sheet">
        {/* Header */}
        <div className="quick-spending-header">
          <h2 className="quick-spending-title">💰 Nouvelle dépense</h2>
          <button
            type="button"
            className="quick-spending-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Les 2 dernières dépenses (cliquables pour pré-remplir) */}
        <div className="quick-recent-section">
          <p className="quick-recent-label">📝 Récentes</p>
          {recentLoading ? (
            <p className="quick-recent-loading">Chargement...</p>
          ) : recentTransactions.length > 0 ? (
            <div className="quick-recent-list">
              {recentTransactions.map((r, idx) => (
                <button
                  key={`${r.date}-${r.description}-${idx}`}
                  type="button"
                  className="quick-recent-item"
                  onClick={() => handleRecentClick(r)}
                >
                  <span className="quick-recent-desc">{r.description || "Sans description"}</span>
                  <span className="quick-recent-amount">{r.amount.toFixed(2)} €</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="quick-recent-empty">Aucune dépense récente</p>
          )}
        </div>

        {/* Date */}
        <div className="quick-date-section">
          <label className="quick-date-label">
            📅
            <input
              type="date"
              className="quick-date-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>

        {/* Devise */}
        <div className="quick-currency-section">
          <CurrencySelector
            value={currency}
            preferred={preferredCurrencies}
            onChange={setCurrency}
          />
        </div>

        {/* Montant */}
        <div className="quick-amount-section">
          <p className="quick-amount-label">💰 Montant</p>
          <div className="quick-amount-display">
            {amount || "0"}
            <span className="quick-amount-currency">{currency}</span>
          </div>
          {currency !== "EUR" && amount && parseFloat(amount) > 0 && (
            <div className="quick-amount-eur-estimate">
              {rateLoading && <span className="quick-rate-loading">⏳ Taux…</span>}
              {!rateLoading && rate && (
                <span className="quick-rate-result">
                  ≈ {(parseFloat(amount) * rate).toFixed(2)} €
                </span>
              )}
              {!rateLoading && rateError && (
                <span className="quick-rate-error">⚠️ {rateError}</span>
              )}
            </div>
          )}
        </div>

        {/* Numpad + Jars */}
        <div className="quick-numpad-section">
          <div className="quick-numpad">
            {["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "C"].map((key) => (
              <button
                key={key}
                type="button"
                className={`quick-numpad-key ${key === "C" ? "quick-numpad-clear" : ""}`}
                onClick={() => {
                  if (key === "C") handleClear();
                  else if (key === ".") handleNumberClick(".");
                  else handleNumberClick(key);
                }}
              >
                {key}
              </button>
            ))}
          </div>

          <div className="quick-jars-grid">
            {(Object.keys(JAR_LABELS) as JarKey[]).map((jarKey) => (
              <button
                key={jarKey}
                type="button"
                className={`quick-jar-btn ${jar === jarKey ? "quick-jar-btn--active" : ""}`}
                onClick={() => setJar(jarKey)}
              >
                <span className="quick-jar-emoji">{JAR_LABELS[jarKey].emoji}</span>
                <span className="quick-jar-label">{JAR_LABELS[jarKey].label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Compte */}
        <div className="quick-account-section">
          <label className="quick-account-label">
            💳
            <select
              className="quick-account-select"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.name}>
                  {acc.icon} {acc.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Tags (optionnel) */}
        <div className="quick-tags-section">
          <p className="quick-tags-label">🏷️ Tags (optionnel)</p>
          <div className="quick-tags-grid">
            {TAG_PRESETS.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={`quick-tag-btn ${selectedTags.includes(tag.id) ? "quick-tag-btn--active" : ""}`}
                onClick={() => toggleTag(tag.id)}
              >
                <span>{tag.emoji}</span>
                <span>{tag.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Description (optionnel) */}
        <div className="quick-desc-section">
          <input
            type="text"
            className="quick-desc-input"
            placeholder="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Message */}
        {message && (
          <div className={`quick-message ${message.includes("✅") ? "quick-message--success" : "quick-message--error"}`}>
            {message}
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          className="quick-submit-btn"
          onClick={handleSubmit}
          disabled={loading || !amount}
        >
          {loading ? "⏳ Enregistrement..." : "✓ Enregistrer"}
        </button>
      </div>
    </div>
  );
};

export default QuickSpendingForm;
