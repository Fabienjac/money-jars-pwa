import React, { useEffect, useState } from "react";
import { appendRevenue } from "../api";
import { loadAutoRules, AutoRule } from "../autoRules";
import { loadRevenueAccounts, saveRevenueAccounts } from "../revenueAccountsUtils";
import { loadAccounts, saveAccounts } from "../accountsUtils";

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

const RECENT_SOURCES_KEY = "recentRevenueSources";
const RECENT_METHODS_KEY = "recentRevenueMethods";

const loadRecentItems = (key: string): string[] => {
  if (typeof localStorage === "undefined") return [];

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("❌ Impossible de charger les presets :", error);
    return [];
  }
};

const saveRecentItems = (key: string, items: string[]) => {
  if (typeof localStorage === "undefined") return;

  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (error) {
    console.warn("❌ Impossible de sauvegarder les presets :", error);
  }
};

const updateRecents = (current: string[], value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return current;

  const filtered = current.filter(
    (item) => item.toLowerCase() !== trimmed.toLowerCase()
  );

  return [trimmed, ...filtered].slice(0, 5);
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
  
  // ✅ États pour les comptes (rechargeable)
  const [revenueAccounts, setRevenueAccounts] = useState(loadRevenueAccounts());
  const [spendingAccounts, setSpendingAccounts] = useState(loadAccounts());
  const [recentSources, setRecentSources] = useState<string[]>(() => loadRecentItems(RECENT_SOURCES_KEY));
  const [recentMethods, setRecentMethods] = useState<string[]>(() => loadRecentItems(RECENT_METHODS_KEY));
  type SectionKey = "base" | "crypto" | "destination";
  const createInitialSectionsState = (): Record<SectionKey, boolean> => ({
    base: true,
    crypto: false,
    destination: false,
  });
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(createInitialSectionsState());

  const toggleSection = (section: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const resetSections = () => setOpenSections(createInitialSectionsState());

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

  useEffect(() => {
    if (!prefill) return;

    setOpenSections((prev) => ({
      ...prev,
      crypto: !!prefill.method || prev.crypto,
      destination: !!prefill.destination || prev.destination,
    }));
  }, [prefill]);

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
      setOpenSections((prev) => ({ ...prev, destination: true }));
    }
  };

  const handleMethodChange = (value: string) => {
    setMethod(value);

    if (value.trim()) {
      setOpenSections((prev) => ({ ...prev, crypto: true }));
    }
  };

  const handleDestinationChange = (value: string) => {
    setDestination(value);

    if (value.trim()) {
      setOpenSections((prev) => ({ ...prev, destination: true }));
    }
  };

  const renderPresets = (items: string[], onSelect: (value: string) => void) => {
    if (!items.length) return null;

    return (
      <div style={{ marginTop: "8px" }}>
        <p style={{ margin: "0 0 6px", fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>
          ⭐️ Dernières sélections
        </p>
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
        }}>
          {items.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onSelect(item)}
              style={{
                padding: "8px 12px",
                borderRadius: "999px",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-body)",
                color: "var(--text-main)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const Section: React.FC<{ title: string; sectionKey: SectionKey; summary?: React.ReactNode; children: React.ReactNode }> = ({
    title,
    sectionKey,
    summary,
    children,
  }) => (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: "12px",
        background: "var(--bg-card)",
        padding: "10px 12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <button
        type="button"
        onClick={() => toggleSection(sectionKey)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          color: "var(--text-main)",
          fontSize: "15px",
          fontWeight: 700,
          padding: "4px 0",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
          <span>{title}</span>
          {summary && (
            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 500 }}>
              {summary}
            </span>
          )}
        </div>
        <span>{openSections[sectionKey] ? "▲" : "▼"}</span>
      </button>

      {openSections[sectionKey] && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", paddingTop: "8px" }}>
          {children}
        </div>
      )}
    </div>
  );

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
      
      // CALCUL AUTO du taux
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
        date: formatDateForGoogleSheets(date),
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

      const updatedSources = updateRecents(recentSources, source);
      setRecentSources(updatedSources);
      saveRecentItems(RECENT_SOURCES_KEY, updatedSources);

      if (method.trim()) {
        const updatedMethods = updateRecents(recentMethods, method);
        setRecentMethods(updatedMethods);
        saveRecentItems(RECENT_METHODS_KEY, updatedMethods);
      }

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
      resetSections();
      
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

  const getHistoricalRate = async (fromCurrency: string, dateStr: string): Promise<number | null> => {
    try {
      const isoDate = dateStr;
      
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
        const coinId = cryptoIds[fromCurrency];
        const [year, month, day] = isoDate.split('-');
        const dateFormatted = `${day}-${month}-${year}`;
        
        const url = `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${dateFormatted}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`❌ CoinGecko API returned ${response.status}`);
          return null;
        }
        
        const data = await response.json();
        
        if (!data.market_data || !data.market_data.current_price || !data.market_data.current_price.eur) {
          return null;
        }
        
        return data.market_data.current_price.eur;
      } else {
        const url = `https://api.frankfurter.app/${isoDate}?from=${fromCurrency}&to=EUR`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          return null;
        }
        
        const data = await response.json();
        
        if (!data.rates || !data.rates.EUR) {
          return null;
        }
        
        return data.rates.EUR;
      }
    } catch (error) {
      console.error(`❌ Error fetching rate:`, error);
      return null;
    }
  };

  const methodCurrency = extractCurrencyFromMethod(method);
  const isCryptoMethod = Boolean(methodCurrency);
  const isStablecoinMethod = methodCurrency === "USDT" || methodCurrency === "USDC";

  useEffect(() => {
    const trimmedAmount = amount.trim();

    if (isStablecoinMethod && trimmedAmount && cryptoQuantity !== trimmedAmount) {
      setCryptoQuantity(trimmedAmount);
      return;
    }

    if (!isCryptoMethod && cryptoQuantity) {
      setCryptoQuantity("");
    }
  }, [amount, cryptoQuantity, isCryptoMethod, isStablecoinMethod]);

  const baseSummary = [
    source && `Source : ${source}`,
    amount && `Montant : ${amount}`,
    value && `Devise : ${value}`,
  ].filter(Boolean).join(" • ") || "Champs principaux";

  const cryptoSummary = (() => {
    if (!method.trim()) return "Méthode / crypto";
    if (!isCryptoMethod) return "Méthode non crypto";

    const currencyLabel = methodCurrency || "Crypto";
    const parts = [currencyLabel];
    if (cryptoQuantity.trim()) parts.push(`Qty ${cryptoQuantity}`);
    if (rate.trim()) parts.push(`Tx ${rate}`);
    return parts.join(" • ");
  })();

  const destinationSummary = (() => {
    const parts: string[] = [];
    if (destination.trim()) parts.push(destination);
    if (incomeType.trim()) parts.push(`Type ${incomeType}`);
    return parts.join(" • ") || "Destination facultative";
  })();

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "16px",
        backgroundColor: "var(--bg-card)",
        borderRadius: "12px",
      }}
    >
      <Section title="Base" sectionKey="base" summary={baseSummary}>
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
          {renderPresets(recentSources, handleSourceChange)}
          {revenueAccounts.length > 0 && (
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
              💡 Tapez pour créer une nouvelle source ou sélectionnez-en une existante
            </p>
          )}
        </div>

        <div>
          <label htmlFor="amount" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
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

        <div>
          <label htmlFor="value" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
            💱 Devise
          </label>
          <input
            id="value"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="ex: USD, EUR, BTC..."
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
      </Section>

      <Section title="Crypto" sectionKey="crypto" summary={cryptoSummary}>
        <div>
          <label htmlFor="method" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
            💳 Méthode (optionnel)
          </label>
          <input
            id="method"
            type="text"
            value={method}
            onChange={(e) => handleMethodChange(e.target.value)}
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
          {renderPresets(recentMethods, handleMethodChange)}
        </div>

        <div>
          <label htmlFor="rate" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
            📊 Taux de change (optionnel)
          </label>
          <input
            id="rate"
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="Auto si vide + crypto détectée"
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

        {isCryptoMethod && (
          <div>
            <label htmlFor="cryptoQuantity" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
              🪙 Quantité Crypto (détectée)
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
        )}
        {!isCryptoMethod && method.trim() && (
          <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            ⚠️ Méthode non crypto détectée : la quantité crypto reste masquée.
          </p>
        )}

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
      </Section>

      <Section title="Destination" sectionKey="destination" summary={destinationSummary}>
        <div>
          <label htmlFor="destination" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
            🏦 Compte de destination (optionnel)
          </label>
          <input
            id="destination"
            type="text"
            list="spending-accounts-list"
            value={destination}
            onChange={(e) => handleDestinationChange(e.target.value)}
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
      </Section>

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
