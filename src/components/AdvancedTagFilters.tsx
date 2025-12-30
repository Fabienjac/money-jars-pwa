// src/components/AdvancedTagFilters.tsx
import React from "react";
import { JarKey } from "../types";

export interface AdvancedFilterState {
  period: "all" | "30d" | "90d" | "year" | "custom";
  customStartDate: string;
  customEndDate: string;
  minAmount: string;
  maxAmount: string;
  jars: JarKey[];
}

interface AdvancedTagFiltersProps {
  filters: AdvancedFilterState;
  onChange: (filters: AdvancedFilterState) => void;
  onReset: () => void;
}

const JAR_OPTIONS: { key: JarKey; label: string; color: string }[] = [
  { key: "NEC", label: "Nécessités", color: "#007AFF" },
  { key: "FFA", label: "Liberté Financière", color: "#34C759" },
  { key: "LTSS", label: "Épargne Long Terme", color: "#FFD60A" },
  { key: "PLAY", label: "Fun / Play", color: "#FF9500" },
  { key: "EDUC", label: "Éducation", color: "#AF52DE" },
  { key: "GIFT", label: "Don / Gift", color: "#5AC8FA" },
];

export const AdvancedTagFilters: React.FC<AdvancedTagFiltersProps> = ({
  filters,
  onChange,
  onReset,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const updateFilter = (key: keyof AdvancedFilterState, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  const toggleJar = (jar: JarKey) => {
    const newJars = filters.jars.includes(jar)
      ? filters.jars.filter(j => j !== jar)
      : [...filters.jars, jar];
    updateFilter("jars", newJars);
  };

  const hasActiveFilters = 
    filters.period !== "all" || 
    filters.minAmount !== "" || 
    filters.maxAmount !== "" || 
    filters.jars.length > 0;

  return (
    <div style={{
      padding: "16px",
      borderRadius: "12px",
      border: "1px solid var(--border-color)",
      background: "var(--bg-card)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: isExpanded ? "16px" : "0",
      }}>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            background: "var(--bg-body)",
            fontSize: "14px",
            fontWeight: "700",
            color: "var(--text-main)",
            cursor: "pointer",
          }}
        >
          <span>{isExpanded ? "▼" : "▶"}</span>
          <span>🔍 Filtres avancés</span>
          {hasActiveFilters && (
            <span style={{
              padding: "2px 6px",
              borderRadius: "10px",
              background: "#007AFF",
              color: "white",
              fontSize: "11px",
              fontWeight: "700",
            }}>
              Actifs
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-body)",
              fontSize: "12px",
              fontWeight: "600",
              color: "#FF3B30",
              cursor: "pointer",
            }}
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Filtres */}
      {isExpanded && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}>
          {/* Période */}
          <div>
            <label style={{
              display: "block",
              fontSize: "12px",
              fontWeight: "700",
              color: "var(--text-muted)",
              marginBottom: "8px",
            }}>
              📅 Période
            </label>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
              gap: "8px",
            }}>
              {[
                { value: "all", label: "Tout" },
                { value: "30d", label: "30 jours" },
                { value: "90d", label: "90 jours" },
                { value: "year", label: "1 an" },
                { value: "custom", label: "Personnalisé" },
              ].map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateFilter("period", option.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: filters.period === option.value 
                      ? "2px solid #007AFF" 
                      : "1px solid var(--border-color)",
                    background: filters.period === option.value 
                      ? "rgba(0, 122, 255, 0.1)" 
                      : "var(--bg-body)",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: filters.period === option.value 
                      ? "#007AFF" 
                      : "var(--text-main)",
                    cursor: "pointer",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Dates personnalisées */}
            {filters.period === "custom" && (
              <div style={{
                marginTop: "12px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
              }}>
                <div>
                  <label style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}>
                    Du
                  </label>
                  <input
                    type="date"
                    value={filters.customStartDate}
                    onChange={(e) => updateFilter("customStartDate", e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-body)",
                      fontSize: "13px",
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}>
                    Au
                  </label>
                  <input
                    type="date"
                    value={filters.customEndDate}
                    onChange={(e) => updateFilter("customEndDate", e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-body)",
                      fontSize: "13px",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Montant */}
          <div>
            <label style={{
              display: "block",
              fontSize: "12px",
              fontWeight: "700",
              color: "var(--text-muted)",
              marginBottom: "8px",
            }}>
              💰 Montant
            </label>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}>
              <div>
                <input
                  type="number"
                  placeholder="Min (€)"
                  value={filters.minAmount}
                  onChange={(e) => updateFilter("minAmount", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-body)",
                    fontSize: "14px",
                  }}
                />
              </div>
              <div>
                <input
                  type="number"
                  placeholder="Max (€)"
                  value={filters.maxAmount}
                  onChange={(e) => updateFilter("maxAmount", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-body)",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Jarres */}
          <div>
            <label style={{
              display: "block",
              fontSize: "12px",
              fontWeight: "700",
              color: "var(--text-muted)",
              marginBottom: "8px",
            }}>
              🏺 Jarres
            </label>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "8px",
            }}>
              {JAR_OPTIONS.map(jar => {
                const isSelected = filters.jars.includes(jar.key);
                
                return (
                  <button
                    key={jar.key}
                    type="button"
                    onClick={() => toggleJar(jar.key)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: isSelected 
                        ? `2px solid ${jar.color}` 
                        : "1px solid var(--border-color)",
                      background: isSelected 
                        ? `${jar.color}20` 
                        : "var(--bg-body)",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: isSelected ? jar.color : "var(--text-main)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <span style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {jar.label}
                    </span>
                    {isSelected && <span>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Résumé des filtres actifs */}
          {hasActiveFilters && (
            <div style={{
              padding: "12px",
              borderRadius: "8px",
              background: "rgba(0, 122, 255, 0.1)",
              border: "1px solid rgba(0, 122, 255, 0.3)",
            }}>
              <div style={{
                fontSize: "12px",
                fontWeight: "700",
                color: "#007AFF",
                marginBottom: "6px",
              }}>
                Filtres actifs :
              </div>
              <div style={{
                fontSize: "11px",
                color: "#0051D5",
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
              }}>
                {filters.period !== "all" && (
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "rgba(0, 122, 255, 0.2)",
                  }}>
                    📅 {filters.period === "30d" ? "30 jours" : 
                        filters.period === "90d" ? "90 jours" : 
                        filters.period === "year" ? "1 an" : "Personnalisé"}
                  </span>
                )}
                {filters.minAmount && (
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "rgba(0, 122, 255, 0.2)",
                  }}>
                    Min: {filters.minAmount}€
                  </span>
                )}
                {filters.maxAmount && (
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "rgba(0, 122, 255, 0.2)",
                  }}>
                    Max: {filters.maxAmount}€
                  </span>
                )}
                {filters.jars.length > 0 && (
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "rgba(0, 122, 255, 0.2)",
                  }}>
                    🏺 {filters.jars.length} jarre{filters.jars.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
