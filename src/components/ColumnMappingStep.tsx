import React from "react";

interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string;
  confidence: number;
}

interface ColumnMappingStepProps {
  headers: string[];
  preview: any[];
  suggestedMappings: ColumnMapping[];
  onMappingChange: (mappings: ColumnMapping[]) => void;
  onBack: () => void;
  onContinue: () => void;
  type?: "spending" | "revenue"; // Ajouter le type
}

// Colonnes pour les dépenses
const SPENDING_COLUMNS = [
  { value: "Date", label: "📅 Date", required: true },
  { value: "Description", label: "📝 Description", required: true },
  { value: "Amount", label: "💰 Montant", required: true },
  { value: "Jar", label: "🏺 Jarre", required: false },
  { value: "Account", label: "🏦 Compte", required: false },
  { value: "Currency", label: "💱 Devise", required: false },
  { value: "ignore", label: "❌ Ignorer", required: false },
];

// Colonnes pour les revenus (selon onglet Revenues du Google Sheet)
// Note: Source n'est pas dans la liste car il est auto-rempli avec le nom du compte
const REVENUE_COLUMNS = [
  { value: "Date", label: "📅 Date", required: true },
  { value: "Montant", label: "💰 Montant", required: true },
  { value: "Valeur", label: "💵 Valeur (devise)", required: false },
  { value: "QuantiteCrypto", label: "🪙 Quantité Crypto", required: false },
  { value: "Methode", label: "🔄 Méthode", required: false },
  { value: "TauxUSDEUR", label: "📊 Taux USD/EUR", required: false },
  { value: "AdresseCrypto", label: "🔐 Adresse crypto", required: false },
  { value: "CompteDestination", label: "🏦 Compte de destination", required: false },
  { value: "Type", label: "🏷️ Type", required: false },
  { value: "ignore", label: "❌ Ignorer", required: false },
];

export const ColumnMappingStep: React.FC<ColumnMappingStepProps> = ({
  headers,
  preview,
  suggestedMappings,
  onMappingChange,
  onBack,
  onContinue,
  type = "spending", // Par défaut : dépenses
}) => {
  const [mappings, setMappings] = React.useState<ColumnMapping[]>(suggestedMappings);
  
  // Choisir les bonnes colonnes selon le type
  const TARGET_COLUMNS = type === "revenue" ? REVENUE_COLUMNS : SPENDING_COLUMNS;

  const handleMappingChange = (sourceColumn: string, targetColumn: string) => {
    const newMappings = mappings.map(m =>
      m.sourceColumn === sourceColumn
        ? { ...m, targetColumn, confidence: targetColumn === "ignore" ? 1 : m.confidence }
        : m
    );
    setMappings(newMappings);
    onMappingChange(newMappings);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "#34C759"; // Vert
    if (confidence >= 0.7) return "#FF9500"; // Orange
    return "#FF3B30"; // Rouge
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.9) return "Très confiant";
    if (confidence >= 0.7) return "Confiant";
    return "Peu confiant";
  };

  // Vérifier que les colonnes requises sont mappées
  const requiredMappings = type === "revenue" 
    ? ["Date", "Montant"]  // Pour les revenus : seulement Date et Montant (Source = nom du compte)
    : ["Date", "Description", "Amount"];  // Pour les dépenses
  const mappedTargets = mappings.map(m => m.targetColumn);
  const allRequiredMapped = requiredMappings.every(req => mappedTargets.includes(req));

  return (
    <div style={{ 
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: "20px",
      paddingBottom: "0",
    }}>
      {/* Zone scrollable */}
      <div style={{ 
        flex: 1,
        overflowY: "auto",
        paddingBottom: "16px",
        minHeight: 0,
      }}>
        {/* Header */}
        <div style={{ marginBottom: "20px" }}>
          <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "700", color: "var(--text-main)" }}>
            📊 Correspondance des colonnes
          </h2>
          <p style={{ margin: "8px 0 0 0", color: "var(--text-muted)" }}>
            {headers.length} colonne(s) détectée(s) • {preview.length} lignes de prévisualisation
          </p>
        </div>

        {/* Info box */}
        {!allRequiredMapped && (
          <div
            style={{
              padding: "12px 16px",
              marginBottom: "20px",
              borderRadius: "12px",
              backgroundColor: "rgba(255, 149, 0, 0.1)",
              border: "1px solid rgba(255, 149, 0, 0.3)",
              color: "#FF9500",
              fontSize: "14px",
            }}
          >
            ⚠️ Les colonnes {type === "revenue" ? "Date et Montant" : "Date, Description et Montant"} sont obligatoires
          </div>
        )}

        {/* Mappings */}
        <div style={{ marginBottom: "20px" }}>
          {mappings.map((mapping, index) => (
            <div
              key={index}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                gap: "12px",
                alignItems: "center",
                padding: "16px",
                marginBottom: "12px",
                borderRadius: "12px",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-card)",
              }}
            >
              {/* Source column */}
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                  Colonne du fichier
                </div>
                <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-main)" }}>
                  {mapping.sourceColumn}
                </div>
                {mapping.confidence < 1 && (
                  <div
                    style={{
                      fontSize: "11px",
                      marginTop: "4px",
                      color: getConfidenceColor(mapping.confidence),
                    }}
                  >
                    ● {getConfidenceLabel(mapping.confidence)} ({Math.round(mapping.confidence * 100)}%)
                  </div>
                )}
              </div>

              {/* Arrow */}
              <div style={{ fontSize: "20px", color: "var(--text-muted)" }}>→</div>

              {/* Target column */}
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                  Colonne Google Sheets
                </div>
                <select
                  value={mapping.targetColumn}
                  onChange={(e) => handleMappingChange(mapping.sourceColumn, e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-body)",
                    color: "var(--text-main)",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  {TARGET_COLUMNS.map((target) => (
                    <option key={target.value} value={target.value}>
                      {target.label}
                      {target.required ? " *" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        {/* Preview */}
        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", marginBottom: "12px" }}>
            📋 Aperçu (5 premières lignes)
          </h3>
          <div
            style={{
              overflowX: "auto",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "var(--bg-card)" }}>
                  {headers.map((header, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        fontWeight: "600",
                        color: "var(--text-main)",
                        borderBottom: "2px solid var(--border-color)",
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    style={{
                      backgroundColor: rowIndex % 2 === 0 ? "var(--bg-body)" : "var(--bg-card)",
                    }}
                  >
                    {headers.map((header, colIndex) => (
                      <td
                        key={colIndex}
                        style={{
                          padding: "12px",
                          color: "var(--text-main)",
                          borderBottom: "1px solid var(--border-color)",
                        }}
                      >
                        {String(row[header] || "").substring(0, 50)}
                        {String(row[header] || "").length > 50 ? "..." : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Actions - Sticky en bas */}
      <div style={{
        flexShrink: 0,
        padding: "16px 20px",
        margin: "0 -20px",
        backgroundColor: "var(--bg-body)",
        borderTop: "1px solid var(--border-color)",
      }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={onBack}
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
            ← Retour
          </button>
          <button
            onClick={onContinue}
            disabled={!allRequiredMapped}
            style={{
              flex: 2,
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background: allRequiredMapped
                ? "linear-gradient(135deg, var(--jar-nec) 0%, #0051d5 100%)"
                : "var(--border-color)",
              color: "white",
              fontSize: "16px",
              fontWeight: "700",
              cursor: allRequiredMapped ? "pointer" : "not-allowed",
              opacity: allRequiredMapped ? 1 : 0.5,
            }}
          >
            Continuer →
          </button>
        </div>
      </div>
    </div>
  );
};
