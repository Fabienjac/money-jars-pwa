// Écran « Pour démarrer » : 7 étapes cochées automatiquement, chacune avec un bouton qui ouvre le bon écran.
import React from "react";
import { useT, type TKey } from "../i18n";
import { isInstalledApp } from "../startFlags";
import type { StepId, StepState } from "../startChecklist";

interface Props {
  loaded: boolean;
  steps: StepState[];
  progress: { done: number; total: number; complete: boolean };
  next: StepId | null;
  installed: boolean;
  onAction: (id: StepId) => void;
  onToggleInstalled: (on: boolean) => void;
  onImport: () => void;
  onHelp: () => void;
  onHide: () => void;
}

const ICONS: Record<StepId, string> = { jars: "🏺", accounts: "🏦", revenue: "💰", spending: "🧾", voice: "🎙️", rule: "⚡", install: "📲" };

const StartView: React.FC<Props> = ({ loaded, steps, progress, next, installed, onAction, onToggleInstalled, onImport, onHelp, onHide }) => {
  const t = useT();
  const pct = Math.round((progress.done / progress.total) * 100);
  return (
    <div className="start-view">
      <h2 className="more-title">{t("start.pageTitle")}</h2>
      <p className="acc-intro">{t("start.intro")}</p>

      <div className="start-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={t("start.pageTitle")}>
        <div className="start-progress-bar"><div className="start-progress-fill" style={{ width: `${pct}%` }} /></div>
        <span className="start-progress-text">{t("start.progress", { done: progress.done, total: progress.total })}</span>
      </div>

      {progress.complete && <p className="start-complete">🎉 {t("start.complete")}</p>}

      <ol className="start-list">
        {steps.map((s) => {
          const isNext = loaded && s.id === next;
          return (
            <li key={s.id} className={`start-step${s.done ? " is-done" : ""}${isNext ? " is-next" : ""}`}>
              <span className="start-check" aria-hidden="true">{s.done ? "✓" : ICONS[s.id]}</span>
              <div className="start-step-body">
                <div className="start-step-title">
                  {t(`start.${s.id}.title` as TKey)}
                  {s.done && <span className="start-step-done"> · {t("start.done")}</span>}
                </div>
                {!s.done && <p className="start-step-desc">{t(`start.${s.id}.desc` as TKey)}</p>}
                {!s.done && s.later && <p className="start-step-later">{t("start.later")}</p>}
                {s.id === "install" && !s.done && isInstalledApp() === false && (
                  <button type="button" className="start-btn" onClick={() => onToggleInstalled(true)}>{t("start.install.action")}</button>
                )}
                {s.id === "install" && s.done && installed && !isInstalledApp() && (
                  <button type="button" className="start-link" onClick={() => onToggleInstalled(false)}>{t("start.install.undo")}</button>
                )}
                {s.id !== "install" && !s.done && (
                  <button type="button" className={`start-btn${isNext ? " is-primary" : ""}`} onClick={() => onAction(s.id)}>{t(`start.${s.id}.action` as TKey)}</button>
                )}
                {s.id === "jars" && s.done && (
                  <button type="button" className="start-link" onClick={() => onAction("jars")}>{t("start.jars.action")}</button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="start-extra">
        <button type="button" className="start-link" onClick={onImport}>{t("start.import")}</button>
        <button type="button" className="start-link" onClick={onHelp}>{t("start.help")}</button>
      </div>
      <button type="button" className="start-hide" onClick={onHide}>{t("start.hide")}</button>
    </div>
  );
};

export default StartView;
