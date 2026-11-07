// src/components/MoreView.tsx
import React from "react";

import { useT } from "../i18n";
interface MoreViewProps {
  darkMode: boolean;
  onToggleDark: () => void;
  onImport: () => void;
  onOpenSettings: () => void;
}

const MoreView: React.FC<MoreViewProps> = ({ darkMode, onToggleDark, onImport, onOpenSettings }) => {
  const t = useT();
  return (
  <div className="more-view">
    <h2 className="more-title">{t("nav.more")}</h2>
    <div className="more-list">
      <button type="button" className="more-item" onClick={onImport}>
        <span className="more-item-icon">📂</span>
        <span className="more-item-text">
          <span className="more-item-label">{t("more.import")}</span>
          <span className="more-item-sub">{t("more.importSub")}</span>
        </span>
        <span className="more-item-chevron">›</span>
      </button>
      <button type="button" className="more-item" onClick={onOpenSettings}>
        <span className="more-item-icon">⚙️</span>
        <span className="more-item-text">
          <span className="more-item-label">{t("more.settings")}</span>
          <span className="more-item-sub">{t("more.settingsSub")}</span>
        </span>
        <span className="more-item-chevron">›</span>
      </button>
      <button type="button" className="more-item" onClick={onToggleDark}>
        <span className="more-item-icon">{darkMode ? "☀️" : "🌙"}</span>
        <span className="more-item-text">
          <span className="more-item-label">{t("more.appearance")}</span>
          <span className="more-item-sub">{darkMode ? t("more.toLight") : t("more.toDark")}</span>
        </span>
      </button>
    </div>
  </div>
  );
};

export default MoreView;
