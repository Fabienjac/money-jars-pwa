// src/components/QuickSpendingForm.tsx
// FORMULAIRE DÉPENSE OPTIMISÉ - Quick Input avec Numpad Intégré
import React, { useState, useEffect, useMemo } from "react";
import { appendSpending, searchSpendings } from "../api";
import { JarKey } from "../types";
import { loadAccounts } from "../accountsUtils";
import { tagsToString } from "../tagsUtils";
import { useOffline } from "../hooks/useOffline";

interface RecentTransaction {
  description: string;
  amount: number;
  jar: JarKey;
  account: string;
  date: string;
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

interface QuickSpendingFormProps {
  onClose: () => void;
  onSuccess?: () => void;
  prefill?: any | null; // ✅ Ajouté pour pré-remplir depuis historique
}

const QuickSpendingForm: React.FC<QuickSpendingFormProps> = ({ onClose, onSuccess, prefill }) => {
  const [date, setDate] = useState<string>(todayISO());
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>("EUR");
  const [conversionRate, setConversionRate] = useState<number>(1);
  const [rateSource, setRateSource] = useState<string>("EUR");
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [jar, setJar] = useState<JarKey>("NEC");
  const [account, setAccount] = useState("Cash");
  const [description, setDescription] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [recentLoading, setRecentLoading] = useState<boolean>(false);

  const offline = useOffline();

  const accounts = loadAccounts();

  // ✅ Gérer le prefill depuis l'historique
  useEffect(() => {
    if (prefill) {
      setDate(todayISO()); // toujours aujourd'hui
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
    setDate(todayISO());
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(t => t !== tagId)
        : [...prev, tagId]
    );
  };

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setMessage("❌ Montant requis");
      return;
    }

    try {
      setLoading(true);

      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        setMessage("❌ Montant requis");
        return;
      }

      const amountEUR = currency === "EUR" ? numericAmount : numericAmount * conversionRate;
      const amountRounded = Math.round((amountEUR + Number.EPSILON) * 100) / 100;

      const tagsString = selectedTags.length > 0 ? tagsToString(selectedTags) : undefined;
      
      await appendSpending({
        date, // ✅ Utiliser la date du state
        jar,
        account,
        amount: amountRounded,
        description: description || `Dépense ${jar}`,
        tags: tagsString,
      });
      
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

  // Charger les transactions récentes (5 dernières)
  useEffect(() => {
    const cacheKey = "quick_recent_spendings";
    const readCache = (): RecentTransaction[] => {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const saveCache = (items: RecentTransaction[]) => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(items));
      } catch {
        /* ignore */
      }
    };

    const hydrateFromCache = () => {
      const cached = readCache();
      if (cached.length > 0) {
        setRecentTransactions(cached);
      }
    };

    const fetchRecents = async () => {
      setRecentLoading(true);
      try {
        if (!offline.isOnline) {
          hydrateFromCache();
          setRecentLoading(false);
          return;
        }

        const res = await searchSpendings("", 5);
        const rows = res.rows || [];

        const normalized = rows
          .filter((r) => r.description && r.amount != null)
          .map((r) => ({
            description: r.description,
            amount: Number(r.amount),
            jar: r.jar as JarKey,
            account: r.account || "Cash",
            date: r.date,
          }));

        setRecentTransactions(normalized);
        saveCache(normalized);
        offline.cacheTransactions?.(normalized);
      } catch (err) {
        console.error("Erreur chargement transactions récentes:", err);
        hydrateFromCache();
      } finally {
        setRecentLoading(false);
      }
    };

    fetchRecents();
  }, [offline]);

  // Mettre à jour la devise et le taux
  useEffect(() => {
    let cancelled = false;
    const fetchRate = async () => {
      if (currency === "EUR") {
        setConversionRate(1);
        setRateSource("EUR");
        setRateError(null);
        return;
      }

      setRateLoading(true);
      setRateError(null);
      const fallbackRates: Record<string, number> = {
        USD: 0.93,
        GBP: 1.17,
        CHF: 1.04,
        JPY: 0.0061,
        CAD: 0.68,
      };

      try {
        const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(currency)}&symbols=EUR`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        const rate = data?.rates?.EUR;
        if (!rate) throw new Error("rate missing");
        if (!cancelled) {
          setConversionRate(rate);
          setRateSource("live");
        }
      } catch (err) {
        console.warn("⚠️ Taux de change indisponible, fallback local:", err);
        const fallback = fallbackRates[currency] ?? 1;
        if (!cancelled) {
          setConversionRate(fallback);
          setRateSource("local");
          setRateError("Taux estimé (offline)");
        }
      } finally {
        if (!cancelled) setRateLoading(false);
      }
    };

    fetchRate();
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const convertedAmount = useMemo(() => {
    const numeric = parseFloat(amount || "0");
    if (isNaN(numeric)) return 0;
    return numeric * conversionRate;
  }, [amount, conversionRate]);

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

        {/* Récentes */}
        {recentLoading ? (
          <div className="quick-recent-section">
            <p className="quick-recent-label">📝 Récentes</p>
            <div className="quick-recent-list">
              <span className="quick-recent-item">Chargement...</span>
            </div>
          </div>
        ) : recentTransactions.length > 0 && (
          <div className="quick-recent-section">
            <p className="quick-recent-label">📝 Récentes</p>
            <div className="quick-recent-list">
              {recentTransactions.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="quick-recent-item"
                  onClick={() => handleRecentClick(r)}
                >
                  <span className="quick-recent-desc">{r.description}</span>
                  <span className="quick-recent-amount">{r.amount.toFixed(2)}€</span>
                </button>
              ))}
            </div>
          </div>
        )}

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

        {/* Montant */}
        <div className="quick-amount-section">
          <p className="quick-amount-label">💰 Montant</p>
          <div className="quick-amount-display">
            {amount || "0"}
            <span className="quick-amount-currency">{currency}</span>
          </div>
          <div className="quick-amount-currency-row">
            <label className="quick-currency-select-wrapper">
              <span role="img" aria-label="currency">💱</span>
              <select
                className="quick-currency-select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
                <option value="JPY">JPY</option>
                <option value="CAD">CAD</option>
              </select>
            </label>
            <div className="quick-amount-conversion">
              {rateLoading ? "⏳ Taux..." : (
                <>
                  ≈ {convertedAmount.toFixed(2)} € {rateSource === "local" && " (estimé)"}
                  {rateError && <span className="quick-rate-warning"> • {rateError}</span>}
                </>
              )}
            </div>
          </div>
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
