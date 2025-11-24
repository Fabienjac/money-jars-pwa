import React, { useEffect, useState } from "react";
import { appendRevenue } from "../api";

interface RevenueFormProps {
  prefill?: any | null;
  onClearPrefill?: () => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const RevenueForm: React.FC<RevenueFormProps> = ({ prefill, onClearPrefill }) => {
  const [date, setDate] = useState<string>(todayISO());
  const [source, setSource] = useState<string>("");
  const [amountEUR, setAmountEUR] = useState<string>("");
  const [amountUSD, setAmountUSD] = useState<string>("");
  const [method, setMethod] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [incomeType, setIncomeType] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // === Pré-remplissage depuis l’historique ===
  useEffect(() => {
    if (!prefill) return;

    if (prefill.date) setDate(prefill.date);
    if (prefill.source) setSource(prefill.source);
    if (prefill.amountEUR != null) setAmountEUR(String(prefill.amountEUR));
    if (prefill.amountUSD != null) setAmountUSD(String(prefill.amountUSD));
    if (prefill.method) setMethod(prefill.method);
    if (prefill.rate != null) setRate(String(prefill.rate));
    if (prefill.destination) setDestination(prefill.destination);
    if (prefill.incomeType) setIncomeType(prefill.incomeType);

    // On consomme la préselection une fois appliquée
    onClearPrefill?.();
  }, [prefill, onClearPrefill]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const numEUR =
      amountEUR.trim() === "" ? null : parseFloat(amountEUR.replace(",", "."));
    const numUSD =
      amountUSD.trim() === "" ? null : parseFloat(amountUSD.replace(",", "."));
    const numRate =
      rate.trim() === "" ? null : parseFloat(rate.replace(",", "."));

    if (!date || !source) {
      setMessage("Merci de saisir au minimum la date et la source.");
      return;
    }

    try {
      setLoading(true);
      await appendRevenue({
        date,
        source,
        amountEUR: numEUR,
        amountUSD: numUSD,
        method,
        rate: numRate,
        destination,
        incomeType,
      });

      setMessage("Revenu enregistré ✅");
      // à toi d’adapter si tu veux garder ou non les valeurs
      setSource("");
      setAmountEUR("");
      setAmountUSD("");
      setMethod("");
      setRate("");
      setDestination("");
      setIncomeType("");
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "Erreur lors de l’enregistrement.");
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
            onChange={(e) => setSource(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Montant (€)</span>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={amountEUR}
            onChange={(e) => setAmountEUR(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Montant ($)</span>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={amountUSD}
            onChange={(e) => setAmountUSD(e.target.value)}
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
          <span>Destination</span>
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
