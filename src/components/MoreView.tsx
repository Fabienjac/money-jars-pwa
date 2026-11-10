// src/components/MoreView.tsx
import React, { useState } from "react";

import { useT, localeTag, JAR_LABELS } from "../i18n";
import { formatMoney } from "../baseCurrency";
import { JAR_ALERT_EMOJIS, WARN_RATIO, type JarAlert } from "../jarAlerts";
import FeedbackForm from "./FeedbackForm";
import PushAlertsRow from "./PushAlertsRow";
interface MoreViewProps {
  darkMode: boolean;
  onToggleDark: () => void;
  onImport: () => void;
  onOpenSettings: () => void;
  onOpenHelp?: () => void;
  /** Liste « Pour démarrer » : progression, ou null quand elle n'est pas (ou plus) proposée. */
  start?: { done: number; total: number } | null;
  onOpenStart?: () => void;
  jarAlerts?: JarAlert[];
}

const MoreView: React.FC<MoreViewProps> = ({ darkMode, onToggleDark, onImport, onOpenSettings, onOpenHelp, start = null, onOpenStart, jarAlerts = [] }) => {
  const t = useT();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
  <div className="more-view">
    <h2 className="more-title">{t("nav.more")}</h2>
    {jarAlerts.length > 0 && (
      <section className="alert-card" aria-label={t("alerts.title")}>
        <h3 className="alert-card-title">{t("alerts.title")}</h3>
        <ul className="alert-list">
          {jarAlerts.map((a) => {
            const amount = formatMoney(Math.abs(a.net));
            const message =
              a.level === 2
                ? t("alerts.over", { amount })
                : a.net < 0.005
                  ? t("alerts.empty")
                  : t("alerts.warn", { pct: Math.floor(a.percent), amount });
            return (
              <li key={a.jar} className={`alert-row alert-row--${a.level === 2 ? "over" : "warn"}`}>
                <span className="alert-row-emoji" aria-hidden="true">{JAR_ALERT_EMOJIS[a.jar]}</span>
                <span className="alert-row-text">
                  <span className="alert-row-name">{JAR_LABELS[a.jar]}</span>
                  <span className="alert-row-msg">{message}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="alert-card-hint">{t("alerts.hint", { pct: Math.round(WARN_RATIO * 100) })}</p>
      </section>
    )}
    <div className="more-list">
      {start && onOpenStart && (
        <button type="button" className="more-item" onClick={onOpenStart}>
          <span className="more-item-icon">🚀</span>
          <span className="more-item-text">
            <span className="more-item-label">{t("more.start")}</span>
            <span className="more-item-sub">{t("more.startSub", { done: start.done, total: start.total })}</span>
          </span>
          <span className="more-item-chevron">›</span>
        </button>
      )}
      <PushAlertsRow />
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
      {onOpenHelp && (
        <button type="button" className="more-item" onClick={onOpenHelp}>
          <span className="more-item-icon">❓</span>
          <span className="more-item-text">
            <span className="more-item-label">{t("more.help")}</span>
            <span className="more-item-sub">{t("more.helpSub")}</span>
          </span>
          <span className="more-item-chevron">›</span>
        </button>
      )}
      <button type="button" className="more-item" onClick={() => setFeedbackOpen((v) => !v)} aria-expanded={feedbackOpen}>
        <span className="more-item-icon">💡</span>
        <span className="more-item-text">
          <span className="more-item-label">{t("more.feedback")}</span>
          <span className="more-item-sub">{t("more.feedbackSub")}</span>
        </span>
        <span className="more-item-chevron">{feedbackOpen ? "⌄" : "›"}</span>
      </button>
      <a className="more-item" href="#confidentialite">
        <span className="more-item-icon">🔒</span>
        <span className="more-item-text">
          <span className="more-item-label">{t("more.legal")}</span>
          <span className="more-item-sub">{t("more.legalSub")}</span>
        </span>
        <span className="more-item-chevron">›</span>
      </a>
      <button type="button" className="more-item" onClick={onToggleDark}>
        <span className="more-item-icon">{darkMode ? "☀️" : "🌙"}</span>
        <span className="more-item-text">
          <span className="more-item-label">{t("more.appearance")}</span>
          <span className="more-item-sub">{darkMode ? t("more.toLight") : t("more.toDark")}</span>
        </span>
      </button>
    </div>
    {feedbackOpen && <FeedbackForm onClose={() => setFeedbackOpen(false)} />}
  </div>
  );
};

export default MoreView;
