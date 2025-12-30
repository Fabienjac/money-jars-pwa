// src/components/TagSelector.tsx
import React, { useState } from "react";
import { Tag, loadTags } from "../tagsUtils";

interface TagSelectorProps {
  selectedTags: string[]; // Array of tag IDs
  onChange: (tagIds: string[]) => void;
  compact?: boolean; // Mode compact pour les formulaires
}

export const TagSelector: React.FC<TagSelectorProps> = ({
  selectedTags,
  onChange,
  compact = false,
}) => {
  const [allTags] = useState<Tag[]>(loadTags());
  const [showAll, setShowAll] = useState(false);

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      onChange(selectedTags.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTags, tagId]);
    }
  };

  const displayedTags = compact && !showAll ? allTags.slice(0, 4) : allTags;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
        }}
      >
        {displayedTags.map((tag) => {
          const isSelected = selectedTags.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              style={{
                padding: compact ? "6px 10px" : "8px 12px",
                borderRadius: "20px",
                border: isSelected
                  ? `2px solid ${tag.color}`
                  : "1px solid var(--border-color)",
                background: isSelected
                  ? `${tag.color}15`
                  : "var(--bg-card)",
                color: isSelected ? tag.color : "var(--text-main)",
                fontSize: compact ? "12px" : "13px",
                fontWeight: isSelected ? "700" : "500",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = `${tag.color}08`;
                  e.currentTarget.style.borderColor = tag.color;
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = "var(--bg-card)";
                  e.currentTarget.style.borderColor = "var(--border-color)";
                }
              }}
            >
              <span style={{ fontSize: compact ? "14px" : "16px" }}>
                {tag.emoji}
              </span>
              <span>{tag.name}</span>
            </button>
          );
        })}
      </div>

      {compact && allTags.length > 4 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          style={{
            padding: "6px 10px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            background: "var(--bg-body)",
            color: "var(--text-muted)",
            fontSize: "11px",
            fontWeight: "600",
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          {showAll ? "Voir moins" : `+ ${allTags.length - 4} autres tags`}
        </button>
      )}

      {selectedTags.length > 0 && (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: "8px",
            background: "rgba(0, 122, 255, 0.05)",
            border: "1px solid rgba(0, 122, 255, 0.2)",
            fontSize: "12px",
            color: "#007AFF",
            fontWeight: "600",
          }}
        >
          ✓ {selectedTags.length} tag{selectedTags.length > 1 ? "s" : ""}{" "}
          sélectionné{selectedTags.length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};
