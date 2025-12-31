// src/components/QuickSpendingForm.tsx
// FORMULAIRE DÉPENSE OPTIMISÉ - Quick Input avec Numpad Intégré
import React, { useState, useEffect } from "react";
import { appendSpending } from "../api";
import { JarKey } from "../types";
import { loadAccounts } from "../accountsUtils";
import { tagsToString } from "../tagsUtils";

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
  { id: "vie_quotidienne", emoji: "🛒", label: "Courses" },
  { id: "sante_corps", emoji: "🧘", label: "Santé" },
  { id: "transport", emoji: "🚗", label: "Transport" },
  { id: "habitat", emoji: "🏠", label: "Habitat" },
  { id: "loisirs", emoji: "🎉", label: "Loisirs" },
  { id: "don_cadeau", emoji: "🎁", label: "Cadeau" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

interface QuickSpendingFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}

const QuickSpendingForm: React.FC<QuickSpendingFormProps> = ({ onClose, onSuccess }) => {
  const [amount, setAmount] = useState("");
  const [jar, setJar] = useState<JarKey>("NEC");
  const [account, setAccount] = useState("Cash");
  const [description, setDescription] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  
  // Transactions récentes (simulées - à remplacer par un fetch réel)
  const [recentTransactions] = useState<RecentTransaction[]>([
    { description: "chez Jeremy", amount: 52.50, jar: "NEC", account: "Cash", date: "2025-12-31" },
    { description: "Satoriz", amount: 51.33, jar: "NEC", account: "Cash", date: "2025-12-21" },
  ]);

  const accounts = loadAccounts();

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
      
      const tagsString = selectedTags.length > 0 ? tagsToString(selectedTags) : undefined;
      
      await appendSpending({
        date: todayISO(),
        jar,
        account,
        amount: parseFloat(amount),
        description: description || `Dépense ${jar}`,
        tags: tagsString,
      });
      
      setMessage("✅ Enregistré !");
      
      // Reset form
      setTimeout(() => {
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

        {/* Récentes */}
        {recentTransactions.length > 0 && (
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

        {/* Montant */}
        <div className="quick-amount-section">
          <p className="quick-amount-label">💰 Montant</p>
          <div className="quick-amount-display">
            {amount || "0"}
            <span className="quick-amount-currency">€</span>
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
