// src/components/SettingsView.tsx
import React, { useState, useEffect } from "react";
import { JarKey, Account, RevenueAccount } from "../types";
import { loadAutoRules, AutoRule } from "../autoRules";
import { loadAccounts, saveAccounts } from "../accountsUtils";
import { loadRevenueAccounts, saveRevenueAccounts } from "../revenueAccountsUtils";
import { loadTags } from "../tagsUtils";

const JAR_LABELS: Record<JarKey, string> = {
  NEC: "Nécessités",
  FFA: "Liberté Financière",
  LTSS: "Épargne Long Terme",
  PLAY: "Fun / Play",
  EDUC: "Éducation",
  GIFT: "Don / Gift",
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
      // Valeurs par défaut
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
  const [accounts, setAccounts] = useState<Account[]>(loadAccounts());
  const [revenueAccounts, setRevenueAccounts] = useState<RevenueAccount[]>(loadRevenueAccounts());
  const [tags] = useState(loadTags());
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
    };

    if (newRuleMode === "spending") {
      newRule.jar = newRuleJar;
      if (newRuleAccount.trim()) newRule.account = newRuleAccount.trim();
    } else {
      if (newRuleDestination.trim()) newRule.destination = newRuleDestination.trim();
      if (newRuleIncomeType.trim()) newRule.incomeType = newRuleIncomeType.trim();
    }

    const updated = [...rules, newRule];
    setRules(updated);
    saveRules(updated);

    // Reset form
    setNewRuleKeyword("");
    setNewRuleAccount("");
    setNewRuleDestination("");
    setNewRuleIncomeType("");
    setShowRuleForm(false);
    setMessage("✅ Règle ajoutée");
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteRule = (id: string) => {
    if (!confirm("Supprimer cette règle ?")) return;
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    saveRules(updated);
    setMessage("✅ Règle supprimée");
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAddAccount = () => {
    if (!newAccountName.trim()) {
      alert("Le nom du compte est obligatoire");
      return;
    }

    const newAccount: Account = {
      id: `acc_${Date.now()}`,
      name: newAccountName.trim(),
      icon: newAccountIcon,
    };

    const updated = [...accounts, newAccount];
    setAccounts(updated);
    saveAccounts(updated);

    // Reset form
    setNewAccountName("");
    setNewAccountIcon("💳");
    setShowAccountForm(false);
    setMessage("✅ Compte ajouté");
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteAccount = (id: string) => {
    if (!confirm("Supprimer ce compte ?")) return;
    const updated = accounts.filter((a) => a.id !== id);
    setAccounts(updated);
    saveAccounts(updated);
    setMessage("✅ Compte supprimé");
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAddRevenueAccount = () => {
    if (!newRevenueAccountName.trim()) {
      alert("Le nom du compte de revenu est obligatoire");
      return;
    }

    const newRevenueAccount: RevenueAccount = {
      id: `revacc_${Date.now()}`,
      name: newRevenueAccountName.trim(),
      icon: newRevenueAccountIcon,
      type: newRevenueAccountType.trim() || undefined,
    };

    const updated = [...revenueAccounts, newRevenueAccount];
    setRevenueAccounts(updated);
    saveRevenueAccounts(updated);

    // Reset form
    setNewRevenueAccountName("");
    setNewRevenueAccountIcon("💰");
    setNewRevenueAccountType("");
    setShowRevenueAccountForm(false);
    setMessage("✅ Source de revenu ajoutée");
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteRevenueAccount = (id: string) => {
    if (!confirm("Supprimer cette source de revenu ?")) return;
    const updated = revenueAccounts.filter((a) => a.id !== id);
    setRevenueAccounts(updated);
    saveRevenueAccounts(updated);
    setMessage("✅ Source de revenu supprimée");
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <main className="page" style={{ maxWidth: "900px", margin: "0 auto" }}>
      <h2 style={{ marginBottom: "30px" }}>⚙️ Réglages</h2>

      {message && (
        <div
          style={{
            padding: "14px 20px",
            borderRadius: "12px",
            marginBottom: "20px",
            background: message.includes("✅")
              ? "rgba(52, 199, 89, 0.15)"
              : "rgba(255, 59, 48, 0.15)",
            border: `1px solid ${message.includes("✅") ? "#34C759" : "#FF3B30"}`,
            color: message.includes("✅") ? "#34C759" : "#FF3B30",
            fontSize: "14px",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {message}
        </div>
      )}

      {/* ========== RÉPARTITION JARRES ========== */}
      <section className="settings-section" style={{ marginBottom: "30px" }}>
        <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: 700 }}>
          🏺 Répartition des jarres
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {jarSettings.map((jar) => (
            <div
              key={jar.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px",
                borderRadius: "12px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-card)",
              }}
            >
              <div
                style={{
                  width: "8px",
                  height: "40px",
                  borderRadius: "4px",
                  background: JAR_COLORS[jar.key],
                }}
              ></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)" }}>
                  {jar.key} - {JAR_LABELS[jar.key]}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="number"
                  step="1"
                  value={jar.percent}
                  onChange={(e) => handlePercentChange(jar.key, e.target.value)}
                  style={{
                    width: "70px",
                    padding: "8px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-body)",
                    textAlign: "right",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                />
                <span style={{ fontSize: "14px", color: "var(--text-muted)", width: "20px" }}>
                  %
                </span>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: "16px",
            padding: "12px 16px",
            borderRadius: "12px",
            background:
              totalPercent === 100
                ? "rgba(52, 199, 89, 0.1)"
                : "rgba(255, 59, 48, 0.1)",
            border: `1px solid ${totalPercent === 100 ? "#34C759" : "#FF3B30"}`,
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: 600, color: totalPercent === 100 ? "#34C759" : "#FF3B30" }}>
            Total : {totalPercent.toFixed(0)}% / 100%
          </div>
          {totalPercent !== 100 && (
            <div style={{ fontSize: "11px", color: "#FF3B30", marginTop: "4px" }}>
              {totalPercent < 100
                ? `Il reste ${(100 - totalPercent).toFixed(0)}% à allouer`
                : `Vous avez ${(totalPercent - 100).toFixed(0)}% en trop`}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
          <button
            onClick={handleSaveSettings}
            disabled={totalPercent !== 100}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "12px",
              border: "none",
              background: totalPercent === 100 ? "linear-gradient(135deg, #007AFF 0%, #0051d5 100%)" : "var(--border-color)",
              color: "white",
              fontSize: "14px",
              fontWeight: 700,
              cursor: totalPercent === 100 ? "pointer" : "not-allowed",
              opacity: totalPercent === 100 ? 1 : 0.5,
            }}
          >
            💾 Sauvegarder
          </button>
          <button
            onClick={handleResetSettings}
            style={{
              padding: "12px 20px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-body)",
              color: "var(--text-main)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🔄 Réinitialiser
          </button>
        </div>
      </section>

      {/* ========== COMPTES DE PAIEMENT ========== */}
      <section className="settings-section" style={{ marginBottom: "30px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>💳 Comptes de paiement</h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
              Gérez vos comptes pour les dépenses (Cash, Revolut, etc.)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAccountForm(!showAccountForm)}
            style={{
              padding: "10px 20px",
              borderRadius: "12px",
              border: "none",
              background: showAccountForm ? "var(--bg-body)" : "linear-gradient(135deg, #007AFF 0%, #0051d5 100%)",
              color: showAccountForm ? "var(--text-main)" : "white",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: showAccountForm ? "none" : "0 4px 10px rgba(0, 122, 255, 0.3)",
              whiteSpace: "nowrap",
            }}
          >
            {showAccountForm ? "Annuler" : "+ Ajouter un compte"}
          </button>
        </div>

        {showAccountForm && (
          <div style={{ marginBottom: "20px", padding: "20px", borderRadius: "12px", background: "var(--bg-body)", border: "1px solid var(--border-color)" }}>
            <h4 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700 }}>Nouveau compte</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Nom du compte *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Revolut, Cash, Binance..."
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "15px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Icône (emoji)
                </label>
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                  {["💳", "💵", "🏦", "💰", "🪙", "📱", "🔐", "💎"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewAccountIcon(emoji)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: newAccountIcon === emoji ? "2px solid #007AFF" : "1px solid var(--border-color)",
                        background: newAccountIcon === emoji ? "rgba(0, 122, 255, 0.1)" : "var(--bg-card)",
                        fontSize: "24px",
                        cursor: "pointer",
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Ou entrez un emoji personnalisé"
                  value={newAccountIcon}
                  onChange={(e) => setNewAccountIcon(e.target.value)}
                  style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "15px" }}
                />
              </div>
              <button
                onClick={handleAddAccount}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "12px",
                  border: "none",
                  background: "linear-gradient(135deg, #007AFF 0%, #0051d5 100%)",
                  color: "white",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: "8px",
                }}
              >
                Ajouter le compte
              </button>
            </div>
          </div>
        )}

        {accounts.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "20px" }}>
            Aucun compte défini
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
            {accounts.map((acc) => (
              <div
                key={acc.id}
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-card)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <span style={{ fontSize: "36px" }}>{acc.icon || "💳"}</span>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)", textAlign: "center" }}>
                  {acc.name}
                </span>
                <button
                  onClick={() => handleDeleteAccount(acc.id)}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "8px",
                    border: "none",
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "#ef4444",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ========== SOURCES DE REVENUS ========== */}
      <section className="settings-section" style={{ marginBottom: "30px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>💰 Sources de revenus</h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
              Gérez vos sources de revenus (Binance, Upwork, etc.)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowRevenueAccountForm(!showRevenueAccountForm)}
            style={{
              padding: "10px 20px",
              borderRadius: "12px",
              border: "none",
              background: showRevenueAccountForm ? "var(--bg-body)" : "linear-gradient(135deg, #FFD60A 0%, #FFCC00 100%)",
              color: showRevenueAccountForm ? "var(--text-main)" : "#000",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: showRevenueAccountForm ? "none" : "0 4px 10px rgba(255, 214, 10, 0.3)",
              whiteSpace: "nowrap",
            }}
          >
            {showRevenueAccountForm ? "Annuler" : "+ Ajouter une source"}
          </button>
        </div>

        {showRevenueAccountForm && (
          <div style={{ marginBottom: "20px", padding: "20px", borderRadius: "12px", background: "var(--bg-body)", border: "1px solid var(--border-color)" }}>
            <h4 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700 }}>Nouvelle source de revenu</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Nom de la source *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Binance, Upwork, Dtsmoney..."
                  value={newRevenueAccountName}
                  onChange={(e) => setNewRevenueAccountName(e.target.value)}
                  style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "15px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Type (optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Crypto, Freelance, Passive Income..."
                  value={newRevenueAccountType}
                  onChange={(e) => setNewRevenueAccountType(e.target.value)}
                  style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "15px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Icône (emoji)
                </label>
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                  {["💰", "🪙", "💼", "📊", "💸", "🎯", "📈", "💎"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewRevenueAccountIcon(emoji)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: newRevenueAccountIcon === emoji ? "2px solid #FFD60A" : "1px solid var(--border-color)",
                        background: newRevenueAccountIcon === emoji ? "rgba(255, 214, 10, 0.1)" : "var(--bg-card)",
                        fontSize: "24px",
                        cursor: "pointer",
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Ou entrez un emoji personnalisé"
                  value={newRevenueAccountIcon}
                  onChange={(e) => setNewRevenueAccountIcon(e.target.value)}
                  style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "15px" }}
                />
              </div>
              <button
                onClick={handleAddRevenueAccount}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "12px",
                  border: "none",
                  background: "linear-gradient(135deg, #FFD60A 0%, #FFCC00 100%)",
                  color: "#000",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: "8px",
                }}
              >
                Ajouter la source
              </button>
            </div>
          </div>
        )}

        {revenueAccounts.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "20px" }}>
            Aucune source de revenu définie
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
            {revenueAccounts.map((acc) => (
              <div
                key={acc.id}
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-card)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <span style={{ fontSize: "36px" }}>{acc.icon || "💰"}</span>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)", textAlign: "center" }}>
                  {acc.name}
                </span>
                {acc.type && (
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
                    {acc.type}
                  </span>
                )}
                <button
                  onClick={() => handleDeleteRevenueAccount(acc.id)}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "8px",
                    border: "none",
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "#ef4444",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ========== TAGS ========== */}
      <section className="settings-section" style={{ marginBottom: "30px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>🏷️ Tags</h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
              Gérez vos tags pour catégoriser vos transactions
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              alert("Fonctionnalité à venir : Ajouter un tag personnalisé\n\nPhase 2 :\n• Ajouter des tags custom\n• Modifier emoji et couleur\n• Synchroniser avec Google Sheets");
            }}
            style={{
              padding: "10px 20px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #FFD60A 0%, #FFCC00 100%)",
              color: "#000",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(255, 214, 10, 0.3)",
              whiteSpace: "nowrap",
            }}
          >
            + Ajouter un tag
          </button>
        </div>

        {/* Liste des tags existants */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
          {tags.map((tag) => (
            <div
              key={tag.id}
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-card)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "28px" }}>{tag.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)" }}>
                    {tag.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                    {tag.id}
                  </div>
                </div>
              </div>

              {/* Couleur du tag */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "6px",
                    background: tag.color,
                    border: "2px solid white",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  }}
                ></div>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                  {tag.color}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Info */}
        <div
          style={{
            marginTop: "16px",
            padding: "12px 16px",
            borderRadius: "12px",
            background: "rgba(255, 214, 10, 0.1)",
            border: "1px solid rgba(255, 214, 10, 0.3)",
          }}
        >
          <div style={{ fontSize: "13px", color: "#B8860B", fontWeight: 600 }}>💡 Astuce</div>
          <div style={{ fontSize: "12px", color: "#8B7500", marginTop: "4px" }}>
            Utilisez les tags pour catégoriser vos dépenses et revenus. Vous pourrez ensuite
            filtrer et analyser vos finances par tag.
          </div>
        </div>

        {/* Note Phase 2 */}
        <div
          style={{
            marginTop: "12px",
            padding: "12px 16px",
            borderRadius: "12px",
            background: "rgba(0, 122, 255, 0.1)",
            border: "1px solid rgba(0, 122, 255, 0.3)",
          }}
        >
          <div style={{ fontSize: "12px", color: "#007AFF", fontWeight: 600 }}>🚀 Prochainement</div>
          <div style={{ fontSize: "11px", color: "#0051D5", marginTop: "4px" }}>
            • Ajouter des tags personnalisés
            <br />
            • Modifier les emojis et couleurs
            <br />• Synchroniser avec Google Sheets
          </div>
        </div>
      </section>

      {/* ========== RÈGLES AUTO ========== */}
      <section className="settings-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>⚡ Règles automatiques</h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
              Automatisez l'assignation des jarres et comptes selon des mots-clés
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowRuleForm(!showRuleForm)}
            style={{
              padding: "10px 20px",
              borderRadius: "12px",
              border: "none",
              background: showRuleForm ? "var(--bg-body)" : "linear-gradient(135deg, #AF52DE 0%, #c026d3 100%)",
              color: showRuleForm ? "var(--text-main)" : "white",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: showRuleForm ? "none" : "0 4px 10px rgba(175, 82, 222, 0.3)",
              whiteSpace: "nowrap",
            }}
          >
            {showRuleForm ? "Annuler" : "+ Créer une règle"}
          </button>
        </div>

        {showRuleForm && (
          <div style={{ marginBottom: "20px", padding: "20px", borderRadius: "12px", background: "var(--bg-body)", border: "1px solid var(--border-color)" }}>
            <h4 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700 }}>Nouvelle règle</h4>

            {/* Toggle Dépense/Revenu */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px", padding: "4px", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
              <button
                type="button"
                onClick={() => setNewRuleMode("spending")}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "8px",
                  border: "none",
                  background: newRuleMode === "spending" ? "var(--bg-body)" : "transparent",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-main)",
                  cursor: "pointer",
                  boxShadow: newRuleMode === "spending" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                }}
              >
                Dépense
              </button>
              <button
                type="button"
                onClick={() => setNewRuleMode("revenue")}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "8px",
                  border: "none",
                  background: newRuleMode === "revenue" ? "var(--bg-body)" : "transparent",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-main)",
                  cursor: "pointer",
                  boxShadow: newRuleMode === "revenue" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                }}
              >
                Revenu
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Mot-clé à détecter *
                </label>
                <input
                  type="text"
                  placeholder="Ex: uber, carrefour, netflix..."
                  value={newRuleKeyword}
                  onChange={(e) => setNewRuleKeyword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-card)",
                    fontSize: "15px",
                  }}
                />
              </div>

              {newRuleMode === "spending" ? (
                <>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                      Jar à assigner *
                    </label>
                    <select
                      value={newRuleJar}
                      onChange={(e) => setNewRuleJar(e.target.value as JarKey)}
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-card)",
                        fontSize: "15px",
                      }}
                    >
                      {(Object.keys(JAR_LABELS) as JarKey[]).map((key) => (
                        <option key={key} value={key}>
                          {key} - {JAR_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                      Compte (optionnel)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Cash, Binance..."
                      value={newRuleAccount}
                      onChange={(e) => setNewRuleAccount(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-card)",
                        fontSize: "15px",
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                      Destination (optionnel)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Binance, Dtsmoney..."
                      value={newRuleDestination}
                      onChange={(e) => setNewRuleDestination(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-card)",
                        fontSize: "15px",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                      Type de revenu (optionnel)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Passive income, Trading..."
                      value={newRuleIncomeType}
                      onChange={(e) => setNewRuleIncomeType(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-card)",
                        fontSize: "15px",
                      }}
                    />
                  </div>
                </>
              )}

              <button
                onClick={handleAddRule}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "12px",
                  border: "none",
                  background: "linear-gradient(135deg, #AF52DE 0%, #c026d3 100%)",
                  color: "white",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: "8px",
                }}
              >
                Créer la règle
              </button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "20px" }}>
            Aucune règle définie pour le moment
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-body)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: rule.mode === "spending" ? "rgba(239, 68, 68, 0.15)" : "rgba(52, 199, 89, 0.15)",
                        color: rule.mode === "spending" ? "#ef4444" : "#34C759",
                      }}
                    >
                      {rule.mode === "spending" ? "Dépense" : "Revenu"}
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)" }}>
                      "{rule.keyword}"
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {rule.jar && `→ Jar: ${rule.jar}`}
                    {rule.account && ` • Compte: ${rule.account}`}
                    {rule.destination && `→ Destination: ${rule.destination}`}
                    {rule.incomeType && ` • Type: ${rule.incomeType}`}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "none",
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "#ef4444",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};

export default SettingsView;
