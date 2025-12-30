// src/components/TagFilter.tsx
import React from "react";
import { loadTags } from "../tagsUtils";

interface TagFilterProps {
  selectedTags: string[];
  onSelectionChange: (tags: string[]) => void;
}

export const TagFilter: React.FC<TagFilterProps> = ({
  selectedTags,
  onSelectionChange,
}) => {
  const allTags = loadTags();

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      // Retirer le tag
      onSelectionChange(selectedTags.filter(t => t !== tagId));
    } else {
      // Ajouter le tag
      onSelectionChange([...selectedTags, tagId]);
    }
  };

  const selectAll = () => {
    onSelectionChange(allTags.map(t => t.id));
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

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
        marginBottom: "12px",
      }}>
        <h3 style={{
          margin: 0,
          fontSize: "14px",
          fontWeight: "700",
          color: "var(--text-main)",
        }}>
          🏷️ Filtrer par tags
        </h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={selectAll}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-body)",
              fontSize: "12px",
              fontWeight: "600",
              color: "var(--text-main)",
              cursor: "pointer",
            }}
          >
            Tous
          </button>
          <button
            type="button"
            onClick={clearAll}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-body)",
              fontSize: "12px",
              fontWeight: "600",
              color: "var(--text-main)",
              cursor: "pointer",
            }}
          >
            Aucun
          </button>
        </div>
      </div>

      {/* Tags grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "8px",
      }}>
        {allTags.map(tag => {
          const isSelected = selectedTags.includes(tag.id);
          
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: isSelected 
                  ? `2px solid ${tag.color}` 
                  : "1px solid var(--border-color)",
                background: isSelected 
                  ? `${tag.color}20` 
                  : "var(--bg-body)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = tag.color;
                  e.currentTarget.style.background = `${tag.color}10`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = "var(--border-color)";
                  e.currentTarget.style.background = "var(--bg-body)";
                }
              }}
            >
              <span style={{ fontSize: "20px" }}>{tag.emoji}</span>
              <div style={{ 
                flex: 1, 
                textAlign: "left",
                overflow: "hidden",
              }}>
                <div style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {tag.name}
                </div>
              </div>
              {isSelected && (
                <span style={{ fontSize: "16px", color: tag.color }}>✓</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selection summary */}
      <div style={{
        marginTop: "12px",
        padding: "8px 12px",
        borderRadius: "8px",
        background: "var(--bg-body)",
        fontSize: "12px",
        color: "var(--text-muted)",
      }}>
        {selectedTags.length === 0 && "Aucun tag sélectionné (toutes les transactions)"}
        {selectedTags.length === allTags.length && "Tous les tags sélectionnés"}
        {selectedTags.length > 0 && selectedTags.length < allTags.length && 
          `${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''} sélectionné${selectedTags.length > 1 ? 's' : ''}`
        }
      </div>
    </div>
  );
};
