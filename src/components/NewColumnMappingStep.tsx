// src/components/NewColumnMappingStep.tsx
import React, { useState } from "react";

interface MappingOption {
  type: "empty" | "column" | "fixed";
  value?: string; // Nom de la colonne source OU valeur fixe
}

interface ColumnMapping {
  googleSheetColumn: string;
  option: MappingOption;
}

interface NewColumnMappingStepProps {
  detectedColumns: string[];
  onContinue: (mappings: ColumnMapping[]) => void;
  onBack: () => void;
  transactionType: "spending" | "revenue";
  defaultSource?: string; // Source pré-sélectionnée à l'étape précédente
}

export const NewColumnMappingStep: React.FC<NewColumnMappingStepProps> = ({
  detectedColumns,
  onContinue,
  onBack,
  transactionType,
  defaultSource,
}) => {
  // Colonnes Google Sheets selon le type
  const googleSheetColumns = transactionType === "revenue" 
    ? [
        "Date",
        "Source",
        "Montant",
        "Valeur",
        "Quantité Crypto",
        "Méthode",
        "Taux USD/EUR",
        "Adresse crypto",
        "Compte de destination",
        "Type",
        "Tags"
      ]
    : [
        "Date",
        "Description",
        "Montant",
        "Devise",
        "Compte",
        "Jar",
        "Tags"
      ];

  // État initial : colonnes pré-remplies avec la valeur fixe du compte/source sélectionné à l'étape précédente
  const initialMappings: ColumnMapping[] = googleSheetColumns.map(col => {
    // Revenus : "Source" = source sélectionnée
    if (col === "Source" && defaultSource) {
      return {
        googleSheetColumn: col,
        option: { type: "fixed", value: defaultSource }
      };
    }
    // Dépenses : "Compte" = compte de dépense sélectionné
    if (col === "Compte" && defaultSource) {
      return {
        googleSheetColumn: col,
        option: { type: "fixed", value: defaultSource }
      };
    }
    // Dépenses : "Devise" = auto-suggestion si le fichier a une colonne Currency (ex. PDF)
    if (col === "Devise" && detectedColumns.includes("Currency")) {
      return {
        googleSheetColumn: col,
        option: { type: "column", value: "Currency" }
      };
    }
    return {
      googleSheetColumn: col,
      option: { type: "empty" }
    };
  });

  const [mappings, setMappings] = useState<ColumnMapping[]>(initialMappings);
  const [showFixedValueInput, setShowFixedValueInput] = useState<string | null>(null);

  const updateMapping = (googleColumn: string, option: MappingOption) => {
    setMappings(prev =>
      prev.map(m =>
        m.googleSheetColumn === googleColumn
          ? { ...m, option }
          : m
      )
    );
  };

  const getMappingForColumn = (googleColumn: string) => {
    return mappings.find(m => m.googleSheetColumn === googleColumn)?.option || { type: "empty" };
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <div
        style={{
          marginBottom: "32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "var(--text-main)",
              margin: "0 0 8px 0",
            }}
          >
            🗂️ Configuration du mapping
          </h2>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>
            Pour chaque champ Google Sheets, choisissez : laisser vide, mapper une colonne du fichier, ou entrer une valeur fixe
          </p>
        </div>
      </div>

      {/* Table de mapping */}
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          borderRadius: "16px",
          border: "1px solid var(--border-color)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "300px 1fr",
            gap: "16px",
            padding: "16px 24px",
            backgroundColor: "var(--bg-body)",
            borderBottom: "1px solid var(--border-color)",
            fontWeight: "700",
            fontSize: "14px",
            color: "var(--text-main)",
          }}
        >
          <div>📋 Colonne Google Sheet</div>
          <div>🔗 Colonne du fichier ou valeur fixe</div>
        </div>

        {/* Rows */}
        {googleSheetColumns.map((googleColumn, index) => {
          const mapping = getMappingForColumn(googleColumn);
          const isFixedInputVisible = showFixedValueInput === googleColumn;

          return (
            <div
              key={googleColumn}
              style={{
                display: "grid",
                gridTemplateColumns: "300px 1fr",
                gap: "16px",
                padding: "20px 24px",
                borderBottom:
                  index < googleSheetColumns.length - 1
                    ? "1px solid var(--border-color)"
                    : "none",
                alignItems: "center",
              }}
            >
              {/* Colonne Google Sheets */}
              <div
                style={{
                  fontWeight: "600",
                  fontSize: "15px",
                  color: "var(--text-main)",
                }}
              >
                {googleColumn}
                {(googleColumn === "Date" || googleColumn === "Montant") && (
                  <span style={{ color: "#FF3B30", marginLeft: "4px" }}>*</span>
                )}
              </div>

              {/* Options */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Radio buttons */}
                <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                  {/* Option 1 : Laisser vide */}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    <input
                      type="radio"
                      name={`mapping-${googleColumn}`}
                      checked={mapping.type === "empty"}
                      onChange={() => {
                        updateMapping(googleColumn, { type: "empty" });
                        setShowFixedValueInput(null);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ color: "var(--text-muted)" }}>Laisser vide</span>
                  </label>

                  {/* Option 2 : Mapper une colonne */}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    <input
                      type="radio"
                      name={`mapping-${googleColumn}`}
                      checked={mapping.type === "column"}
                      onChange={() => {
                        // Par défaut, sélectionner la première colonne
                        updateMapping(googleColumn, {
                          type: "column",
                          value: detectedColumns[0] || "",
                        });
                        setShowFixedValueInput(null);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ color: "var(--text-main)", fontWeight: "500" }}>
                      Utiliser une colonne
                    </span>
                  </label>

                  {/* Option 3 : Valeur fixe */}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    <input
                      type="radio"
                      name={`mapping-${googleColumn}`}
                      checked={mapping.type === "fixed"}
                      onChange={() => {
                        updateMapping(googleColumn, {
                          type: "fixed",
                          value: "",
                        });
                        setShowFixedValueInput(googleColumn);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ color: "var(--text-main)", fontWeight: "500" }}>
                      Valeur fixe
                    </span>
                  </label>
                </div>

                {/* Dropdown pour sélectionner la colonne */}
                {mapping.type === "column" && (
                  <select
                    value={mapping.value || ""}
                    onChange={(e) =>
                      updateMapping(googleColumn, {
                        type: "column",
                        value: e.target.value,
                      })
                    }
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--bg-body)",
                      color: "var(--text-main)",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">-- Sélectionnez une colonne --</option>
                    {detectedColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                )}

                {/* Input pour valeur fixe */}
                {mapping.type === "fixed" && (
                  <input
                    type="text"
                    value={mapping.value || ""}
                    onChange={(e) =>
                      updateMapping(googleColumn, {
                        type: "fixed",
                        value: e.target.value,
                      })
                    }
                    placeholder={
                      googleColumn === "Source"
                        ? "Ex: LGMCorp Fabien"
                        : googleColumn === "Valeur"
                        ? "Ex: USD"
                        : googleColumn === "Type"
                        ? "Ex: Passive Income"
                        : "Entrez une valeur..."
                    }
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--bg-body)",
                      color: "var(--text-main)",
                      fontSize: "14px",
                    }}
                  />
                )}

                {/* Affichage de la valeur actuelle */}
                {mapping.type === "column" && mapping.value && (
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    ✓ Mappé sur : <strong>{mapping.value}</strong>
                  </div>
                )}
                {mapping.type === "fixed" && mapping.value && (
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#34C759",
                      fontWeight: "500",
                    }}
                  >
                    ✓ Valeur fixe : <strong>"{mapping.value}"</strong>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Validation */}
      <div
        style={{
          marginTop: "24px",
          padding: "16px",
          backgroundColor: "rgba(255, 149, 0, 0.1)",
          border: "1px solid rgba(255, 149, 0, 0.3)",
          borderRadius: "12px",
          fontSize: "14px",
          color: "var(--text-main)",
        }}
      >
        <strong>⚠️ Champs obligatoires :</strong> Date et Montant doivent être mappés (soit via une colonne, soit via une valeur fixe)
      </div>

      {/* Buttons */}
      <div
        style={{
          marginTop: "32px",
          display: "flex",
          gap: "16px",
          justifyContent: "flex-end",
        }}
      >
        <button
          onClick={onBack}
          style={{
            padding: "14px 32px",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-body)",
            color: "var(--text-main)",
            fontSize: "15px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          ← Retour
        </button>
        <button
          onClick={() => {
            // Validation : Date et Montant doivent être mappés
            const dateMapping = getMappingForColumn("Date");
            const montantMapping = getMappingForColumn("Montant");

            const isDateMapped = dateMapping.type !== "empty" && dateMapping.value;
            const isMontantMapped = montantMapping.type !== "empty" && montantMapping.value;

            if (!isDateMapped || !isMontantMapped) {
              alert("⚠️ Les champs Date et Montant sont obligatoires !");
              return;
            }

            onContinue(mappings);
          }}
          style={{
            padding: "14px 32px",
            borderRadius: "12px",
            border: "none",
            background: "linear-gradient(135deg, #007AFF 0%, #0051D5 100%)",
            color: "white",
            fontSize: "15px",
            fontWeight: "700",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0, 122, 255, 0.3)",
          }}
        >
          Continuer →
        </button>
      </div>
    </div>
  );
};
