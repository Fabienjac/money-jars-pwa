import React, { useState, useEffect } from "react";
import { appendSpending } from "../api";
import { JarKey, SpendingRow } from "../types";
import { loadAutoRules, AutoRule } from "../autoRules";

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
  const [jar, setJar] = useState<string>("NEC");
  const [account, setAccount] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [appliedRule, setAppliedRule] = useState<AutoRule | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // === Pré-remplissage quand on vient de l’Historique ===
  useEffect(() => {
    if (!prefill) return;

    if (prefill.date) setDate(prefill.date);
    if (prefill.jar) setJar(prefill.jar);
    if (prefill.account) setAccount(prefill.account);
    if (prefill.amount != null) setAmount(String(prefill.amount));
    if (prefill.description) setDescription(prefill.description);

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
    if (!date || !jar || !account || !description || !numAmount) {
      setMessage("Merci de remplir tous les champs obligatoires.");
      return;
    }

    try {
      setLoading(true);
      await appendSpending({
        date,
        jar: jar as JarKey,
        account,
        amount: numAmount,
        description,
      });
      setMessage("Dépense enregistrée ✅");

      setAmount("");
      setDescription("");
      setAppliedRule(null);
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "Erreur lors de l’enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <h2>Nouvelle dépense</h2>

      <form className="card form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Jarre</span>
          <select value={jar} onChange={(e) => setJar(e.target.value)}>
            <option value="NEC">NEC</option>
            <option value="FFA">FFA</option>
            <option value="LTSS">LTSS</option>
            <option value="PLAY">PLAY</option>
            <option value="EDUC">EDUC</option>
            <option value="GIFT">GIFT</option>
          </select>
        </label>

        <label className="field">
          <span>Compte</span>
          <input
            type="text"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Montant (€)</span>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Description</span>
          <input
            type="text"
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
          />
        </label>

        {appliedRule && (
          <p className="form-hint">
            Règle appliquée&nbsp;: <strong>{appliedRule.keyword}</strong>
            {appliedRule.jar && <> → Jar <strong>{appliedRule.jar}</strong></>}
            {appliedRule.account && (
              <> · Compte <strong>{appliedRule.account}</strong></>
            )}
          </p>
        )}

        {message && <p className="form-message">{message}</p>}

        <button type="submit" className="primary" disabled={loading}>
          {loading ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </main>
  );
};

export default SpendingForm;
