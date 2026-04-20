// src/components/NewColumnMappingStep.tsx
import React, { useMemo, useState } from "react";
import { JarKey } from "../types";
import { loadTags, Tag } from "../tagsUtils";

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

  const [mappings, setMappings] = useState<ColumnMapping[]>(initialMappings);
  /** Tags : saisie libre si la valeur n’est pas un id prédéfini */
  const [tagsFixedManual, setTagsFixedManual] = useState(() => {
    const tagM = initialMappings.find((m) => m.googleSheetColumn === "Tags")?.option;
    return !!(tagM?.type === "fixed" && tagM.value && !tagIds.has(tagM.value));
  });

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

                <div className="import-mapping-controls">
                  <div className="import-mapping-radios">
                    <label className="import-mapping-radio">
                      <input
                        type="radio"
                        name={`mapping-${googleColumn}`}
                        checked={mapping.type === "empty"}
                        onChange={() => {
                          updateMapping(googleColumn, { type: "empty" });
                          if (googleColumn === "Tags") setTagsFixedManual(false);
                        }}
                      />
                      <span>Vide</span>
                    </label>
                    <label className="import-mapping-radio">
                      <input
                        type="radio"
                        name={`mapping-${googleColumn}`}
                        checked={mapping.type === "column"}
                        onChange={() => {
                          updateMapping(googleColumn, {
                            type: "column",
                            value: detectedColumns[0] || "",
                          });
                          if (googleColumn === "Tags") setTagsFixedManual(false);
                        }}
                      />
                      <span>Colonne</span>
                    </label>
                    <label className="import-mapping-radio">
                      <input
                        type="radio"
                        name={`mapping-${googleColumn}`}
                        checked={mapping.type === "fixed"}
                        onChange={() => {
                          if (googleColumn === "Jar") {
                            updateMapping(googleColumn, { type: "fixed", value: "NEC" });
                          } else if (googleColumn === "Tags") {
                            updateMapping(googleColumn, { type: "fixed", value: "" });
                            setTagsFixedManual(false);
                          } else {
                            updateMapping(googleColumn, { type: "fixed", value: "" });
                          }
                        }}
                      />
                      <span>Fixe</span>
                    </label>
                  </div>

                  {mapping.type === "column" && (
                    <select
                      className="import-mapping-select"
                      value={mapping.value || ""}
                      onChange={(e) =>
                        updateMapping(googleColumn, {
                          type: "column",
                          value: e.target.value,
                        })
                      }
                    >
                      <option value="">— Colonne —</option>
                      {detectedColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  )}

                  {mapping.type === "fixed" && renderFixedControl(googleColumn, mapping)}

                  {mapping.type === "column" && mapping.value && (
                    <div className="import-mapping-hint import-mapping-hint--muted">
                      → <strong>{mapping.value}</strong>
                    </div>
                  )}
                  {mapping.type === "fixed" &&
                    mapping.value &&
                    googleColumn !== "Tags" &&
                    googleColumn !== "Jar" && (
                      <div className="import-mapping-hint import-mapping-hint--ok">
                        ✓ « {mapping.value} »
                      </div>
                    )}
                  {mapping.type === "fixed" && googleColumn === "Tags" && !tagsFixedManual && mapping.value && (
                    <div className="import-mapping-hint import-mapping-hint--ok">
                      ✓ Tag : {tags.find((t) => t.id === mapping.value)?.name ?? mapping.value}
                    </div>
                  )}
                  {mapping.type === "fixed" && googleColumn === "Tags" && tagsFixedManual && mapping.value && (
                    <div className="import-mapping-hint import-mapping-hint--ok">✓ {mapping.value}</div>
                  )}
                </div>
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

              const isDateMapped = dateMapping.type !== "empty" && dateMapping.value;
              const isMontantMapped = montantMapping.type !== "empty" && montantMapping.value;

              if (!isDateMapped || !isMontantMapped) {
                alert("⚠️ Les champs Date et Montant sont obligatoires !");
                return;
              }

              onContinue(mappings);
            }}
          >
            Continuer →
          </button>
        </div>
      </footer>
    </div>
  );
};
