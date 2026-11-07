// src/components/RevenueTransactionEditor.tsx
import React, { useState, useEffect } from "react";
import { loadRevenueSources, RevenueSource } from "../revenueSourcesUtils";
import { getRateToBase } from "../exchangeRate";
import { getBaseCurrency } from "../baseCurrency";
import { t, useLang } from "../i18n";

interface RevenueTransaction {
  date: string;
  description: string;
  amount: number;
  currency?: string;
  suggestedSource?: string;
  suggestedMethod?: string;
  selected?: boolean;
  valeur?: string; // ✅ Devise en texte (USD, EUR, etc.)
  quantiteCrypto?: number;
  usdEurRate?: number;
  methodeCrypto?: string;
  adresseCrypto?: string;
  compteDestination?: string;
  type?: string;
  tags?: string;
}

interface Account {
  name: string;
  emoji: string;
}

interface RevenueTransactionEditorProps {
  transaction: RevenueTransaction;
  onSave: (updatedTransaction: RevenueTransaction) => void;
  onCancel: () => void;
  accounts: Account[];
}

export const RevenueTransactionEditor: React.FC<RevenueTransactionEditorProps> = ({
  transaction,
  onSave,
  onCancel,
  accounts,
}) => {
  useLang();
  // 🐛 DEBUG: Voir ce que reçoit le modal
  console.log("🔍 RevenueTransactionEditor - Transaction reçue:", transaction);
  console.log("🔍 methodeCrypto:", transaction.methodeCrypto);
  console.log("🔍 adresseCrypto:", transaction.adresseCrypto);
  
  const [editedTx, setEditedTx] = useState<RevenueTransaction>({ ...transaction });
  const [revenueSources, setRevenueSources] = useState<RevenueSource[]>([]);

  // Charger les sources au montage du composant
  useEffect(() => {
    const sources = loadRevenueSources();
    console.log('📊 Sources de revenus chargées:', sources);
    setRevenueSources(sources);
  }, []);

  // Convertir la date au format YYYY-MM-DD pour l'input date
  const formatDateForInput = (dateStr: string) => {
    if (!dateStr) return '';
    
    // Si déjà au format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    try {
      // Essayer de parser différents formats
      // Format: "27 November 2025 , 11 : 48am"
      const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (match) {
        const day = match[1].padStart(2, '0');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const monthIndex = monthNames.findIndex(m => m.toLowerCase() === match[2].toLowerCase());
        const month = (monthIndex + 1).toString().padStart(2, '0');
        const year = match[3];
        return `${year}-${month}-${day}`;
      }
      
      // Format: "26/12/2025"
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts;
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }
      
      return '';
    } catch (e) {
      console.error('Erreur parsing date:', e);
      return '';
    }
  };

  const [formattedDate, setFormattedDate] = useState(formatDateForInput(transaction.date));

  // Fonction pour extraire la devise de la méthode (BTC, USDT, etc.)
  const extractCurrencyFromMethod = (method: string): string | null => {
    if (!method) return null;
    const knownCurrencies = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'ADA', 'SOL', 'DOGE', 'DOT', 'MATIC', 'LTC', 'BCH'];
    // "USDC_ETH" ou "USDT_TRC20" → devise = partie avant "_" (actif, pas le réseau)
    if (method.includes('_')) {
      const firstToken = method.split('_')[0].trim().toUpperCase();
      if (knownCurrencies.includes(firstToken)) return firstToken;
    }
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

  // Taux vers la devise de référence (fiat : taux historique ; crypto : prix CoinGecko)
  const getHistoricalRate = (fromCurrency: string, date: string): Promise<number | null> =>
    getRateToBase(fromCurrency, date);

  const handleSave = async () => {
    console.log('💾 Sauvegarde revenu:', editedTx);
    
    // Si le taux USD/EUR est vide et qu'on a une méthode avec une devise
    if (!editedTx.usdEurRate && editedTx.methodeCrypto) {
      const currency = extractCurrencyFromMethod(editedTx.methodeCrypto);
      
      if (currency && currency !== getBaseCurrency()) {
        console.log(`💱 Calcul automatique du taux ${currency}/EUR...`);
        
        // Utiliser la date de la transaction
        const rate = await getHistoricalRate(currency, formattedDate || editedTx.date);
        
        if (rate) {
          console.log(`✅ Taux calculé: ${rate}`);
          editedTx.usdEurRate = rate;
        } else {
          console.warn(`⚠️ Impossible de calculer le taux ${currency}/EUR`);
        }
      }
    }
    
    onSave(editedTx);
  };

  const rateFrom =
    extractCurrencyFromMethod(editedTx.methodeCrypto || "") ||
    (editedTx.valeur || "").trim().toUpperCase() ||
    "USD";

  return (
    <div
      className="fs-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={onCancel}
    >
      <div
        className="fs-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--bg-card)",
          borderRadius: "20px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          maxWidth: "700px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: "700",
              color: "var(--text-main)",
            }}
          >
            {t("rte.title")}
          </h3>
          <button
            onClick={onCancel}
            style={{
              border: "none",
              background: "none",
              color: "var(--text-muted)",
              fontSize: "24px",
              cursor: "pointer",
              padding: "4px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: "24px",
            overflowY: "auto",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Date */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                {t("rev.date")}
              </label>
              <input
                type="date"
                value={formattedDate}
                onChange={(e) => {
                  setFormattedDate(e.target.value);
                  setEditedTx({ ...editedTx, date: e.target.value });
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-body)",
                  color: "var(--text-main)",
                  fontSize: "14px",
                }}
              />
            </div>

            {/* Source de revenu - Afficher seulement si pas déjà sélectionnée */}
            {!editedTx.suggestedSource && revenueSources.length > 0 && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "16px",
                    fontWeight: "700",
                    color: "var(--text-main)",
                    marginBottom: "16px",
                  }}
                >
                  {t("rte.source")}
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "12px",
                  }}
                >
                  {revenueSources.map((source) => (
                    <button
                      key={source.id}
                      onClick={() => {
                        console.log('✅ Source sélectionnée:', source.name);
                        setEditedTx({ ...editedTx, suggestedSource: source.name });
                      }}
                      style={{
                        padding: "16px 12px",
                        borderRadius: "12px",
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-body)",
                        color: "var(--text-main)",
                        fontSize: "13px",
                        fontWeight: "600",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "8px",
                        transition: "all 0.2s",
                      }}
                    >
                      <span style={{ fontSize: "36px" }}>{source.icon}</span>
                      <span style={{ textAlign: "center" }}>{source.name}</span>
                      {source.category && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--text-muted)",
                          }}
                        >
                          {source.category}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Source sélectionnée - Afficher seulement comme texte */}
            {editedTx.suggestedSource && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "var(--text-main)",
                    marginBottom: "8px",
                  }}
                >
                  {t("rte.source")}
                </label>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(52, 199, 89, 0.1)",
                    border: "2px solid #34C759",
                    color: "var(--text-main)",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  {editedTx.suggestedSource}
                </div>
              </div>
            )}

            {/* Montant */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                {t("rte.amount")}
              </label>
              <input
                type="number"
                step="any"
                value={editedTx.amount ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditedTx({ 
                    ...editedTx, 
                    amount: val === "" ? 0 : parseFloat(val)
                  });
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
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
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                {t("rte.currencyValue")}
              </label>
              <input
                type="text"
                value={editedTx.valeur || ""}
                onChange={(e) =>
                  setEditedTx({ ...editedTx, valeur: e.target.value })
                }
                placeholder={t("rte.currencyPh")}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
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
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                {t("rte.cryptoQty")}
              </label>
              <input
                type="number"
                step="any"
                value={editedTx.quantiteCrypto ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditedTx({ 
                    ...editedTx, 
                    quantiteCrypto: val === "" ? undefined : parseFloat(val)
                  });
                }}
                placeholder="1296"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-body)",
                  color: "var(--text-main)",
                  fontSize: "14px",
                }}
              />
            </div>

            {/* Méthode Crypto */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                {t("rte.network")}
              </label>
              <input
                type="text"
                value={editedTx.methodeCrypto || ""}
                onChange={(e) =>
                  setEditedTx({ ...editedTx, methodeCrypto: e.target.value })
                }
                placeholder={t("rte.networkPh")}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
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
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                {t("rte.rate", { from: rateFrom, to: getBaseCurrency() })}
              </label>
              <input
                type="number"
                step="any"
                value={editedTx.usdEurRate ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditedTx({ 
                    ...editedTx, 
                    usdEurRate: val === "" ? undefined : parseFloat(val)
                  });
                }}
                placeholder="0.849385"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
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
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                {t("rte.address")}
              </label>
              <input
                type="text"
                value={editedTx.adresseCrypto || ""}
                onChange={(e) =>
                  setEditedTx({ ...editedTx, adresseCrypto: e.target.value })
                }
                placeholder={t("rte.addressPh")}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-body)",
                  color: "var(--text-main)",
                  fontSize: "12px",
                  fontFamily: "monospace",
                }}
              />
            </div>

            {/* Compte de destination */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                {t("rte.destAccount")}
              </label>
              <input
                type="text"
                value={editedTx.compteDestination || editedTx.suggestedMethod || ""}
                onChange={(e) =>
                  setEditedTx({ 
                    ...editedTx, 
                    compteDestination: e.target.value,
                    suggestedMethod: e.target.value 
                  })
                }
                placeholder={t("rte.destAccountPh")}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-body)",
                  color: "var(--text-main)",
                  fontSize: "14px",
                }}
              />
            </div>

            {/* Type */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                {t("rte.type")}
              </label>
              <input
                type="text"
                value={editedTx.type || ""}
                placeholder={t("rte.typeDefault")}
                onChange={(e) =>
                  setEditedTx({ ...editedTx, type: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-body)",
                  color: "var(--text-main)",
                  fontSize: "14px",
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            gap: "12px",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "14px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-body)",
              color: "var(--text-main)",
              fontSize: "15px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            {t("txe.cancel")}
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #34C759 0%, #28a745 100%)",
              color: "white",
              fontSize: "15px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            {t("txe.save")}
          </button>
        </div>
      </div>
    </div>
  );
};
