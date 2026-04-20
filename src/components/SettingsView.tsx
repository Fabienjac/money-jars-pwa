// src/components/SettingsView.tsx - VERSION OPTIMISÉE COMPACTE
import React, { useState, useEffect } from "react";
import { JarKey, Account, RevenueAccount } from "../types";
import { loadAutoRules, AutoRule } from "../autoRules";
import { loadAccounts, saveAccounts } from "../accountsUtils";
import { loadRevenueAccounts, saveRevenueAccounts } from "../revenueAccountsUtils";
import { loadTags } from "../tagsUtils";
import { getAccounts, getRevenueAccounts, setAccounts as setAccountsApi, setRevenueAccounts as setRevenueAccountsApi } from "../api";
import { CURRENCIES } from "../currencies";
import { loadCurrencyFavorites, saveCurrencyFavorites } from "../currencySettings";

const JAR_LABELS: Record<JarKey, string> = {
  NEC: "Nécessités",
  FFA: "Liberté Financière",
  LTSS: "Épargne Long Terme",
  PLAY: "Fun / Play",
  EDUC: "Éducation",
  GIFT: "Don / Gift",
};

const JAR_EMOJIS: Record<JarKey, string> = {
  NEC: "🏺",
  FFA: "🌱",
  LTSS: "🏦",
  PLAY: "🎮",
  EDUC: "📚",
  GIFT: "🎁",
};

const JAR_COLORS: Record<JarKey, string> = {
  NEC: "#007AFF",
  FFA: "#34C759",
  LTSS: "#FFD60A",
  PLAY: "#FF9500",
  EDUC: "#AF52DE",
  GIFT: "#5AC8FA",
};

interface JarSetting {
  key: JarKey;
  percent: number;
  initialBalance: number;
}

const SETTINGS_KEY = "mjars:jarSettings";
const RULES_KEY = "mjars:autoRules";

function loadSettings(): JarSetting[] {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return [
        { key: "NEC", percent: 55, initialBalance: 0 },
        { key: "FFA", percent: 10, initialBalance: 0 },
        { key: "LTSS", percent: 10, initialBalance: 0 },
        { key: "PLAY", percent: 10, initialBalance: 0 },
        { key: "EDUC", percent: 10, initialBalance: 0 },
        { key: "GIFT", percent: 5, initialBalance: 0 },
      ];
    }
    return JSON.parse(raw);
  } catch {
    return [
      { key: "NEC", percent: 55, initialBalance: 0 },
      { key: "FFA", percent: 10, initialBalance: 0 },
      { key: "LTSS", percent: 10, initialBalance: 0 },
      { key: "PLAY", percent: 10, initialBalance: 0 },
      { key: "EDUC", percent: 10, initialBalance: 0 },
      { key: "GIFT", percent: 5, initialBalance: 0 },
    ];
  }
}

function saveSettings(settings: JarSetting[]) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function saveRules(rules: AutoRule[]) {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

const SettingsView: React.FC = () => {
  const [jarSettings, setJarSettings] = useState<JarSetting[]>(loadSettings());
  const [rules, setRules] = useState<AutoRule[]>(loadAutoRules());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [revenueAccounts, setRevenueAccounts] = useState<RevenueAccount[]>([]);
  const [tags] = useState(loadTags());
  const [accountsLoading, setAccountsLoading] = useState(true);

  // Charger comptes de dépenses et revenus depuis le Sheet (synchro Mac / iPhone)
  useEffect(() => {
    let cancelled = false;
    setAccountsLoading(true);
    Promise.all([
      getAccounts().catch(() => loadAccounts()),
      getRevenueAccounts().catch(() => loadRevenueAccounts()),
    ]).then(([accs, revAccs]) => {
      if (!cancelled) {
        setAccounts(Array.isArray(accs) ? accs : loadAccounts());
        setRevenueAccounts(Array.isArray(revAccs) ? revAccs : loadRevenueAccounts());
      }
    }).finally(() => { if (!cancelled) setAccountsLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [currencyFavorites, setCurrencyFavorites] = useState<string[]>(() => loadCurrencyFavorites());
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showRevenueAccountForm, setShowRevenueAccountForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Nouvelle règle
  const [newRuleMode, setNewRuleMode] = useState<"spending" | "revenue">("spending");
  const [newRuleKeyword, setNewRuleKeyword] = useState("");
  const [newRuleJar, setNewRuleJar] = useState<JarKey>("NEC");
  const [newRuleAccount, setNewRuleAccount] = useState("");
  const [newRuleDestination, setNewRuleDestination] = useState("");
  const [newRuleIncomeType, setNewRuleIncomeType] = useState("");

  // Nouveau compte
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountIcon, setNewAccountIcon] = useState("💳");

  // Nouveau compte de revenu
  const [newRevenueAccountName, setNewRevenueAccountName] = useState("");
  const [newRevenueAccountIcon, setNewRevenueAccountIcon] = useState("💰");
  const [newRevenueAccountType, setNewRevenueAccountType] = useState("");

  // Édition inline des comptes de dépenses
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountName, setEditingAccountName] = useState("");
  const [editingAccountIcon, setEditingAccountIcon] = useState("💳");

  // Édition inline des comptes de revenus
  const [editingRevenueAccountId, setEditingRevenueAccountId] = useState<string | null>(null);
  const [editingRevenueAccountName, setEditingRevenueAccountName] = useState("");
  const [editingRevenueAccountIcon, setEditingRevenueAccountIcon] = useState("💰");

  const totalPercent = jarSettings.reduce((sum, j) => sum + j.percent, 0);

  const handlePercentChange = (key: JarKey, value: string) => {
    const num = parseFloat(value) || 0;
    setJarSettings((prev) =>
      prev.map((j) => (j.key === key ? { ...j, percent: num } : j))
    );
  };

  const handleBalanceChange = (key: JarKey, value: string) => {
    const num = parseFloat(value) || 0;
    setJarSettings((prev) =>
      prev.map((j) => (j.key === key ? { ...j, initialBalance: num } : j))
    );
  };

  const handleSaveSettings = () => {
    if (totalPercent !== 100) {
      setMessage("⚠️ Le total doit être exactement 100%");
      return;
    }
    saveSettings(jarSettings);
    setMessage("✅ Paramètres sauvegardés");
    setTimeout(() => setMessage(null), 3000);
  };

  const handleResetSettings = () => {
    if (!confirm("Réinitialiser les pourcentages par défaut ?")) return;
    const defaults: JarSetting[] = [
      { key: "NEC", percent: 55, initialBalance: 0 },
      { key: "FFA", percent: 10, initialBalance: 0 },
      { key: "LTSS", percent: 10, initialBalance: 0 },
      { key: "PLAY", percent: 10, initialBalance: 0 },
      { key: "EDUC", percent: 10, initialBalance: 0 },
      { key: "GIFT", percent: 5, initialBalance: 0 },
    ];
    setJarSettings(defaults);
    saveSettings(defaults);
    setMessage("✅ Réinitialisé aux valeurs par défaut");
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAddRule = () => {
    if (!newRuleKeyword.trim()) {
      alert("Le mot-clé est obligatoire");
      return;
    }

    const newRule: AutoRule = {
      id: `rule_${Date.now()}`,
      mode: newRuleMode,
      keyword: newRuleKeyword.trim(),
      jar: newRuleMode === "spending" ? newRuleJar : undefined,
      account: newRuleMode === "spending" ? newRuleAccount : undefined,
      destination: newRuleMode === "revenue" ? newRuleDestination : undefined,
      incomeType: newRuleMode === "revenue" ? newRuleIncomeType : undefined,
    };

    const updated = [...rules, newRule];
    setRules(updated);
    saveRules(updated);
    setNewRuleKeyword("");
    setNewRuleJar("NEC");
    setNewRuleAccount("");
    setNewRuleDestination("");
    setNewRuleIncomeType("");
    setShowRuleForm(false);
    setMessage("✅ Règle ajoutée");
    setTimeout(() => setMessage(null), 2000);
  };

  const handleDeleteRule = (id: string) => {
    if (!confirm("Supprimer cette règle ?")) return;
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    saveRules(updated);
    setMessage("✅ Règle supprimée");
    setTimeout(() => setMessage(null), 2000);
  };

  const handleAddAccount = () => {
    if (!newAccountName.trim()) {
      alert("Le nom du compte est obligatoire");
      return;
    }

    const newAccount: Account = {
      id: `account_${Date.now()}`,
      name: newAccountName.trim(),
      icon: newAccountIcon,
    };

    const updated = [...accounts, newAccount];
    setAccounts(updated);
    saveAccounts(updated);
    setAccountsApi(updated)
      .then(() => {
        setMessage("✅ Compte ajouté et synchronisé avec le Sheet");
        setTimeout(() => setMessage(null), 3000);
      })
      .catch((e) => {
        setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur"));
        setTimeout(() => setMessage(null), 5000);
      });
    window.dispatchEvent(new CustomEvent("spendingAccountsUpdated"));
    setNewAccountName("");
    setNewAccountIcon("💳");
    setShowAccountForm(false);
  };

  const handleEditAccount = (id: string) => {
    const account = accounts.find((a) => a.id === id);
    if (!account) return;
    setEditingAccountId(id);
    setEditingAccountName(account.name);
    setEditingAccountIcon(account.icon ?? "💳");
  };

  const handleCancelEditAccount = () => {
    setEditingAccountId(null);
    setEditingAccountName("");
    setEditingAccountIcon("💳");
  };

  const handleSaveEditAccount = () => {
    if (!editingAccountId) return;
    if (!editingAccountName.trim()) {
      alert("Le nom du compte est obligatoire");
      return;
    }

    const updated = accounts.map((a) =>
      a.id === editingAccountId
        ? { ...a, name: editingAccountName.trim(), icon: editingAccountIcon || a.icon }
        : a
    );
    setAccounts(updated);
    saveAccounts(updated);
    setAccountsApi(updated).catch((e) => setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur")));
    window.dispatchEvent(new CustomEvent("spendingAccountsUpdated"));
    setEditingAccountId(null);
    setMessage("✅ Compte mis à jour");
    setTimeout(() => setMessage(null), 2000);
  };

  const handleDeleteAccount = (id: string) => {
    if (!confirm("Supprimer ce compte ?")) return;
    const updated = accounts.filter((a) => a.id !== id);
    setAccounts(updated);
    saveAccounts(updated);
    setAccountsApi(updated).catch((e) => setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur")));
    window.dispatchEvent(new CustomEvent("spendingAccountsUpdated"));
    setMessage("✅ Compte supprimé");
    setTimeout(() => setMessage(null), 2000);
  };

  const handleAddRevenueAccount = () => {
    if (!newRevenueAccountName.trim()) {
      alert("Le nom du compte est obligatoire");
      return;
    }

    const newAccount: RevenueAccount = {
      id: `revaccount_${Date.now()}`,
      name: newRevenueAccountName.trim(),
      icon: newRevenueAccountIcon,
      type: newRevenueAccountType,
    };

    const updated = [...revenueAccounts, newAccount];
    setRevenueAccounts(updated);
    saveRevenueAccounts(updated);
    setRevenueAccountsApi(updated).catch((e) => setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur")));
    window.dispatchEvent(new CustomEvent("revenueAccountsUpdated"));
    setNewRevenueAccountName("");
    setNewRevenueAccountIcon("💰");
    setNewRevenueAccountType("");
    setShowRevenueAccountForm(false);
    setMessage("✅ Compte de revenu ajouté");
    setTimeout(() => setMessage(null), 2000);
  };

  const handleEditRevenueAccount = (id: string) => {
    const account = revenueAccounts.find((a) => a.id === id);
    if (!account) return;
    setEditingRevenueAccountId(id);
    setEditingRevenueAccountName(account.name);
    setEditingRevenueAccountIcon(account.icon ?? "💰");
  };

  const handleCancelEditRevenueAccount = () => {
    setEditingRevenueAccountId(null);
    setEditingRevenueAccountName("");
    setEditingRevenueAccountIcon("💰");
  };

  const handleSaveEditRevenueAccount = () => {
    if (!editingRevenueAccountId) return;
    if (!editingRevenueAccountName.trim()) {
      alert("Le nom du compte est obligatoire");
      return;
    }

    const updated = revenueAccounts.map((a) =>
      a.id === editingRevenueAccountId
        ? {
            ...a,
            name: editingRevenueAccountName.trim(),
            icon: editingRevenueAccountIcon || a.icon,
          }
        : a
    );
    setRevenueAccounts(updated);
    saveRevenueAccounts(updated);
    setRevenueAccountsApi(updated).catch((e) => setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur")));
    window.dispatchEvent(new CustomEvent("revenueAccountsUpdated"));
    setEditingRevenueAccountId(null);
    setMessage("✅ Compte de revenu mis à jour");
    setTimeout(() => setMessage(null), 2000);
  };

  const handleDeleteRevenueAccount = (id: string) => {
    if (!confirm("Supprimer ce compte de revenu ?")) return;
    const updated = revenueAccounts.filter((a) => a.id !== id);
    setRevenueAccounts(updated);
    saveRevenueAccounts(updated);
    setRevenueAccountsApi(updated).catch((e) => setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur")));
    window.dispatchEvent(new CustomEvent("revenueAccountsUpdated"));
    setMessage("✅ Compte de revenu supprimé");
    setTimeout(() => setMessage(null), 2000);
  };

  return (
    <main className="settings-view">
      <h2 className="settings-title">⚙️ Réglages</h2>

      {/* Message de feedback */}
      {message && (
        <div className={`settings-message ${message.includes("✅") ? "success" : "error"}`}>
          {message}
        </div>
      )}

      {/* Section: Répartition des jarres */}
      <section className="settings-section">
        <h3 className="settings-section-title">🏺 Répartition des jarres</h3>

        <div className="jars-grid">
          {jarSettings.map((jar) => (
            <div
              key={jar.key}
              className="jar-card"
              style={{ borderLeftColor: JAR_COLORS[jar.key] }}
            >
              <div className="jar-card-header">
                <span className="jar-card-emoji">{JAR_EMOJIS[jar.key]}</span>
                <span className="jar-card-label">
                  {jar.key} - {JAR_LABELS[jar.key]}
                </span>
              </div>
              <div className="jar-card-inputs">
                <div className="jar-input-row">
                  <span className="jar-input-label">%</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={jar.percent}
                    onChange={(e) => handlePercentChange(jar.key, e.target.value)}
                    className="jar-input"
                  />
                  <span className="jar-input-unit">%</span>
                </div>
                <div className="jar-input-row">
                  <span className="jar-input-label">€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={jar.initialBalance}
                    onChange={(e) => handleBalanceChange(jar.key, e.target.value)}
                    className="jar-input"
                  />
                  <span className="jar-input-unit">€</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className={`settings-total ${
            totalPercent === 100 ? "valid" : totalPercent > 100 ? "error" : "warning"
          }`}
        >
          Total : {totalPercent}% / 100%
        </div>

        <div className="settings-btn-group">
          <button
            type="button"
            className="settings-btn settings-btn-primary"
            onClick={handleSaveSettings}
            disabled={totalPercent !== 100}
          >
            💾 Sauvegarder
          </button>
          <button
            type="button"
            className="settings-btn settings-btn-secondary"
            onClick={handleResetSettings}
          >
            🔄 Réinitialiser
          </button>
        </div>
      </section>

      {/* Section: Devises (saisie dépense rapide) */}
      <section className="settings-section">
        <h3 className="settings-section-title">💱 Devises (dépense rapide)</h3>
        <p className="settings-currency-hint">
          Jusqu&apos;à 8 devises en favoris : elles apparaissent en tête du menu « Devise » dans Nouvelle dépense.
        </p>
        <div className="currency-favorites-chips">
          {currencyFavorites.map((code) => (
            <span key={code} className="currency-fav-chip">
              {code}
              <button
                type="button"
                className="currency-fav-remove"
                onClick={() => {
                  const next = currencyFavorites.filter((c) => c !== code);
                  setCurrencyFavorites(next);
                  saveCurrencyFavorites(next);
                  setMessage("✅ Favoris mis à jour");
                  setTimeout(() => setMessage(null), 2000);
                }}
                aria-label={`Retirer ${code}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {currencyFavorites.length < 8 && (
          <div className="form-group-inline settings-currency-add">
            <label className="form-label-inline">Ajouter</label>
            <select
              className="form-select-inline"
              value=""
              onChange={(e) => {
                const code = e.target.value;
                e.target.value = "";
                if (!code || currencyFavorites.includes(code)) return;
                const next = [...currencyFavorites, code];
                setCurrencyFavorites(next);
                saveCurrencyFavorites(next);
                setMessage("✅ Devise ajoutée aux favoris");
                setTimeout(() => setMessage(null), 2000);
              }}
            >
              <option value="">Choisir une devise…</option>
              {CURRENCIES.filter((c) => !currencyFavorites.includes(c.code)).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Section: Règles automatiques */}
      <section className="settings-section">
        <h3 className="settings-section-title">📋 Règles automatiques</h3>

        {rules.length > 0 && (
          <div className="rules-list">
            {rules.map((rule) => (
              <div key={rule.id} className={`rule-card ${rule.mode}`}>
                <div className="rule-card-content">
                  <p className="rule-keyword">"{rule.keyword}"</p>
                  <div className="rule-details">
                    {rule.mode === "spending" && (
                      <>
                        <span className="rule-badge">Jar: {rule.jar}</span>
                        <span className="rule-badge">Compte: {rule.account}</span>
                      </>
                    )}
                    {rule.mode === "revenue" && (
                      <>
                        <span className="rule-badge">Destination: {rule.destination}</span>
                        <span className="rule-badge">Type: {rule.incomeType}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="rule-delete-btn"
                  onClick={() => handleDeleteRule(rule.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {!showRuleForm ? (
          <button
            type="button"
            className="settings-btn settings-btn-add settings-btn-small"
            onClick={() => setShowRuleForm(true)}
          >
            ➕ Ajouter une règle
          </button>
        ) : (
          <div className="form-inline">
            <div className="form-group-inline">
              <label className="form-label-inline">Mode</label>
              <select
                className="form-select-inline"
                value={newRuleMode}
                onChange={(e) => setNewRuleMode(e.target.value as "spending" | "revenue")}
              >
                <option value="spending">Dépense</option>
                <option value="revenue">Revenu</option>
              </select>
            </div>

            <div className="form-group-inline">
              <label className="form-label-inline">Mot-clé</label>
              <input
                type="text"
                className="form-input-inline"
                placeholder="ex: Restaurant"
                value={newRuleKeyword}
                onChange={(e) => setNewRuleKeyword(e.target.value)}
              />
            </div>

            {newRuleMode === "spending" && (
              <>
                <div className="form-group-inline">
                  <label className="form-label-inline">Jarre</label>
                  <select
                    className="form-select-inline"
                    value={newRuleJar}
                    onChange={(e) => setNewRuleJar(e.target.value as JarKey)}
                  >
                    {Object.keys(JAR_LABELS).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group-inline">
                  <label className="form-label-inline">Compte</label>
                  <input
                    type="text"
                    className="form-input-inline"
                    placeholder="ex: Card"
                    value={newRuleAccount}
                    onChange={(e) => setNewRuleAccount(e.target.value)}
                  />
                </div>
              </>
            )}

            {newRuleMode === "revenue" && (
              <>
                <div className="form-group-inline">
                  <label className="form-label-inline">Destination</label>
                  <input
                    type="text"
                    className="form-input-inline"
                    placeholder="ex: Bank"
                    value={newRuleDestination}
                    onChange={(e) => setNewRuleDestination(e.target.value)}
                  />
                </div>
                <div className="form-group-inline">
                  <label className="form-label-inline">Type</label>
                  <input
                    type="text"
                    className="form-input-inline"
                    placeholder="ex: Salary"
                    value={newRuleIncomeType}
                    onChange={(e) => setNewRuleIncomeType(e.target.value)}
                  />
                </div>
              </>
            )}

            <button
              type="button"
              className="settings-btn settings-btn-add settings-btn-small"
              onClick={handleAddRule}
            >
              ✓ Ajouter
            </button>
            <button
              type="button"
              className="settings-btn settings-btn-secondary settings-btn-small"
              onClick={() => setShowRuleForm(false)}
            >
              ✕ Annuler
            </button>
          </div>
        )}
      </section>

      {/* Section: Comptes de dépenses */}
      <section className="settings-section">
        <h3 className="settings-section-title">💳 Comptes de dépenses</h3>
        {accountsLoading && (
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px" }}>Chargement…</p>
        )}

        {accounts.length > 0 && (
          <div className="accounts-grid">
            {accounts.map((acc) => (
              <div key={acc.id} className="account-card">
                {editingAccountId === acc.id ? (
                  <>
                    <div className="account-edit-inline">
                      <input
                        type="text"
                        className="form-emoji-input"
                        value={editingAccountIcon}
                        onChange={(e) => setEditingAccountIcon(e.target.value)}
                      />
                      <input
                        type="text"
                        className="form-input-inline"
                        value={editingAccountName}
                        onChange={(e) => setEditingAccountName(e.target.value)}
                      />
                    </div>
                    <div className="account-edit-actions">
                      <button
                        type="button"
                        className="settings-btn settings-btn-add settings-btn-small"
                        onClick={handleSaveEditAccount}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="settings-btn settings-btn-secondary settings-btn-small"
                        onClick={handleCancelEditAccount}
                      >
                        ✕
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="account-icon">{acc.icon}</span>
                    <span className="account-name">{acc.name}</span>
                    <button
                      type="button"
                      className="account-edit-btn"
                      onClick={() => handleEditAccount(acc.id)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="account-delete-btn"
                      onClick={() => handleDeleteAccount(acc.id)}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {!showAccountForm ? (
          <button
            type="button"
            className="settings-btn settings-btn-add settings-btn-small"
            onClick={() => setShowAccountForm(true)}
          >
            ➕ Ajouter un compte
          </button>
        ) : (
          <div className="form-inline">
            <div className="form-group-inline" style={{ flexBasis: "80px" }}>
              <label className="form-label-inline">Icône</label>
              <input
                type="text"
                className="form-emoji-input"
                value={newAccountIcon}
                onChange={(e) => setNewAccountIcon(e.target.value)}
              />
            </div>
            <div className="form-group-inline">
              <label className="form-label-inline">Nom</label>
              <input
                type="text"
                className="form-input-inline"
                placeholder="ex: Carte Bleue"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="settings-btn settings-btn-add settings-btn-small"
              onClick={handleAddAccount}
            >
              ✓ Ajouter
            </button>
            <button
              type="button"
              className="settings-btn settings-btn-secondary settings-btn-small"
              onClick={() => setShowAccountForm(false)}
            >
              ✕ Annuler
            </button>
          </div>
        )}
      </section>

      {/* Section: Comptes de revenus */}
      <section className="settings-section">
        <h3 className="settings-section-title">💰 Comptes de revenus</h3>

        {revenueAccounts.length > 0 && (
          <div className="accounts-grid">
            {revenueAccounts.map((acc) => (
              <div key={acc.id} className="account-card">
                {editingRevenueAccountId === acc.id ? (
                  <>
                    <div className="account-edit-inline">
                      <input
                        type="text"
                        className="form-emoji-input"
                        value={editingRevenueAccountIcon}
                        onChange={(e) => setEditingRevenueAccountIcon(e.target.value)}
                      />
                      <input
                        type="text"
                        className="form-input-inline"
                        value={editingRevenueAccountName}
                        onChange={(e) => setEditingRevenueAccountName(e.target.value)}
                      />
                    </div>
                    <div className="account-edit-actions">
                      <button
                        type="button"
                        className="settings-btn settings-btn-add settings-btn-small"
                        onClick={handleSaveEditRevenueAccount}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="settings-btn settings-btn-secondary settings-btn-small"
                        onClick={handleCancelEditRevenueAccount}
                      >
                        ✕
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="account-icon">{acc.icon}</span>
                    <span className="account-name">{acc.name}</span>
                    <button
                      type="button"
                      className="account-edit-btn"
                      onClick={() => handleEditRevenueAccount(acc.id)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="account-delete-btn"
                      onClick={() => handleDeleteRevenueAccount(acc.id)}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {!showRevenueAccountForm ? (
          <button
            type="button"
            className="settings-btn settings-btn-add settings-btn-small"
            onClick={() => setShowRevenueAccountForm(true)}
          >
            ➕ Ajouter un compte
          </button>
        ) : (
          <div className="form-inline">
            <div className="form-group-inline" style={{ flexBasis: "80px" }}>
              <label className="form-label-inline">Icône</label>
              <input
                type="text"
                className="form-emoji-input"
                value={newRevenueAccountIcon}
                onChange={(e) => setNewRevenueAccountIcon(e.target.value)}
              />
            </div>
            <div className="form-group-inline">
              <label className="form-label-inline">Nom</label>
              <input
                type="text"
                className="form-input-inline"
                placeholder="ex: Binance"
                value={newRevenueAccountName}
                onChange={(e) => setNewRevenueAccountName(e.target.value)}
              />
            </div>
            <div className="form-group-inline">
              <label className="form-label-inline">Type</label>
              <input
                type="text"
                className="form-input-inline"
                placeholder="ex: Crypto"
                value={newRevenueAccountType}
                onChange={(e) => setNewRevenueAccountType(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="settings-btn settings-btn-add settings-btn-small"
              onClick={handleAddRevenueAccount}
            >
              ✓ Ajouter
            </button>
            <button
              type="button"
              className="settings-btn settings-btn-secondary settings-btn-small"
              onClick={() => setShowRevenueAccountForm(false)}
            >
              ✕ Annuler
            </button>
          </div>
        )}
      </section>
    </main>
  );
};

export default SettingsView;
