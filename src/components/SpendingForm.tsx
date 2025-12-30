import React, { useState, useEffect } from "react";
import { appendSpending } from "../api";
import { JarKey, SpendingRow } from "../types";
import { loadAutoRules, AutoRule } from "../autoRules";
import { loadAccounts } from "../accountsUtils";
// import { UniversalImporter } from "./UniversalImporter";
import UniversalImporter from "./UniversalImporter";
import { TagSelector } from "./TagSelector";
import { tagsToString, tagsFromString } from "../tagsUtils";

interface SpendingFormProps {
  prefill?: any | null;
  onClearPrefill?: () => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const SpendingForm: React.FC<SpendingFormProps> = ({
  prefill,
  onClearPrefill,
}) => {
  const [date, setDate] = useState<string>(todayISO());
  const [description, setDescription] = useState<string>("");
  const [account, setAccount] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [jar, setJar] = useState<JarKey>("NEC");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [appliedRule, setAppliedRule] = useState<AutoRule | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [accounts] = useState(loadAccounts());

  // Auto-dismiss message
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // === Gestion de l'import en masse ===
  const handleBulkImport = async (transactions: any[]) => {
    let successCount = 0;
    let errorCount = 0;
    
    setLoading(true);
    setMessage("Import en cours...");

    for (const t of transactions) {
      try {
        await appendSpending({
          date: t.date,
          jar: t.suggestedJar || "NEC",
          account: t.suggestedAccount || "Imported",
          amount: t.amount,
          description: t.description,
        });
        successCount++;
      } catch (err) {
        console.error("Erreur import transaction:", err);
        errorCount++;
      }
    }

    setLoading(false);
    setMessage(`✅ ${successCount} importées, ${errorCount} erreurs`);
    setTimeout(() => setMessage(null), 3000);
  };

  // === Pré-remplissage depuis l'historique ===
  useEffect(() => {
    if (!prefill) return;

    if (prefill.date) setDate(prefill.date);
    if (prefill.jar) setJar(prefill.jar);
    if (prefill.account) setAccount(prefill.account);
    if (prefill.amount != null) setAmount(String(prefill.amount));
    if (prefill.description) setDescription(prefill.description);
    
    // Parser les tags depuis Google Sheets
    if (prefill.tags) {
      const tagIds = tagsFromString(prefill.tags);
      setSelectedTags(tagIds);
    } else {
      setSelectedTags([]);
    }

    setAppliedRule(null);
    onClearPrefill?.();
  }, [prefill, onClearPrefill]);

  // === Application automatique des règles sur la description ===
  const handleDescriptionChange = (value: string) => {
    setDescription(value);

    const text = value.trim().toLowerCase();
    if (!text) {
      setAppliedRule(null);
      return;
    }

    const rules = loadAutoRules().filter((r) => r.mode === "spending");
    const rule = rules.find((r) =>
      text.includes(r.keyword.toLowerCase())
    );

    if (!rule) {
      setAppliedRule(null);
      return;
    }

    setAppliedRule(rule);

    if (rule.jar) {
      setJar(rule.jar as JarKey);
    }
    if (rule.account) {
      setAccount(rule.account);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const numAmount = parseFloat(amount.replace(",", ".") || "0");
    if (!date || !description || !account || !numAmount) {
      setMessage("Merci de remplir tous les champs obligatoires.");
      return;
    }

    try {
      setLoading(true);
      
      // Convertir les tags en string pour Google Sheets
      const tagsString = selectedTags.length > 0 ? tagsToString(selectedTags) : undefined;
      
      await appendSpending({
        date,
        jar,
        account,
        amount: numAmount,
        description,
        tags: tagsString,  // Envoi vers Google Sheets
      });
      
      setMessage("Dépense enregistrée ✅");

      // Reset
      setAmount("");
      setDescription("");
      setSelectedTags([]);
      setAppliedRule(null);
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0 }}>Nouvelle dépense</h2>
        <button
          type="button"
          onClick={() => setShowImporter(!showImporter)}
          style={{
            padding: "10px 20px",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
            background: showImporter ? "var(--bg-body)" : "linear-gradient(135deg, #34C759 0%, #28a745 100%)",
            color: showImporter ? "var(--text-main)" : "white",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            boxShadow: showImporter ? "none" : "0 4px 10px rgba(52, 199, 89, 0.3)",
          }}
        >
          {showImporter ? "Masquer l'import" : "📄 Importer des transactions"}
        </button>
      </div>

      {showImporter && (
        <div style={{ marginBottom: "20px" }}>
          <UniversalImporter onImport={handleBulkImport} />
        </div>
      )}

      {!showImporter && (
      <form 
        className="card form" 
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          padding: "16px",
        }}
      >
        {/* Date avec "Aujourd'hui" */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          padding: "10px 14px",
          borderRadius: "12px",
          background: "var(--bg-body)",
          border: "1px solid var(--border-color)",
          gap: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
            <span style={{ fontSize: "22px" }}>📅</span>
            <span style={{ fontSize: "15px", fontWeight: "600" }}>
              {date === todayISO() ? "Aujourd'hui" : new Date(date).toLocaleDateString('fr-FR')}
            </span>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              fontSize: "13px",
              width: "auto",
            }}
          />
        </div>

        {/* Description (autofocus) */}
        <div>
          <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
            📝 Description
          </label>
          <input
            type="text"
            placeholder="Ex: Courses, Restaurant..."
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              fontSize: "15px",
            }}
          />
        </div>

        {/* Compte (icônes cliquables) */}
        <div>
          <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
            💳 Compte
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(85px, 1fr))", gap: "8px" }}>
            {accounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => setAccount(acc.name)}
                style={{
                  padding: "10px 6px",
                  borderRadius: "12px",
                  border: account === acc.name ? "2px solid #007AFF" : "1px solid var(--border-color)",
                  background: account === acc.name ? "rgba(0, 122, 255, 0.1)" : "var(--bg-card)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "26px" }}>{acc.icon || "💳"}</span>
                <span style={{ fontSize: "11px", fontWeight: "600", color: account === acc.name ? "#007AFF" : "var(--text-main)" }}>
                  {acc.name}
                </span>
              </button>
            ))}
          </div>
          {!account && <p style={{ fontSize: "11px", color: "#FF3B30", marginTop: "4px" }}>⚠️ Sélectionnez un compte</p>}
        </div>

        {/* Montant + Jarre */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "10px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
              💶 Montant
            </label>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "10px",
                border: "1px solid var(--border-color)",
                fontSize: "15px",
                fontWeight: "600",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
              🏺 Jarre
            </label>
            <select 
              value={jar} 
              onChange={(e) => setJar(e.target.value as JarKey)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "10px",
                border: "1px solid var(--border-color)",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              <option value="NEC">NEC</option>
              <option value="FFA">FFA</option>
              <option value="LTSS">LTSS</option>
              <option value="PLAY">PLAY</option>
              <option value="EDUC">EDUC</option>
              <option value="GIFT">GIFT</option>
            </select>
          </div>
        </div>

        {/* Règle appliquée */}
        {appliedRule && (
          <div style={{
            padding: "8px 12px",
            borderRadius: "10px",
            background: "rgba(0, 122, 255, 0.1)",
            border: "1px solid rgba(0, 122, 255, 0.3)",
            fontSize: "12px",
            color: "#007AFF",
            fontWeight: "600",
          }}>
            ✨ Règle : <strong>{appliedRule.keyword}</strong>
            {appliedRule.jar && <> → {appliedRule.jar}</>}
            {appliedRule.account && <> · {appliedRule.account}</>}
          </div>
        )}

        {/* Tags */}
        <div>
          <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "8px" }}>
            🏷️ Tags (optionnel)
          </label>
          <TagSelector
            selectedTags={selectedTags}
            onChange={setSelectedTags}
            compact={true}
          />
        </div>

        {/* Message */}
        {message && (
          <div style={{
            padding: "10px 12px",
            borderRadius: "10px",
            background: message.includes("✅") ? "rgba(52, 199, 89, 0.1)" : "rgba(255, 59, 48, 0.1)",
            border: message.includes("✅") ? "1px solid rgba(52, 199, 89, 0.3)" : "1px solid rgba(255, 59, 48, 0.3)",
            fontSize: "13px",
            color: message.includes("✅") ? "#34C759" : "#FF3B30",
            fontWeight: "600",
            textAlign: "center",
          }}>
            {message}
          </div>
        )}

        {/* Bouton */}
        <button 
          type="submit" 
          disabled={loading || !description || !account || !amount}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "12px",
            border: "none",
            background: (loading || !description || !account || !amount)
              ? "var(--border-color)"
              : "linear-gradient(135deg, #007AFF 0%, #0051d5 100%)",
            color: "white",
            fontSize: "15px",
            fontWeight: "700",
            cursor: (loading || !description || !account || !amount) ? "not-allowed" : "pointer",
            boxShadow: (loading || !description || !account || !amount) ? "none" : "0 4px 12px rgba(0, 122, 255, 0.3)",
            opacity: (loading || !description || !account || !amount) ? 0.5 : 1,
          }}
        >
          {loading ? "⏳ Enregistrement…" : "✓ Enregistrer"}
        </button>
      </form>
      )}
    </main>
  );
};

export default SpendingForm;
