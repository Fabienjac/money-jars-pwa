// src/components/NewColumnMappingStep.tsx
import React, { useState, useEffect, useRef } from "react";
import { loadTags } from "../tagsUtils";
import { fetchColumnMappings, saveColumnMappingToSheet } from "../api";

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

  // Clé de cache : type + banque/source + fingerprint des colonnes détectées
  // → chaque banque a son propre mapping mémorisé
  const columnFingerprint = [...detectedColumns].sort().join(",");
  const bankSlug = (defaultSource || "default").toLowerCase().replace(/\s+/g, "_");
  const MAPPING_CACHE_KEY = `mjars:colmapping:${transactionType}:${bankSlug}:${columnFingerprint}`;

  const [restoredFromCache, setRestoredFromCache] = useState(false);
  // Ref pour savoir si localStorage avait déjà un mapping (synchrone, avant l'effet)
  const hasLocalCache = useRef(false);

  const [mappings, setMappings] = useState<ColumnMapping[]>(() => {
    try {
      const saved = localStorage.getItem(MAPPING_CACHE_KEY);
      if (saved) {
        const savedMappings: ColumnMapping[] = JSON.parse(saved);
        if (savedMappings.length === googleSheetColumns.length &&
            savedMappings.every((m, i) => m.googleSheetColumn === googleSheetColumns[i])) {
          const restored = savedMappings.map((s, i) => {
            const col = s.googleSheetColumn;
            const isAccountField =
              (transactionType === "spending" && col === "Compte") ||
              (transactionType === "revenue" && (col === "Source" || col === "Compte de destination"));
            if (isAccountField && defaultSource) {
              return { ...s, option: { type: "fixed" as const, value: defaultSource } };
            }
            if (s.option.type === "column" && s.option.value &&
                !detectedColumns.includes(s.option.value)) {
              return initialMappings[i];
            }
            return s;
          });
          hasLocalCache.current = true;
          setTimeout(() => setRestoredFromCache(true), 0);
          return restored;
        }
      }
    } catch {}
    return initialMappings;
  });

  // Si localStorage n'avait rien → chercher dans Google Sheets
  useEffect(() => {
    if (hasLocalCache.current) return; // localStorage suffit

    fetchColumnMappings().then(allMappings => {
      const saved = allMappings[MAPPING_CACHE_KEY];
      if (!saved || !Array.isArray(saved)) return;
      const savedMappings = saved as ColumnMapping[];
      if (savedMappings.length !== googleSheetColumns.length) return;
      if (!savedMappings.every((m, i) => m.googleSheetColumn === googleSheetColumns[i])) return;

      const restored = savedMappings.map((s, i) => {
        const col = s.googleSheetColumn;
        const isAccountField =
          (transactionType === "spending" && col === "Compte") ||
          (transactionType === "revenue" && (col === "Source" || col === "Compte de destination"));
        if (isAccountField && defaultSource) {
          return { ...s, option: { type: "fixed" as const, value: defaultSource } };
        }
        if (s.option.type === "column" && s.option.value &&
            !detectedColumns.includes(s.option.value)) {
          return initialMappings[i];
        }
        return s;
      });

      setMappings(restored);
      setRestoredFromCache(true);
      // Mettre en cache localStorage pour les prochains imports sur cet appareil
      try { localStorage.setItem(MAPPING_CACHE_KEY, JSON.stringify(restored)); } catch {}
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Segmented control : sélecteur de type de mapping (Vide / Colonne / Fixe)
  const renderTypeSelector = (googleColumn: string, mapping: MappingOption) => {
    const options: { type: MappingOption["type"]; label: string }[] = [
      { type: "empty",  label: "Vide" },
      { type: "column", label: "Colonne" },
      { type: "fixed",  label: "Valeur fixe" },
    ];
    return (
      <div style={{ display: "flex", background: "rgba(116,116,128,0.12)", borderRadius: 8, padding: 2 }}>
        {options.map(opt => (
          <button
            key={opt.type}
            type="button"
            onClick={() => {
              if (opt.type === "column") {
                updateMapping(googleColumn, { type: "column", value: detectedColumns[0] || "" });
              } else if (opt.type === "fixed") {
                updateMapping(googleColumn, { type: "fixed", value: mapping.type === "fixed" ? (mapping.value || "") : "" });
                setShowFixedValueInput(googleColumn);
              } else {
                updateMapping(googleColumn, { type: "empty" });
                setShowFixedValueInput(null);
              }
            }}
            style={{
              flex: 1,
              padding: "7px 4px",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
              background: mapping.type === opt.type ? "var(--bg-card)" : "transparent",
              color: mapping.type === opt.type ? "var(--text-main)" : "var(--text-muted)",
              boxShadow: mapping.type === opt.type ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1.5px solid var(--border-color)",
    backgroundColor: "var(--bg-card)",
    color: "var(--text-main)",
    fontSize: 14,
    cursor: "pointer",
    boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-main)", margin: "0 0 6px 0" }}>
          🗂️ Configuration du mapping
        </h2>
        <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 13, lineHeight: 1.4 }}>
          Pour chaque champ, choisissez : laisser vide, mapper une colonne du fichier, ou entrer une valeur fixe.
        </p>
        {restoredFromCache && defaultSource && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            marginTop: 10, fontSize: 12, fontWeight: 700,
            color: "#34C759", backgroundColor: "rgba(52,199,89,0.12)",
            border: "1px solid rgba(52,199,89,0.3)",
            borderRadius: 20, padding: "4px 12px",
          }}>
            ✓ Mapping {defaultSource} mémorisé
            <button
              type="button"
              onClick={() => {
                try { localStorage.removeItem(MAPPING_CACHE_KEY); } catch {}
                setMappings(initialMappings);
                setRestoredFromCache(false);
              }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#8E8E93", padding: 0, lineHeight: 1 }}
            >✕</button>
          </div>
        )}
      </div>

      {/* Cards de mapping — une par champ Google Sheets */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {googleSheetColumns.map((googleColumn) => {
          const mapping = getMappingForColumn(googleColumn);
          const isRequired = googleColumn === "Date" || googleColumn === "Montant";

          return (
            <div
              key={googleColumn}
              style={{
                background: "var(--bg-card)",
                borderRadius: 14,
                border: isRequired && mapping.type === "empty"
                  ? "1.5px solid rgba(255,59,48,0.3)"
                  : "1px solid var(--border-color)",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Nom du champ */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)" }}>
                  {googleColumn}
                  {isRequired && <span style={{ color: "#FF3B30", marginLeft: 4 }}>*</span>}
                </span>
                {/* Badge statut */}
                {mapping.type === "empty" && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(0,0,0,0.05)", padding: "2px 8px", borderRadius: 6 }}>non mappé</span>
                )}
                {mapping.type === "column" && mapping.value && (
                  <span style={{ fontSize: 11, color: "#007AFF", background: "#EAF3FF", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>→ {mapping.value}</span>
                )}
                {mapping.type === "fixed" && mapping.value && googleColumn !== "Tags" && (
                  <span style={{ fontSize: 11, color: "#34C759", background: "#E8FAF0", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>= "{mapping.value}"</span>
                )}
                {mapping.type === "fixed" && googleColumn === "Tags" && mapping.value && (
                  <span style={{ fontSize: 11, color: "#34C759", background: "#E8FAF0", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                    {mapping.value.split(",").filter(Boolean).length} tag(s)
                  </span>
                )}
              </div>

              {/* Segmented control */}
              {renderTypeSelector(googleColumn, mapping)}

              {/* Sélecteur de colonne */}
              {mapping.type === "column" && (
                <select
                  value={mapping.value || ""}
                  onChange={e => updateMapping(googleColumn, { type: "column", value: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">-- Sélectionnez une colonne --</option>
                  {detectedColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              )}

              {/* Valeur fixe : Jar */}
              {mapping.type === "fixed" && googleColumn === "Jar" && (
                <select
                  value={mapping.value || ""}
                  onChange={e => updateMapping(googleColumn, { type: "fixed", value: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">-- Choisir une jarre --</option>
                  {JAR_OPTIONS.map(j => (
                    <option key={j.key} value={j.key}>{j.label}</option>
                  ))}
                </select>
              )}

              {/* Valeur fixe : Tags */}
              {mapping.type === "fixed" && googleColumn === "Tags" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {availableTags.map(tag => {
                    const selectedIds = (mapping.value || "").split(",").filter(Boolean);
                    const isSelected = selectedIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          const next = isSelected
                            ? selectedIds.filter(id => id !== tag.id)
                            : [...selectedIds, tag.id];
                          updateMapping(googleColumn, { type: "fixed", value: next.join(",") });
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "6px 12px", borderRadius: 20,
                          border: `2px solid ${isSelected ? tag.color : "var(--border-color)"}`,
                          backgroundColor: isSelected ? `${tag.color}22` : "var(--bg-card)",
                          color: isSelected ? tag.color : "var(--text-muted)",
                          fontSize: 13, fontWeight: isSelected ? 700 : 500,
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                      >
                        <span>{tag.emoji}</span>
                        <span>{tag.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Valeur fixe : texte libre */}
              {mapping.type === "fixed" && googleColumn !== "Jar" && googleColumn !== "Tags" && (
                <input
                  type="text"
                  value={mapping.value || ""}
                  onChange={e => updateMapping(googleColumn, { type: "fixed", value: e.target.value })}
                  placeholder={
                    googleColumn === "Source"      ? "Ex: LGMCorp Fabien"
                    : googleColumn === "Valeur"    ? "Ex: USD"
                    : googleColumn === "Type"      ? "Ex: Passive Income"
                    : "Entrez une valeur…"
                  }
                  style={inputStyle}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Avertissement champs obligatoires */}
      <div style={{
        marginTop: 16, padding: "12px 14px",
        backgroundColor: "rgba(255,149,0,0.1)",
        border: "1px solid rgba(255,149,0,0.3)",
        borderRadius: 12, fontSize: 13, color: "var(--text-main)",
      }}>
        <strong>⚠️ Obligatoires :</strong> Date et Montant doivent être mappés.
      </div>

      {/* Boutons */}
      <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            flex: 1, padding: "14px", borderRadius: 12,
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-body)", color: "var(--text-main)",
            fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >
          ← Retour
        </button>
        <button
          onClick={() => {
            const dateMapping = getMappingForColumn("Date");
            const montantMapping = getMappingForColumn("Montant");
            if (!(dateMapping.type !== "empty" && dateMapping.value) ||
                !(montantMapping.type !== "empty" && montantMapping.value)) {
              alert("⚠️ Les champs Date et Montant sont obligatoires !");
              return;
            }
            try { localStorage.setItem(MAPPING_CACHE_KEY, JSON.stringify(mappings)); } catch {}
            saveColumnMappingToSheet(MAPPING_CACHE_KEY, mappings);
            onContinue(mappings);
          }}
          style={{
            flex: 2, padding: "14px", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg, #007AFF 0%, #0051D5 100%)",
            color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,122,255,0.3)",
          }}
        >
          Continuer →
        </button>
      </div>
    </div>
  );
};
