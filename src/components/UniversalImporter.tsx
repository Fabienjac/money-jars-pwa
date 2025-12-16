// src/components/UniversalImporter.tsx
import React, { useState } from "react";
import { JarKey } from "../types";

interface Transaction {
  date: string;
  description: string;
  amount: number;
  currency?: string;
  originalAmount?: number;
  originalCurrency?: string;
  conversionRate?: number | null;
  conversionNote?: string | null;
  suggestedJar?: JarKey;
  suggestedAccount?: string;
  selected?: boolean;
  isDuplicate?: boolean;
  duplicateNote?: string;
}

interface UniversalImporterProps {
  onImport: (transactions: Transaction[]) => void;
}

type FileFormat = "pdf" | "csv" | "xlsx";

export const UniversalImporter: React.FC<UniversalImporterProps> = ({
  onImport,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<FileFormat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Détecter le format
    const extension = selectedFile.name.split(".").pop()?.toLowerCase();
    let format: FileFormat | null = null;

    if (extension === "pdf") format = "pdf";
    else if (extension === "csv") format = "csv";
    else if (extension === "xlsx" || extension === "xls") format = "xlsx";

    if (format) {
      setFile(selectedFile);
      setFileFormat(format);
      setError(null);
    } else {
      setError(
        "Format non supporté. Veuillez sélectionner un fichier PDF, CSV ou XLSX."
      );
      setFile(null);
      setFileFormat(null);
    }
  };

  const extractTransactions = async () => {
    if (!file || !fileFormat) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("format", fileFormat);

      const response = await fetch("/.netlify/functions/parseFile", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Erreur lors de l'extraction du fichier");
      }

      const data = await response.json();
      
      console.log("📥 Transactions extraites:", data.transactions?.length);
      
      // Vérifier les doublons
      console.log("🔍 Vérification des doublons...");
      const transactionsWithDuplicateCheck = await checkDuplicates(data.transactions || []);
      
      const duplicateCount = transactionsWithDuplicateCheck.filter(t => t.isDuplicate).length;
      console.log(`⚠️ ${duplicateCount} doublon(s) détecté(s)`);
      
      // Marquer toutes les transactions comme sélectionnées par défaut (sauf les doublons)
      const transactionsWithSelection = transactionsWithDuplicateCheck.map(t => ({
        ...t,
        selected: !t.isDuplicate, // Décocher automatiquement les doublons
      }));
      
      setTransactions(transactionsWithSelection);
      setStep("review");
    } catch (err: any) {
      console.error("Erreur extraction:", err);
      setError(err.message || "Erreur lors de l'extraction du fichier");
    } finally {
      setLoading(false);
    }
  };

  // Vérifier les doublons en appelant l'API
  const checkDuplicates = async (transactions: Transaction[]) => {
    try {
      console.log(`🔍 Appel API checkDuplicates pour ${transactions.length} transactions`);
      
      const response = await fetch("/.netlify/functions/checkDuplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions }),
      });

      console.log(`📡 Réponse checkDuplicates: ${response.status}`);

      if (!response.ok) {
        console.warn("⚠️ Impossible de vérifier les doublons - statut:", response.status);
        return transactions;
      }

      const data = await response.json();
      console.log("✅ Données reçues:", data);
      return data.transactions || transactions;
    } catch (error) {
      console.warn("Erreur lors de la vérification des doublons:", error);
      return transactions;
    }
  };

  const updateTransaction = (
    index: number,
    field: keyof Transaction,
    value: any
  ) => {
    setTransactions((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const handleImport = async () => {
    // Importer seulement les transactions sélectionnées
    const selectedTransactions = transactions.filter(t => t.selected);
    
    if (selectedTransactions.length === 0) {
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: selectedTransactions.length });

    try {
      // Appeler onImport de manière asynchrone avec progression
      await onImport(selectedTransactions);
      
      // Succès : réinitialiser
      setFile(null);
      setFileFormat(null);
      setTransactions([]);
      setStep("upload");
    } catch (error) {
      console.error("Erreur lors de l'import:", error);
      setError("Erreur lors de l'import des transactions");
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const toggleSelectAll = () => {
    const allNonDuplicatesSelected = transactions
      .filter(t => !t.isDuplicate)
      .every(t => t.selected);
    
    setTransactions(prev =>
      prev.map(t => ({
        ...t,
        selected: t.isDuplicate ? false : !allNonDuplicatesSelected,
      }))
    );
  };

  // Filtrer les transactions selon la recherche
  const filteredTransactions = transactions.filter((t) => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      t.description?.toLowerCase().includes(query) ||
      t.date?.includes(query) ||
      t.amount?.toString().includes(query) ||
      t.suggestedAccount?.toLowerCase().includes(query) ||
      t.suggestedJar?.toLowerCase().includes(query)
    );
  });

  const selectedCount = transactions.filter(t => t.selected).length;
  const duplicateCount = transactions.filter(t => t.isDuplicate).length;

  const handleBack = () => {
    setStep("upload");
    setError(null);
  };

  if (step === "review") {
    return (
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
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
            📋 Révision des transactions
          </h3>
          <button
            onClick={handleBack}
            style={{
              padding: "8px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-body)",
              color: "var(--text-main)",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            ← Retour
          </button>
        </div>

        <p style={{ color: "var(--text-muted)", marginBottom: "12px" }}>
          {transactions.length} transaction(s) détectée(s)
          {duplicateCount > 0 && ` • ${duplicateCount} doublon(s) détecté(s)`}
          {searchQuery && ` • ${filteredTransactions.length} affichée(s)`}
        </p>

        {/* Champ de recherche */}
        <div style={{ marginBottom: "16px" }}>
          <input
            type="text"
            placeholder="🔍 Rechercher une transaction (description, date, montant...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--bg-card)",
              color: "var(--text-main)",
              fontSize: "14px",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            padding: "12px 16px",
            borderRadius: "12px",
            backgroundColor: "rgba(0, 122, 255, 0.1)",
            border: "1px solid rgba(0, 122, 255, 0.2)",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
              color: "var(--text-main)",
            }}
          >
            <input
              type="checkbox"
              checked={transactions.filter(t => !t.isDuplicate).every(t => t.selected)}
              onChange={toggleSelectAll}
              style={{
                width: "18px",
                height: "18px",
                cursor: "pointer",
              }}
            />
            Tout sélectionner / désélectionner
          </label>
          <span
            style={{
              fontSize: "14px",
              fontWeight: "600",
              color: "var(--jar-nec)",
            }}
          >
            {selectedCount} sélectionnée(s)
          </span>
        </div>

        <div
          style={{
            maxHeight: "500px",
            overflowY: "auto",
            marginBottom: "20px",
          }}
        >
          {filteredTransactions.length === 0 && searchQuery && (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              Aucune transaction ne correspond à "{searchQuery}"
            </div>
          )}
          
          {filteredTransactions.map((transaction, index) => {
            // Trouver l'index original pour updateTransaction
            const originalIndex = transactions.indexOf(transaction);
            
            return (
            <div
              key={originalIndex}
              style={{
                padding: "16px",
                marginBottom: "12px",
                borderRadius: "12px",
                border: transaction.isDuplicate
                  ? "2px solid #FF9500"
                  : transaction.selected
                  ? "2px solid var(--jar-nec)"
                  : "1px solid var(--border-color)",
                backgroundColor: transaction.isDuplicate
                  ? "rgba(255, 149, 0, 0.05)"
                  : "var(--bg-body)",
                opacity: transaction.selected || transaction.isDuplicate ? 1 : 0.6,
              }}
            >
              {/* Header avec checkbox */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "12px",
                  paddingBottom: "12px",
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
                <input
                  type="checkbox"
                  checked={transaction.selected || false}
                  disabled={transaction.isDuplicate}
                  onChange={(e) =>
                    updateTransaction(originalIndex, "selected", e.target.checked)
                  }
                  style={{
                    width: "20px",
                    height: "20px",
                    cursor: transaction.isDuplicate ? "not-allowed" : "pointer",
                  }}
                />
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "var(--text-main)",
                    }}
                  >
                    Transaction #{originalIndex + 1}
                  </span>
                  {transaction.isDuplicate && (
                    <div
                      style={{
                        marginTop: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "600",
                          color: "#FF9500",
                          backgroundColor: "rgba(255, 149, 0, 0.1)",
                          padding: "2px 8px",
                          borderRadius: "6px",
                        }}
                      >
                        ⚠️ DOUBLON DÉTECTÉ
                      </span>
                      {transaction.duplicateNote && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--text-muted)",
                          }}
                        >
                          {transaction.duplicateNote}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Date
                  </label>
                  <input
                    type="date"
                    value={transaction.date}
                    onChange={(e) =>
                      updateTransaction(originalIndex, "date", e.target.value)
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--bg-card)",
                      color: "var(--text-main)",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Montant (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={transaction.amount}
                    onChange={(e) =>
                      updateTransaction(
                        index,
                        "amount",
                        parseFloat(e.target.value)
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--bg-card)",
                      color: "var(--text-main)",
                    }}
                  />
                  {transaction.conversionNote && (
                    <div
                      style={{
                        marginTop: "4px",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      💱 {transaction.conversionNote}
                    </div>
                  )}
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Description
                  </label>
                  <input
                    type="text"
                    value={transaction.description}
                    onChange={(e) =>
                      updateTransaction(originalIndex, "description", e.target.value)
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--bg-card)",
                      color: "var(--text-main)",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Jarre
                  </label>
                  <select
                    value={transaction.suggestedJar || ""}
                    onChange={(e) =>
                      updateTransaction(
                        index,
                        "suggestedJar",
                        e.target.value as JarKey
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--bg-card)",
                      color: "var(--text-main)",
                    }}
                  >
                    <option value="">Sélectionner...</option>
                    <option value="NEC">NEC - Nécessités</option>
                    <option value="FFA">FFA - Liberté Financière</option>
                    <option value="LTSS">LTSS - Épargne Long Terme</option>
                    <option value="PLAY">PLAY - Fun / Play</option>
                    <option value="EDUC">EDUC - Éducation</option>
                    <option value="GIFT">GIFT - Don / Gift</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Compte
                  </label>
                  <input
                    type="text"
                    value={transaction.suggestedAccount || ""}
                    onChange={(e) =>
                      updateTransaction(
                        originalIndex,
                        "suggestedAccount",
                        e.target.value
                      )
                    }
                    placeholder="RedotPay, N26, etc."
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--bg-card)",
                      color: "var(--text-main)",
                    }}
                  />
                </div>
              </div>
            </div>
          );
          })}
        </div>

        {/* Message d'import en cours */}
        {importing && (
          <div
            style={{
              padding: "16px",
              marginBottom: "20px",
              borderRadius: "12px",
              backgroundColor: "rgba(52, 199, 89, 0.1)",
              border: "1px solid rgba(52, 199, 89, 0.3)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "16px",
                fontWeight: "600",
                color: "#34C759",
                marginBottom: "8px",
              }}
            >
              ⏳ Import en cours...
            </div>
            <div style={{ fontSize: "14px", color: "var(--text-muted)" }}>
              Veuillez patienter pendant l'enregistrement des transactions
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={handleBack}
            style={{
              flex: 1,
              padding: "14px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-main)",
              fontSize: "16px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleImport}
            disabled={selectedCount === 0 || importing}
            style={{
              flex: 2,
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background:
                (selectedCount === 0 || importing)
                  ? "var(--border-color)"
                  : "linear-gradient(135deg, var(--jar-nec) 0%, #0051d5 100%)",
              color: "white",
              fontSize: "16px",
              fontWeight: "700",
              cursor: (selectedCount === 0 || importing) ? "not-allowed" : "pointer",
              opacity: (selectedCount === 0 || importing) ? 0.5 : 1,
            }}
          >
            {importing ? "⏳ Import en cours..." : `Importer ${selectedCount} transaction(s) sélectionnée(s)`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "var(--bg-card)",
        borderRadius: "20px",
        padding: "24px",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <h3
        style={{
          margin: "0 0 16px",
          fontSize: "20px",
          fontWeight: "700",
          color: "var(--text-main)",
        }}
      >
        📂 Import de transactions
      </h3>

      <p style={{ color: "var(--text-muted)", marginBottom: "20px" }}>
        Importez vos transactions depuis un relevé bancaire ou un fichier
        d'export.
      </p>

      {/* Formats supportés */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            flex: "1 1 150px",
            padding: "12px",
            borderRadius: "12px",
            border: "2px solid var(--border-color)",
            textAlign: "center",
            backgroundColor: "var(--bg-body)",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📄</div>
          <div
            style={{
              fontSize: "14px",
              fontWeight: "600",
              color: "var(--text-main)",
            }}
          >
            PDF
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            RedotPay, N26
          </div>
        </div>

        <div
          style={{
            flex: "1 1 150px",
            padding: "12px",
            borderRadius: "12px",
            border: "2px solid var(--border-color)",
            textAlign: "center",
            backgroundColor: "var(--bg-body)",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📊</div>
          <div
            style={{
              fontSize: "14px",
              fontWeight: "600",
              color: "var(--text-main)",
            }}
          >
            CSV
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Export Excel
          </div>
        </div>

        <div
          style={{
            flex: "1 1 150px",
            padding: "12px",
            borderRadius: "12px",
            border: "2px solid var(--border-color)",
            textAlign: "center",
            backgroundColor: "var(--bg-body)",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📈</div>
          <div
            style={{
              fontSize: "14px",
              fontWeight: "600",
              color: "var(--text-main)",
            }}
          >
            XLSX
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Fichier Excel
          </div>
        </div>
      </div>

      {/* Zone d'upload */}
      <div
        style={{
          border: "2px dashed var(--border-color)",
          borderRadius: "12px",
          padding: "40px 20px",
          textAlign: "center",
          marginBottom: "20px",
          backgroundColor: "var(--bg-body)",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📎</div>
        <input
          type="file"
          accept=".pdf,.csv,.xlsx,.xls"
          onChange={handleFileChange}
          style={{ display: "none" }}
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            borderRadius: "12px",
            background:
              "linear-gradient(135deg, var(--jar-nec) 0%, #0051d5 100%)",
            color: "white",
            fontSize: "16px",
            fontWeight: "600",
            cursor: "pointer",
            marginBottom: "12px",
          }}
        >
          Choisir un fichier
        </label>
        {file && (
          <div style={{ marginTop: "12px" }}>
            <p style={{ color: "var(--text-main)", margin: "0 0 8px" }}>
              ✅ {file.name}
            </p>
            <div
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: "8px",
                backgroundColor: "rgba(0, 122, 255, 0.1)",
                color: "var(--jar-nec)",
                fontSize: "12px",
                fontWeight: "600",
                textTransform: "uppercase",
              }}
            >
              {fileFormat}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "12px",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "#ef4444",
            marginBottom: "20px",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      <button
        onClick={extractTransactions}
        disabled={!file || loading}
        style={{
          width: "100%",
          padding: "16px",
          borderRadius: "12px",
          border: "none",
          background:
            !file || loading
              ? "var(--border-color)"
              : "linear-gradient(135deg, #34C759 0%, #28a745 100%)",
          color: "white",
          fontSize: "16px",
          fontWeight: "700",
          cursor: !file || loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Extraction en cours..." : "Extraire les transactions"}
      </button>

      <div
        style={{
          marginTop: "20px",
          padding: "16px",
          borderRadius: "12px",
          backgroundColor: "rgba(0, 122, 255, 0.1)",
          border: "1px solid rgba(0, 122, 255, 0.2)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          <strong>📌 Formats acceptés :</strong> PDF (RedotPay, N26), CSV
          (séparateur virgule ou point-virgule), XLSX (Excel). Les transactions
          seront détectées automatiquement et vous pourrez les réviser avant
          l'import final.
        </p>
      </div>
    </div>
  );
};
