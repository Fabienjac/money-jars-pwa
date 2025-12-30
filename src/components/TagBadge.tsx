// src/components/TagBadge.tsx
import React from "react";
import { Tag, loadTags } from "../tagsUtils";

interface TagBadgeProps {
  tagId: string;
  size?: "small" | "medium" | "large";
  showName?: boolean;
  onRemove?: () => void;
}

export const TagBadge: React.FC<TagBadgeProps> = ({
  tagId,
  size = "medium",
  showName = true,
  onRemove,
}) => {
  const allTags = loadTags();
  const tag = allTags.find((t) => t.id === tagId);

  if (!tag) return null;

  const sizes = {
    small: { padding: "3px 6px", fontSize: "10px", emojiSize: "12px" },
    medium: { padding: "4px 8px", fontSize: "11px", emojiSize: "14px" },
    large: { padding: "6px 10px", fontSize: "12px", emojiSize: "16px" },
  };

  const style = sizes[size];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: style.padding,
        borderRadius: "12px",
        background: `${tag.color}15`,
        border: `1px solid ${tag.color}40`,
        color: tag.color,
        fontSize: style.fontSize,
        fontWeight: "600",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: style.emojiSize }}>{tag.emoji}</span>
      {showName && <span>{tag.name}</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "14px",
            height: "14px",
            padding: 0,
            border: "none",
            borderRadius: "50%",
            background: `${tag.color}30`,
            color: tag.color,
            fontSize: "10px",
            cursor: "pointer",
            marginLeft: "2px",
          }}
        >
          ×
        </button>
      )}
    </span>
  );
};

interface TagListProps {
  tagIds: string[];
  size?: "small" | "medium" | "large";
  maxDisplay?: number;
  onRemove?: (tagId: string) => void;
}

export const TagList: React.FC<TagListProps> = ({
  tagIds,
  size = "medium",
  maxDisplay,
  onRemove,
}) => {
  const displayedTags = maxDisplay ? tagIds.slice(0, maxDisplay) : tagIds;
  const remainingCount = maxDisplay ? tagIds.length - maxDisplay : 0;

  if (tagIds.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        alignItems: "center",
      }}
    >
      {displayedTags.map((tagId) => (
        <TagBadge
          key={tagId}
          tagId={tagId}
          size={size}
          onRemove={onRemove ? () => onRemove(tagId) : undefined}
        />
      ))}
      {remainingCount > 0 && (
        <span
          style={{
            padding: "4px 8px",
            borderRadius: "12px",
            background: "var(--border-color)",
            color: "var(--text-muted)",
            fontSize: "11px",
            fontWeight: "600",
          }}
        >
          +{remainingCount}
        </span>
      )}
    </div>
  );
};
