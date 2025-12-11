// src/components/SettingsView.tsx
import React, { useState, useEffect } from "react";
import { JarKey } from "../types";
import { loadAutoRules, AutoRule } from "../autoRules";

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
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Nouvelle règle
  const [newRuleMode, setNewRuleMode] = useState<"spending" | "revenue">("spending");
  const [newRuleKeyword, setNewRuleKeyword] = useState("");
  const [newRuleJar, setNewRuleJar] = useState<JarKey>("NEC");
  const [newRuleAccount, setNewRuleAccount] = useState("");
  const [newRuleDestination, setNewRuleDestination] = useState("");
  const [newRuleIncomeType, setNewRuleIncomeType] = useState("");

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

  return (
    <main className="settings-page">
      <h2 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "24px" }}>
        Configuration
      </h2>

      {message && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "12px",
            background: message.includes("⚠️")
              ? "rgba(255, 149, 0, 0.1)"
              : "rgba(52, 199, 89, 0.1)",
            border: message.includes("⚠️")
              ? "1px solid rgba(255, 149, 0, 0.3)"
              : "1px solid rgba(52, 199, 89, 0.3)",
            color: message.includes("⚠️") ? "#FF9500" : "#34C759",
            fontWeight: 600,
            marginBottom: "20px",
          }}
        >
          {message}
        </div>
      )}

      {/* Section Paramètres des Jars */}
      <section className="settings-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3>Paramètres des Jars</h3>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: "12px",
              fontSize: "13px",
              fontWeight: 600,
              background: totalPercent === 100 ? "rgba(52, 199, 89, 0.15)" : "rgba(239, 68, 68, 0.15)",
              color: totalPercent === 100 ? "#34C759" : "#ef4444",
            }}
          >
            Total: {totalPercent.toFixed(1)}%
          </div>
        </div>

        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "20px" }}>
          Chaque revenu est automatiquement réparti selon les pourcentages définis ci-dessous.
          Le total doit égaler 100%.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {jarSettings.map((jar) => (
            <div
              key={jar.key}
              style={{
                borderRadius: "16px",
                padding: "16px",
                background: `linear-gradient(135deg, ${JAR_COLORS[jar.key]}15 0%, ${JAR_COLORS[jar.key]}08 100%)`,
                border: "1px solid var(--border-color)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: JAR_COLORS[jar.key],
                    boxShadow: `0 2px 8px ${JAR_COLORS[jar.key]}40`,
                  }}
                />
                <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>
                  {jar.key}
                </span>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-main)" }}>
                  {JAR_LABELS[jar.key]}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>
                    Pourcentage
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="number"
                      step="0.1"
                      value={jar.percent}
                      onChange={(e) => handlePercentChange(jar.key, e.target.value)}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-card)",
                        fontSize: "15px",
                        fontWeight: 600,
                      }}
                    />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-muted)" }}>%</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>
                    Solde initial
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="number"
                      step="0.01"
                      value={jar.initialBalance}
                      onChange={(e) => handleBalanceChange(jar.key, e.target.value)}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-card)",
                        fontSize: "15px",
                        fontWeight: 600,
                      }}
                    />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-muted)" }}>€</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button
            onClick={handleSaveSettings}
            style={{
              flex: 1,
              padding: "14px",
              borderRadius: "14px",
              border: "none",
              background: "linear-gradient(135deg, #007AFF 0%, #0051d5 100%)",
              color: "white",
              fontSize: "15px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 6px 16px rgba(0, 122, 255, 0.3)",
            }}
          >
            Sauvegarder
          </button>
          <button
            onClick={handleResetSettings}
            style={{
              padding: "14px 20px",
              borderRadius: "14px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-main)",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Réinitialiser
          </button>
        </div>
      </section>

      {/* Section Règles Automatiques */}
      <section className="settings-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3>Règles Automatiques</h3>
          <button
            onClick={() => setShowRuleForm(!showRuleForm)}
            style={{
              padding: "8px 16px",
              borderRadius: "12px",
              border: "none",
              background: showRuleForm ? "var(--bg-body)" : "linear-gradient(135deg, #AF52DE 0%, #c026d3 100%)",
              color: showRuleForm ? "var(--text-main)" : "white",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {showRuleForm ? "Annuler" : "+ Ajouter"}
          </button>
        </div>

        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "20px" }}>
          Définissez des mots-clés pour catégoriser automatiquement vos dépenses et revenus.
        </p>

        {showRuleForm && (
          <div
            style={{
              padding: "16px",
              borderRadius: "14px",
              background: "var(--bg-body)",
              border: "1px solid var(--border-color)",
              marginBottom: "20px",
            }}
          >
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px", background: "var(--bg-card)", padding: "4px", borderRadius: "12px" }}>
              <button
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