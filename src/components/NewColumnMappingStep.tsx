// src/components/NewColumnMappingStep.tsx
import React, { useState } from "react";
import { loadTags } from "../tagsUtils";

interface MappingOption {
  type: "empty" | "column" | "fixed";
  value?: string;
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
  defaultSource?: string;
}

const JAR_OPTIONS: { key: JarKey; label: string }[] = [
  { key: "NEC", label: "NEC — Nécessités" },
  { key: "FFA", label: "FFA — Liberté financière" },
  { key: "LTSS", label: "LTSS — Épargne long terme" },
  { key: "PLAY", label: "PLAY — Loisirs" },
  { key: "EDUC", label: "EDUC — Éducation" },
  { key: "GIFT", label: "GIFT — Don / cadeau" },
];

export const NewColumnMappingStep: React.FC<NewColumnMappingStepProps> = ({
  detectedColumns,
  onContinue,
  onBack,
  transactionType,
  defaultSource,
}) => {
  const googleSheetColumns = useMemo(
    () =>
      transactionType === "revenue"
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
            "Tags",
          ]
        : ["Date", "Description", "Montant", "Devise", "Compte", "Jar", "Tags"],
    [transactionType]
  );

  const tags: Tag[] = useMemo(() => loadTags(), []);
  const tagIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);

  const initialMappings: ColumnMapping[] = useMemo(() => {
    return googleSheetColumns.map((col) => {
      if (col === "Source" && defaultSource) {
        return { googleSheetColumn: col, option: { type: "fixed", value: defaultSource } };
      }
      if (col === "Compte" && defaultSource) {
        return { googleSheetColumn: col, option: { type: "fixed", value: defaultSource } };
      }
      if (col === "Devise" && detectedColumns.includes("Currency")) {
        return { googleSheetColumn: col, option: { type: "column", value: "Currency" } };
      }
      return { googleSheetColumn: col, option: { type: "empty" } };
    });
  }, [googleSheetColumns, defaultSource, detectedColumns]);

  // Fingerprint des colonnes détectées pour mémoriser le mapping
  const columnFingerprint = [...detectedColumns].sort().join(",");
  const MAPPING_CACHE_KEY = `mjars:colmapping:${transactionType}:${columnFingerprint}`;

  const [mappings, setMappings] = useState<ColumnMapping[]>(() => {
    try {
      const saved = localStorage.getItem(MAPPING_CACHE_KEY);
      if (saved) {
        const savedMappings: ColumnMapping[] = JSON.parse(saved);
        // Restaurer uniquement si toutes les colonnes GSheets correspondent
        if (savedMappings.length === googleSheetColumns.length &&
            savedMappings.every((m, i) => m.googleSheetColumn === googleSheetColumns[i])) {
          return savedMappings.map((saved, i) => {
            // Vérifier que les colonnes référencées existent encore dans le fichier
            if (saved.option.type === "column" && saved.option.value &&
                !detectedColumns.includes(saved.option.value)) {
              return initialMappings[i];
            }
            return saved;
          });
        }
      }
    } catch {}
    return initialMappings;
  });
  const [showFixedValueInput, setShowFixedValueInput] = useState<string | null>(null);

  const availableTags = loadTags();

  const JAR_OPTIONS = [
    { key: "NEC", label: "🏺 NEC — Nécessités" },
    { key: "FFA", label: "🌱 FFA — Liberté Financière" },
    { key: "LTSS", label: "🏦 LTSS — Épargne Long Terme" },
    { key: "PLAY", label: "🎮 PLAY — Fun / Play" },
    { key: "EDUC", label: "📚 EDUC — Éducation" },
    { key: "GIFT", label: "🎁 GIFT — Don / Gift" },
  ];

  const updateMapping = (googleColumn: string, option: MappingOption) => {
    setMappings((prev) =>
      prev.map((m) => (m.googleSheetColumn === googleColumn ? { ...m, option } : m))
    );
  };

  const getMappingForColumn = (googleColumn: string): MappingOption => {
    return mappings.find((m) => m.googleSheetColumn === googleColumn)?.option || { type: "empty" };
  };

  const renderFixedControl = (googleColumn: string, mapping: MappingOption) => {
    if (mapping.type !== "fixed") return null;

    if (googleColumn === "Jar") {
      return (
        <select
          className="import-mapping-select"
          value={mapping.value && JAR_OPTIONS.some((j) => j.key === mapping.value) ? mapping.value : "NEC"}
          onChange={(e) =>
            updateMapping(googleColumn, {
              type: "fixed",
              value: e.target.value as JarKey,
            })
          }
        >
          {JAR_OPTIONS.map((j) => (
            <option key={j.key} value={j.key}>
              {j.label}
            </option>
          ))}
        </select>
      );
    }

    if (googleColumn === "Tags") {
      const v = mapping.value || "";
      const selectVal = tagsFixedManual ? "__manual__" : v;

      return (
        <div className="import-mapping-fixed-stack">
          <select
            className="import-mapping-select"
            value={selectVal}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__manual__") {
                setTagsFixedManual(true);
                updateMapping("Tags", { type: "fixed", value: "" });
              } else {
                setTagsFixedManual(false);
                updateMapping("Tags", { type: "fixed", value: val });
              }
            }}
          >
            <option value="">— Aucun tag fixe —</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.name}
              </option>
            ))}
            <option value="__manual__">Autre (saisie libre)…</option>
          </select>
          {tagsFixedManual && (
            <input
              type="text"
              className="import-mapping-input"
              value={v}
              onChange={(e) => updateMapping("Tags", { type: "fixed", value: e.target.value })}
              placeholder="ex. vie_quotidienne, transport"
            />
          )}
        </div>
      );
    }

    return (
      <input
        type="text"
        className="import-mapping-input"
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
                : "Entrez une valeur…"
        }
      />
    );
  };

  return (
    <div className="import-mapping-step">
      <header className="import-mapping-step-header">
        <h2 className="import-mapping-step-title">🗂️ Configuration du mapping</h2>
        <p className="import-mapping-step-sub">
          Pour chaque champ, choisissez : vide, une colonne du fichier, ou une valeur fixe (listes Jar / Tags
          depuis les réglages).
        </p>
      </header>

      <div className="import-mapping-step-scroll">
        <div className="import-mapping-table">
          <div className="import-mapping-table-head">
            <div className="import-mapping-col-label">Champ feuille</div>
            <div className="import-mapping-col-map">Colonne fichier ou valeur fixe</div>
          </div>

          {googleSheetColumns.map((googleColumn, index) => {
            const mapping = getMappingForColumn(googleColumn);

            return (
              <div
                key={googleColumn}
                className={`import-mapping-row ${index < googleSheetColumns.length - 1 ? "import-mapping-row--border" : ""}`}
              >
                <div className="import-mapping-field-name">
                  {googleColumn}
                  {(googleColumn === "Date" || googleColumn === "Montant") && (
                    <span className="import-mapping-required">*</span>
                  )}
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

                {/* Input pour valeur fixe — adapté selon la colonne */}
                {mapping.type === "fixed" && googleColumn === "Jar" && (
                  <select
                    value={mapping.value || ""}
                    onChange={(e) =>
                      updateMapping(googleColumn, { type: "fixed", value: e.target.value })
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
                    <option value="">-- Choisir une jarre --</option>
                    {JAR_OPTIONS.map((j) => (
                      <option key={j.key} value={j.key}>{j.label}</option>
                    ))}
                  </select>
                )}

                {mapping.type === "fixed" && googleColumn === "Tags" && (
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-body)",
                  }}>
                    {availableTags.map((tag) => {
                      const selectedIds = (mapping.value || "").split(",").filter(Boolean);
                      const isSelected = selectedIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            const next = isSelected
                              ? selectedIds.filter((id) => id !== tag.id)
                              : [...selectedIds, tag.id];
                            updateMapping(googleColumn, { type: "fixed", value: next.join(",") });
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            borderRadius: "20px",
                            border: `2px solid ${isSelected ? tag.color : "var(--border-color)"}`,
                            backgroundColor: isSelected ? `${tag.color}22` : "var(--bg-card)",
                            color: isSelected ? tag.color : "var(--text-muted)",
                            fontSize: "13px",
                            fontWeight: isSelected ? "700" : "500",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span>{tag.emoji}</span>
                          <span>{tag.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {mapping.type === "fixed" && googleColumn !== "Jar" && googleColumn !== "Tags" && (
                  <input
                    type="text"
                    value={mapping.value || ""}
                    onChange={(e) =>
                      updateMapping(googleColumn, { type: "fixed", value: e.target.value })
                    }
                    placeholder={
                      googleColumn === "Source" ? "Ex: LGMCorp Fabien"
                      : googleColumn === "Valeur" ? "Ex: USD"
                      : googleColumn === "Type" ? "Ex: Passive Income"
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
                {mapping.type === "fixed" && mapping.value && googleColumn !== "Tags" && (
                  <div style={{ fontSize: "13px", color: "#34C759", fontWeight: "500" }}>
                    ✓ Valeur fixe : <strong>"{mapping.value}"</strong>
                  </div>
                )}
                {mapping.type === "fixed" && googleColumn === "Tags" && mapping.value && (
                  <div style={{ fontSize: "13px", color: "#34C759", fontWeight: "500" }}>
                    ✓ {mapping.value.split(",").filter(Boolean).length} tag(s) sélectionné(s)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="import-mapping-step-footer">
        <div className="import-mapping-warning">
          <strong>Champs obligatoires :</strong> Date et Montant (colonne ou valeur fixe).
        </div>
        <div className="import-mapping-actions">
          <button type="button" className="import-mapping-btn import-mapping-btn-secondary" onClick={onBack}>
            ← Retour
          </button>
          <button
            type="button"
            className="import-mapping-btn import-mapping-btn-primary"
            onClick={() => {
              const dateMapping = getMappingForColumn("Date");
              const montantMapping = getMappingForColumn("Montant");

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
            const dateMapping = getMappingForColumn("Date");
            const montantMapping = getMappingForColumn("Montant");

              if (!isDateMapped || !isMontantMapped) {
                alert("⚠️ Les champs Date et Montant sont obligatoires !");
                return;
              }

            if (!isDateMapped || !isMontantMapped) {
              alert("⚠️ Les champs Date et Montant sont obligatoires !");
              return;
            }

            // Mémoriser le mapping pour la prochaine fois
            try { localStorage.setItem(MAPPING_CACHE_KEY, JSON.stringify(mappings)); } catch {}

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
