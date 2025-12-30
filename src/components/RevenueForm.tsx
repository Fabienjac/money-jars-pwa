import React, { useEffect, useState } from "react";
import { appendRevenue } from "../api";
import { loadAutoRules, AutoRule } from "../autoRules";
import { loadRevenueAccounts } from "../revenueAccountsUtils";

interface RevenueFormProps {
  prefill?: any | null;
  onClearPrefill?: () => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

// ✅ Fonction pour convertir YYYY-MM-DD en DD/MM/YYYY
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

  const [appliedRule, setAppliedRule] = useState<AutoRule | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  
  const [revenueAccounts] = useState(loadRevenueAccounts());

  // === Pré-remplissage depuis l'historique ===
  useEffect(() => {
    if (!prefill) return;

    if (prefill.date) setDate(prefill.date);
    
    // 🔧 AMÉLIORATION : Normaliser la source et auto-remplir le type
    if (prefill.source) {
      console.log("📍 Source du prefill:", `"${prefill.source}"`);
      
      // Chercher une correspondance exacte ou normalisée
      const matchedAccount = revenueAccounts.find(
        acc => acc.name.trim().toLowerCase() === prefill.source.trim().toLowerCase()
      );
      
      if (matchedAccount) {
        console.log("✅ Source trouvée:", matchedAccount.name);
        setSource(matchedAccount.name);  // Utiliser le nom exact du compte
        
        // Auto-remplir le type si disponible
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
      
      // ✅ CALCUL AUTO du taux si vide et méthode contient une crypto
      if (!numRate && method) {
        const currency = extractCurrencyFromMethod(method);
        
        if (currency && currency !== 'EUR') {
          console.log(`💱 Calcul auto du taux ${currency}/EUR...`);
          const calculatedRate = await getHistoricalRate(currency, date);
          
          if (calculatedRate) {
            numRate = calculatedRate;
            console.log(`✅ Taux calculé: ${calculatedRate}`);
          }
        }
      }
      
      await appendRevenue({
        date: formatDateForGoogleSheets(date), // ✅ Convertir la date
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
      setDate(todayISO());
    } catch (err: any) {
      console.error(err);
      setMessage("Erreur : " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour extraire la devise de la méthode
  const extractCurrencyFromMethod = (method: string): string | null => {
    if (!method) return null;
    
    const currencyPatterns = [
      /BTC/i, /ETH/i, /USDT/i, /USDC/i, /XRP/i,
      /ADA/i, /SOL/i, /DOGE/i, /DOT/i, /MATIC/i,
      /LTC/i, /BCH/i,
    ];
    
    for (const pattern of currencyPatterns) {
      if (pattern.test(method)) {
        return method.match(pattern)![0].toUpperCase();
      }
    }
    
    return null;
  };

  // Fonction pour récupérer le taux historique
  const getHistoricalRate = async (fromCurrency: string, dateStr: string): Promise<number | null> => {
    try {
      // Convertir la date ISO en format YYYY-MM-DD
      const isoDate = dateStr; // Déjà au format ISO depuis l'input date
      
      // Cryptomonnaies : utiliser CoinGecko
      const cryptoIds: { [key: string]: string } = {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'USDT': 'tether',
        'USDC': 'usd-coin',
        'XRP': 'ripple',
        'ADA': 'cardano',
        'SOL': 'solana',
        'DOGE': 'dogecoin',
        'DOT': 'polkadot',
        'MATIC': 'matic-network',
        'LTC': 'litecoin',
        'BCH': 'bitcoin-cash',
      };
      
      if (cryptoIds[fromCurrency]) {
        // Crypto : utiliser CoinGecko
        const coinId = cryptoIds[fromCurrency];
        const [year, month, day] = isoDate.split('-');
        const dateFormatted = `${day}-${month}-${year}`; // DD-MM-YYYY pour CoinGecko
        
        const url = `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${dateFormatted}`;
        console.log(`🔄 Fetching crypto rate ${fromCurrency}→EUR for ${dateFormatted} via CoinGecko`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`❌ CoinGecko API returned ${response.status}`);
          return null;
        }
        
        const data = await response.json();
        
        if (!data.market_data || !data.market_data.current_price || !data.market_data.current_price.eur) {
          console.error(`❌ No rate found for ${fromCurrency}→EUR`);
          return null;
        }
        
        return data.market_data.current_price.eur;
      } else {
        // Devise fiat : utiliser Frankfurter
        const url = `https://api.frankfurter.app/${isoDate}?from=${fromCurrency}&to=EUR`;
        console.log(`🔄 Fetching fiat rate ${fromCurrency}→EUR for ${isoDate} via Frankfurter`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`❌ Frankfurter API returned ${response.status}`);
          return null;
        }
        
        const data = await response.json();
        
        if (!data.rates || !data.rates.EUR) {
          console.error(`❌ No rate found for ${fromCurrency}→EUR`);
          return null;
        }
        
        return data.rates.EUR;
      }
    } catch (error) {
      console.error(`❌ Error fetching rate:`, error);
      return null;
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
      {/* Date */}
      <div>
        <label
          htmlFor="date"
          style={{
            display: "block",
            marginBottom: "6px",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
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

      {/* Source */}
      <div>
        <label
          htmlFor="source"
          style={{
            display: "block",
            marginBottom: "6px",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          💰 Source de revenu
        </label>
        <input
          id="source"
          type="text"
          value={source}
          onChange={(e) => handleSourceChange(e.target.value)}
          placeholder="ex: Salaire, Freelance..."
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

      {/* Montant */}
      <div>
        <label
          htmlFor="amount"
          style={{
            display: "block",
            marginBottom: "6px",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          💵 Montant (EUR)
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

      {/* Valeur (devise) */}
      <div>
        <label
          htmlFor="value"
          style={{
            display: "block",
            marginBottom: "6px",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          💱 Devise
        </label>
        <input
          id="value"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="USD, EUR, GBP..."
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

      {/* Quantité Crypto */}
      <div>
        <label
          htmlFor="cryptoQuantity"
          style={{
            display: "block",
            marginBottom: "6px",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          🪙 Quantité Crypto
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

      {/* Méthode */}
      <div>
        <label
          htmlFor="method"
          style={{
            display: "block",
            marginBottom: "6px",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          🔗 Méthode
        </label>
        <input
          id="method"
          type="text"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          placeholder="ex: USDT(TRC20), Bitcoin..."
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

      {/* Taux USD/EUR */}
      <div>
        <label
          htmlFor="rate"
          style={{
            display: "block",
            marginBottom: "6px",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          💱 Taux USD/EUR
        </label>
        <input
          id="rate"
          type="text"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="ex: 0.85"
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

      {/* Adresse Crypto */}
      <div>
        <label
          htmlFor="cryptoAddress"
          style={{
            display: "block",
            marginBottom: "6px",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          🔑 Adresse Crypto
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
            fontFamily: "monospace",
          }}
        />
      </div>

      {/* Compte de destination */}
      <div>
        <label
          htmlFor="destination"
          style={{
            display: "block",
            marginBottom: "6px",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          💳 Compte de destination
        </label>
        <input
          id="destination"
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="ex: Keystone, Binance..."
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

      {/* Type de revenu */}
      <div>
        <label
          htmlFor="incomeType"
          style={{
            display: "block",
            marginBottom: "6px",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          🏷️ Type de revenu
        </label>
        <input
          id="incomeType"
          type="text"
          value={incomeType}
          onChange={(e) => setIncomeType(e.target.value)}
          placeholder="ex: Passive Income..."
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

      {/* Règle appliquée */}
      {appliedRule && (
        <div
          style={{
            padding: "12px",
            backgroundColor: "rgba(52, 199, 89, 0.1)",
            border: "1px solid rgba(52, 199, 89, 0.3)",
            borderRadius: "8px",
            fontSize: "13px",
          }}
        >
          ✅ Règle appliquée : <strong>{appliedRule.name}</strong>
        </div>
      )}

      {/* Message */}
      {message && (
        <div
          style={{
            padding: "12px",
            backgroundColor: message.includes("Erreur")
              ? "rgba(255, 59, 48, 0.1)"
              : "rgba(52, 199, 89, 0.1)",
            border: message.includes("Erreur")
              ? "1px solid rgba(255, 59, 48, 0.3)"
              : "1px solid rgba(52, 199, 89, 0.3)",
            borderRadius: "8px",
            fontSize: "13px",
            color: "var(--text-main)",
          }}
        >
          {message}
        </div>
      )}

      {/* Bouton */}
      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "14px",
          borderRadius: "12px",
          border: "none",
          backgroundColor: loading
            ? "var(--border-color)"
            : "linear-gradient(135deg, #34C759 0%, #30D158 100%)",
          background: loading
            ? "var(--border-color)"
            : "linear-gradient(135deg, #34C759 0%, #30D158 100%)",
          color: "white",
          fontSize: "16px",
          fontWeight: "700",
          cursor: loading ? "not-allowed" : "pointer",
          transition: "all 0.2s",
        }}
      >
        {loading ? "⏳ Enregistrement..." : "💾 Enregistrer le revenu"}
      </button>
    </form>
  );
};

export default RevenueForm;
