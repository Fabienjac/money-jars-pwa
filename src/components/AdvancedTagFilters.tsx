// src/components/AdvancedTagFilters.tsx
import React from "react";
import { JarKey } from "../types";
import { t as tr, useLang, JAR_LABELS } from "../i18n";

import { currencySymbol as curSym } from "../baseCurrency";
export interface AdvancedFilterState {
  period: "all" | "30d" | "90d" | "6m" | "year" | "custom";
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

const JAR_OPTIONS: { key: JarKey; color: string }[] = [
  { key: "NEC", color: "#007AFF" },
  { key: "FFA", color: "#34C759" },
  { key: "LTSS", color: "#FFD60A" },
  { key: "PLAY", color: "#FF9500" },
  { key: "EDUC", color: "#AF52DE" },
  { key: "GIFT", color: "#5AC8FA" },
];

export const AdvancedTagFilters: React.FC<AdvancedTagFiltersProps> = ({
  filters,
  onChange,
  onReset,
}) => {
  useLang();
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
          <span>{tr("af.title")}</span>
          {hasActiveFilters && (
            <span style={{
              padding: "2px 6px",
              borderRadius: "10px",
              background: "#007AFF",
              color: "white",
              fontSize: "11px",
              fontWeight: "700",
            }}>
              {tr("af.active")}
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
            {tr("af.reset")}
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
              {tr("af.period")}
            </label>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
              gap: "8px",
            }}>
              {[
                { value: "all", label: tr("af.all") },
                { value: "30d", label: tr("af.d30") },
                { value: "90d", label: tr("af.d90") },
                { value: "6m", label: tr("af.m6") },
                { value: "year", label: tr("af.y1") },
                { value: "custom", label: tr("af.custom") },
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
                    {tr("af.from")}
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
                    {tr("af.to")}
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
              {tr("af.amount")}
            </label>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}>
              <div>
                <input
                  type="number"
                  placeholder={"Min (" + curSym() + ")"}
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
                  placeholder={"Max (" + curSym() + ")"}
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
              {tr("af.jars")}
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
                      {JAR_LABELS[jar.key]}
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
                {tr("af.activeFilters")}
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
                    📅 {filters.period === "30d" ? tr("af.d30") :
                        filters.period === "90d" ? tr("af.d90") :
                        filters.period === "6m" ? tr("af.m6") :
                        filters.period === "year" ? tr("af.y1") : tr("af.custom")}
                  </span>
                )}
                {filters.minAmount && (
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "rgba(0, 122, 255, 0.2)",
                  }}>
                    Min: {filters.minAmount}{curSym()}
                  </span>
                )}
                {filters.maxAmount && (
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "rgba(0, 122, 255, 0.2)",
                  }}>
                    Max: {filters.maxAmount}{curSym()}
                  </span>
                )}
                {filters.jars.length > 0 && (
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "rgba(0, 122, 255, 0.2)",
                  }}>
                    {tr("af.jarCount", { n: filters.jars.length })}
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
