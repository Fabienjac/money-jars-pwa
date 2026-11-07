// Écran « Plus » : activer les notifications d'alerte des jarres sur cet appareil.
import React, { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n";
import { disablePush, enablePush, getPushStatus, pushStateLabel, sendTestPush, type PushStatus } from "../push";

const PushAlertsRow: React.FC = () => {
  const t = useT();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refresh = useCallback(() => {
    getPushStatus().then(setStatus).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  // Fonction non configurée sur ce déploiement : on n'affiche rien plutôt qu'un bouton qui ne peut pas marcher
  if (!status || status.support === "not-configured") return null;

  const run = async (job: () => Promise<PushStatus | void>, doneNote = "") => {
    setBusy(true);
    setNote("");
    try {
      const next = await job();
      if (next) setStatus(next);
      setNote(doneNote);
    } catch {
      setNote(t("push.error"));
    } finally {
      setBusy(false);
    }
  };

  const onTest = () =>
    run(async () => {
      const r = await sendTestPush();
      setNote(r && r.sent > 0 ? t("push.testSent") : t("push.testNone"));
    }).then(() => undefined);

  const usable = status.support === "ok" && status.permission !== "denied";

  return (
    <div className="more-item push-item">
      <span className="more-item-icon">🔔</span>
      <span className="more-item-text">
        <span className="more-item-label">{t("push.title")}</span>
        <span className="more-item-sub">{t("push.subtitle")}</span>
        <span className="push-state" role="status">{pushStateLabel(status)}</span>
        {usable && (
          <span className="push-actions">
            {status.subscribed ? (
              <>
                <button type="button" className="push-btn" disabled={busy} onClick={onTest}>{t("push.test")}</button>
                <button type="button" className="push-btn push-btn--quiet" disabled={busy} onClick={() => run(disablePush)}>{t("push.disable")}</button>
              </>
            ) : (
              <button type="button" className="push-btn" disabled={busy} onClick={() => run(enablePush)}>{t("push.enable")}</button>
            )}
          </span>
        )}
        {note && <span className="push-note" role="status">{note}</span>}
      </span>
    </div>
  );
};

export default PushAlertsRow;
