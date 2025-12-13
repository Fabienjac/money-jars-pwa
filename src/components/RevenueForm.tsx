import React, { useEffect, useState } from "react";
import { appendRevenue } from "../api";
import { loadAutoRules, AutoRule } from "../autoRules";

interface RevenueFormProps {
  prefill?: any | null;
  onClearPrefill?: () => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const RevenueForm: React.FC<RevenueFormProps> = ({
  prefill,
  onClearPrefill,
}) => {
  const [date, setDate] = useState<string>(todayISO());
  const [source, setSource] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [value, setValue] = useState<string>("USD");
  const [cryptoQuantity, setCryptoQuantity] = useState<string>("");
  const [method, setMethod] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [cryptoAddress, setCryptoAddress] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [incomeType, setIncomeType] = useState<string>("");

  const [appliedRule, setAppliedRule] = useState<AutoRule | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // === Pré-remplissage depuis l'historique ===
  useEffect(() => {
    if (!prefill) return;

    if (prefill.date) setDate(prefill.date);
    if (prefill.source) setSource(prefill.source);
    if (prefill.amount != null) setAmount(String(prefill.amount));
    if (prefill.value) setValue(prefill.value);
    if (prefill.cryptoQuantity != null) setCryptoQuantity(String(prefill.cryptoQuantity));
    if (prefill.method) setMethod(prefill.method);
    if (prefill.rate != null) setRate(String(prefill.rate));
    if (prefill.cryptoAddress) setCryptoAddress(prefill.cryptoAddress);
    if (prefill.destination) setDestination(prefill.destination);
    if (prefill.incomeType) setIncomeType(prefill.incomeType);

    setAppliedRule(null);
    onClearPrefill?.();
  }, [prefill, onClearPrefill]);

  // === Application automatique des règles sur la source ===
  const handleSourceChange = (value: string) => {
    setSource(value);

    const text = value.trim().toLowerCase();
    if (!text) {
      setAppliedRule(null);
      return;
    }

    const rules = loadAutoRules().filter((r) => r.mode === "revenue");
    const rule = rules.find((r) =>
      text.includes(r.keyword.toLowerCase())
    );

    if (!rule) {
      setAppliedRule(null);
      return;
    }

    setAppliedRule(rule);

    if (rule.destination) {
      setDestination(rule.destination);
    }
    if (rule.incomeType) {
      setIncomeType(rule.incomeType);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const numAmount = amount.trim() === "" ? null : parseFloat(amount.replace(",", "."));
    const numCryptoQty = cryptoQuantity.trim() === "" ? null : parseFloat(cryptoQuantity.replace(",", "."));
    const numRate = rate.trim() === "" ? null : parseFloat(rate.replace(",", "."));

    if (!date || !source) {
      setMessage("Merci de saisir au minimum la date et la source.");
      return;
    }

    try {
      setLoading(true);
      await appendRevenue({
        date,
        source,
        amount: numAmount,
        value,
        cryptoQuantity: numCryptoQty,
        method,
        rate: numRate,
        cryptoAddress,
        destination,
        incomeType,
      });

      setMessage("Revenu enregistré ✅");
      setSource("");
      setAmount("");
      setValue("USD");
      setCryptoQuantity("");
      setMethod("");
      setRate("");
      setCryptoAddress("");
      setDestination("");
      setIncomeType("");
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
      <h2>Nouveau revenu</h2>

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
          <span>Source</span>
          <input
            type="text"
            value={source}
            onChange={(e) => handleSourceChange(e.target.value)}
          />
        </label>

        {appliedRule && (
          <p className="form-hint">
            Règle appliquée&nbsp;: <strong>{appliedRule.keyword}</strong>
            {appliedRule.destination && (
              <> → Destination <strong>{appliedRule.destination}</strong></>
            )}
            {appliedRule.incomeType && (
              <> · Type <strong>{appliedRule.incomeType}</strong></>
            )}
          </p>
        )}

        <label className="field">
          <span>Montant</span>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Valeur (devise)</span>
          <select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>

        <label className="field">
          <span>Quantité Crypto</span>
          <input
            type="number"
            step="0.00000001"
            inputMode="decimal"
            value={cryptoQuantity}
            onChange={(e) => setCryptoQuantity(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Méthode de retrait</span>
          <input
            type="text"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Taux du jour $/€</span>
          <input
            type="number"
            step="0.0001"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Adresse crypto</span>
          <input
            type="text"
            value={cryptoAddress}
            onChange={(e) => setCryptoAddress(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Compte de destination</span>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Type de revenu</span>
          <input
            type="text"
            value={incomeType}
            onChange={(e) => setIncomeType(e.target.value)}
          />
        </label>

        {message && <p className="form-message">{message}</p>}

        <button type="submit" className="primary" disabled={loading}>
          {loading ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </main>
  );
};

export default RevenueForm;
