import React, { useEffect, useState } from "react";
import { appendRevenue, getAccounts, getRevenueAccounts } from "../api";
import { loadAutoRules, AutoRule } from "../autoRules";
import { loadRevenueAccounts, saveRevenueAccounts } from "../revenueAccountsUtils";
import { loadAccounts, saveAccounts } from "../accountsUtils";
import { loadPreferredCurrencies } from "../currencyUtils";
import { useExchangeRate } from "../hooks/useExchangeRate";
import CurrencySelector from "./CurrencySelector";

interface RevenueFormProps {
  prefill?: any | null;
  onClearPrefill?: () => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const formatDateForGoogleSheets = (isoDate: string): string => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
};

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

  const [preferredCurrencies] = useState<string[]>(loadPreferredCurrencies);
  const [rateManuallyEdited, setRateManuallyEdited] = useState(false);

  const { rate: fetchedRate, loading: rateLoading } = useExchangeRate(value, date);

  // Auto-remplir le taux dès que la devise ou la date change (sauf si l'utilisateur l'a modifié manuellement)
  useEffect(() => {
    if (rateManuallyEdited) return;
    if (value === "EUR") {
      setRate("1");
    } else if (fetchedRate !== null) {
      setRate(fetchedRate.toFixed(6).replace(/\.?0+$/, ""));
    }
  }, [fetchedRate, value]);

  // Quand la devise change, autoriser le rechargement auto
  useEffect(() => {
    setRateManuallyEdited(false);
  }, [value, date]);

  const [appliedRule, setAppliedRule] = useState<AutoRule | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  
  // ✅ États pour les comptes (chargés depuis le Sheet pour synchro Mac / iPhone)
  const [revenueAccounts, setRevenueAccounts] = useState(loadRevenueAccounts());
  const [spendingAccounts, setSpendingAccounts] = useState(loadAccounts());

  useEffect(() => {
    getRevenueAccounts().then(setRevenueAccounts).catch(() => setRevenueAccounts(loadRevenueAccounts()));
  }, []);
  useEffect(() => {
    const reload = () => getRevenueAccounts().then(setRevenueAccounts).catch(() => setRevenueAccounts(loadRevenueAccounts()));
    window.addEventListener("revenueAccountsUpdated", reload);
    return () => window.removeEventListener("revenueAccountsUpdated", reload);
  }, []);
  useEffect(() => {
    getAccounts().then(setSpendingAccounts).catch(() => setSpendingAccounts(loadAccounts()));
  }, []);

  useEffect(() => {
    if (!prefill) return;

    if (prefill.date) setDate(prefill.date);
    
    if (prefill.source) {
      console.log("📍 Source du prefill:", `"${prefill.source}"`);
      
      const matchedAccount = revenueAccounts.find(
        acc => acc.name.trim().toLowerCase() === prefill.source.trim().toLowerCase()
      );
      
      if (matchedAccount) {
        console.log("✅ Source trouvée:", matchedAccount.name);
        setSource(matchedAccount.name);
        
        if (matchedAccount.type && !prefill.incomeType) {
          setIncomeType(matchedAccount.type);
          console.log("✅ Type auto-rempli:", matchedAccount.type);
        }
      } else {
        console.log("⚠️ Source non trouvée dans les comptes, utilisation brute");
        setSource(prefill.source);
      }
    }
    
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
  }, [prefill, onClearPrefill, revenueAccounts]);

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
  };

  // ✅ Auto-ajout du compte de revenu (Source)
  const ensureRevenueAccountExists = (sourceName: string) => {
    if (!sourceName.trim()) {
      console.log("⚠️ Source vide, pas d'ajout");
      return;
    }

    console.log(`🔍 Vérification de la source: "${sourceName}"`);

    const exists = revenueAccounts.some(
      acc => acc.name.trim().toLowerCase() === sourceName.trim().toLowerCase()
    );

    if (exists) {
      console.log(`✅ Source "${sourceName}" existe déjà`);
      return;
    }

    console.log(`➕ Ajout automatique du compte de revenu: "${sourceName}"`);
    
    const newAccount = {
      id: `revaccount_${Date.now()}`,
      name: sourceName.trim(),
      icon: "💰",
      type: incomeType.trim() || "",
    };

    const updatedAccounts = [...revenueAccounts, newAccount];
    saveRevenueAccounts(updatedAccounts);
    setRevenueAccounts(updatedAccounts);
    
    // Dispatcher event pour notifier SettingsView
    window.dispatchEvent(new CustomEvent('revenueAccountsUpdated'));
    
    console.log(`✅ Compte de revenu "${sourceName}" ajouté avec succès`);
  };

  // ✅ NOUVEAU : Auto-ajout du compte de dépense (Destination)
  const ensureSpendingAccountExists = (accountName: string) => {
    if (!accountName.trim()) {
      console.log("⚠️ Destination vide, pas d'ajout");
      return;
    }

    console.log(`🔍 Vérification de la destination: "${accountName}"`);

    const exists = spendingAccounts.some(
      acc => acc.name.trim().toLowerCase() === accountName.trim().toLowerCase()
    );

    if (exists) {
      console.log(`✅ Destination "${accountName}" existe déjà`);
      return;
    }

    console.log(`➕ Ajout automatique du compte de dépense: "${accountName}"`);
    
    const newAccount = {
      id: `account_${Date.now()}`,
      name: accountName.trim(),
      icon: "💳", // Icône par défaut
    };

    const updatedAccounts = [...spendingAccounts, newAccount];
    saveAccounts(updatedAccounts);
    setSpendingAccounts(updatedAccounts);
    
    // Dispatcher event pour notifier SettingsView
    window.dispatchEvent(new CustomEvent('spendingAccountsUpdated'));
    
    console.log(`✅ Compte de dépense "${accountName}" ajouté avec succès`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const numAmount = amount.trim() === "" ? null : parseFloat(amount.replace(",", "."));
    const numCryptoQty = cryptoQuantity.trim() === "" ? null : parseFloat(cryptoQuantity.replace(",", "."));
    let numRate = rate.trim() === "" ? null : parseFloat(rate.replace(",", "."));

    if (!date || !source) {
      setMessage("Merci de saisir au minimum la date et la source.");
      return;
    }

    try {
      setLoading(true);
      
      console.log(`📤 Soumission - Source: "${source}", Destination: "${destination}"`);
      
      // ✅ AUTO-AJOUTER la source si elle n'existe pas
      ensureRevenueAccountExists(source);
      
      // ✅ AUTO-AJOUTER la destination si elle n'existe pas ET n'est pas vide
      if (destination.trim()) {
        ensureSpendingAccountExists(destination);
      }
      
      await appendRevenue({
        date: formatDateForGoogleSheets(date),
        source,
        amount: numAmount ?? undefined,
        value,
        cryptoQuantity: numCryptoQty ?? undefined,
        method,
        rate: numRate ?? undefined,
        cryptoAddress,
        destination,
        incomeType,
      });

      setMessage("✅ Revenu enregistré avec succès");
      
      // Reset form
      setSource("");
      setAmount("");
      setValue("USD");
      setCryptoQuantity("");
      setMethod("");
      setRate("");
      setCryptoAddress("");
      setDestination("");
      setIncomeType("");
      setDate(todayISO());
      
      // Recharger les comptes pour avoir la liste à jour
      setRevenueAccounts(loadRevenueAccounts());
      setSpendingAccounts(loadAccounts());
      
    } catch (err: any) {
      console.error("❌ Erreur lors de l'enregistrement:", err);
      setMessage("❌ Erreur : " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
        backgroundColor: "var(--bg-card)",
        borderRadius: "12px",
      }}
    >
      <div>
        <label htmlFor="date" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
          📅 Date
        </label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-body)",
            color: "var(--text-main)",
            fontSize: "14px",
          }}
        />
      </div>

      {/* ✅ Source avec datalist (Comptes de revenus) */}
      <div>
        <label htmlFor="source" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
          💰 Source de revenu
        </label>
        <input
          id="source"
          type="text"
          list="revenue-accounts-list"
          value={source}
          onChange={(e) => handleSourceChange(e.target.value)}
          placeholder="Sélectionner ou saisir une source..."
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-body)",
            color: "var(--text-main)",
            fontSize: "14px",
          }}
        />
        <datalist id="revenue-accounts-list">
          {revenueAccounts.map(acc => (
            <option key={acc.id} value={acc.name}>
              {acc.icon} {acc.name} {acc.type && `(${acc.type})`}
            </option>
          ))}
        </datalist>
        {revenueAccounts.length > 0 && (
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
            💡 Tapez pour créer une nouvelle source ou sélectionnez-en une existante
          </p>
        )}
      </div>

      <div>
        <label htmlFor="amount" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
          💵 Montant
        </label>
        <input
          id="amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="ex: 1500"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-body)",
            color: "var(--text-main)",
            fontSize: "14px",
          }}
        />
      </div>

      <div>
        <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
          💱 Devise du revenu
        </label>
        <CurrencySelector
          value={value}
          preferred={preferredCurrencies}
          onChange={setValue}
        />
      </div>

      <div>
        <label htmlFor="cryptoQuantity" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
          🪙 Quantité Crypto (optionnel)
        </label>
        <input
          id="cryptoQuantity"
          type="text"
          inputMode="decimal"
          value={cryptoQuantity}
          onChange={(e) => setCryptoQuantity(e.target.value)}
          placeholder="ex: 0.05"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-body)",
            color: "var(--text-main)",
            fontSize: "14px",
          }}
        />
      </div>

      <div>
        <label htmlFor="method" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
          💳 Méthode (optionnel)
        </label>
        <input
          id="method"
          type="text"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          placeholder="ex: USDC_ETH, Virement..."
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-body)",
            color: "var(--text-main)",
            fontSize: "14px",
          }}
        />
      </div>

      <div>
        <label htmlFor="rate" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
          📊 Taux de change {value !== "EUR" && (
            <span style={{ fontWeight: 400, fontSize: "12px", color: "var(--text-muted)" }}>
              ({value} → EUR)
            </span>
          )}
          {rateLoading && (
            <span style={{ fontWeight: 400, fontSize: "12px", color: "#007AFF", marginLeft: "8px" }}>
              ⏳ Chargement…
            </span>
          )}
          {!rateLoading && !rateManuallyEdited && rate && value !== "EUR" && (
            <span style={{ fontWeight: 400, fontSize: "12px", color: "#34C759", marginLeft: "8px" }}>
              ✓ Auto
            </span>
          )}
        </label>
        <input
          id="rate"
          type="text"
          inputMode="decimal"
          value={rate}
          onChange={(e) => {
            setRate(e.target.value);
            setRateManuallyEdited(true);
          }}
          placeholder={value === "EUR" ? "1" : "Chargement automatique…"}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: `1px solid ${!rateManuallyEdited && rate && value !== "EUR" ? "rgba(52,199,89,0.5)" : "var(--border-color)"}`,
            backgroundColor: "var(--bg-body)",
            color: "var(--text-main)",
            fontSize: "14px",
          }}
        />
        {!rateManuallyEdited && value !== "EUR" && (
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
            💡 Modifiez manuellement pour remplacer le taux automatique
          </p>
        )}
      </div>

      <div>
        <label htmlFor="cryptoAddress" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
          🔐 Adresse Crypto (optionnel)
        </label>
        <input
          id="cryptoAddress"
          type="text"
          value={cryptoAddress}
          onChange={(e) => setCryptoAddress(e.target.value)}
          placeholder="ex: 0x..."
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-body)",
            color: "var(--text-main)",
            fontSize: "14px",
          }}
        />
      </div>

      {/* ✅ Destination avec datalist (Comptes de dépenses) */}
      <div>
        <label htmlFor="destination" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
          🏦 Compte de destination (optionnel)
        </label>
        <input
          id="destination"
          type="text"
          list="spending-accounts-list"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Sélectionner ou saisir un compte..."
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-body)",
            color: "var(--text-main)",
            fontSize: "14px",
          }}
        />
        <datalist id="spending-accounts-list">
          {spendingAccounts.map(acc => (
            <option key={acc.id} value={acc.name}>
              {acc.icon} {acc.name}
            </option>
          ))}
        </datalist>
        {spendingAccounts.length > 0 && (
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
            💡 Tapez pour créer un nouveau compte ou sélectionnez-en un existant
          </p>
        )}
      </div>

      <div>
        <label htmlFor="incomeType" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
          📋 Type de revenu (optionnel)
        </label>
        <input
          id="incomeType"
          type="text"
          value={incomeType}
          onChange={(e) => setIncomeType(e.target.value)}
          placeholder="ex: Salaire, Freelance, Crypto..."
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-body)",
            color: "var(--text-main)",
            fontSize: "14px",
          }}
        />
      </div>

      {appliedRule && (
        <div style={{
          padding: "10px",
          borderRadius: "8px",
          backgroundColor: "rgba(52, 199, 89, 0.1)",
          border: "1px solid rgba(52, 199, 89, 0.3)",
          fontSize: "13px",
          color: "var(--text-main)",
        }}>
          ✅ Règle appliquée : "{appliedRule.keyword}"
          {appliedRule.destination && ` → ${appliedRule.destination}`}
        </div>
      )}

      {message && (
        <div style={{
          padding: "10px",
          borderRadius: "8px",
          backgroundColor: message.includes("✅") ? "rgba(52, 199, 89, 0.1)" : "rgba(255, 59, 48, 0.1)",
          color: message.includes("✅") ? "#34C759" : "#FF3B30",
          fontSize: "14px",
          fontWeight: "600",
        }}>
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "12px",
          borderRadius: "10px",
          border: "none",
          background: loading ? "#999" : "linear-gradient(135deg, #34C759 0%, #30B350 100%)",
          color: "white",
          fontSize: "16px",
          fontWeight: "700",
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: "0 2px 8px rgba(52, 199, 89, 0.3)",
        }}
      >
        {loading ? "Enregistrement..." : "Enregistrer le revenu"}
      </button>
    </form>
  );
};

export default RevenueForm;
