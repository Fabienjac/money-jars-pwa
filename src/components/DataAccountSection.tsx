// Réglages > Compte : télécharger toutes ses données, supprimer son compte.
import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { deleteMyAccount, fetchExportTables, openBillingPortal } from "../api";
import { EXPORT_TABLES, buildExport, exportFileName, revenuesCsv, spendingsCsv } from "../dataExport";
import { t as tr, localeTag, useLang } from "../i18n";

/** Télécharge un fichier texte (BOM UTF-8 pour les CSV : Excel affiche correctement les accents). */
function download(name: string, content: string, mime: string, bom = false) {
  const blob = new Blob([bom ? "﻿" + content : content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Efface ce que l'application garde sur l'appareil pour ce compte (préférences, caches). */
function wipeLocalData() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("mjars:") || k.startsWith("sb-")).forEach((k) => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter((k) => k.startsWith("mjars:")).forEach((k) => sessionStorage.removeItem(k));
  } catch { /* sans importance */ }
}

type ExportKind = "all" | "spendings" | "revenues";

const DataAccountSection: React.FC = () => {
  useLang();
  const { user, signOut, subscription } = useAuth();
  const paying = subscription?.plan === "active";
  const [cancelSub, setCancelSub] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const decimalComma = localeTag().toLowerCase().startsWith("fr");

  const runExport = async (kind: ExportKind) => {
    if (busy) return;
    setBusy(kind);
    setNote(null);
    try {
      const { email, tables } = await fetchExportTables();
      const now = new Date();
      let rows = 0;
      if (kind === "all") {
        download(exportFileName("all", now), JSON.stringify(buildExport(tables, { email, now }), null, 2), "application/json");
        rows = EXPORT_TABLES.reduce((s, k) => s + (tables[k]?.length ?? 0), 0);
      } else if (kind === "spendings") {
        const data = tables.transactions_spending ?? [];
        download(exportFileName("spendings", now), spendingsCsv(data, decimalComma, [
          tr("hist.fDate"), tr("hist.fDescription"), tr("hist.fAmount"), tr("hist.fJar"), tr("hist.fAccount"), tr("hist.fTags"), tr("hist.csvSubscription"),
        ]), "text/csv", true);
        rows = data.length;
      } else {
        const data = tables.transactions_revenue ?? [];
        download(exportFileName("revenues", now), revenuesCsv(data, decimalComma, [
          tr("hist.fDate"), tr("hist.fSource"), tr("hist.fAmount"), tr("hist.fValue"), tr("hist.fCrypto"), tr("hist.fMethod"),
          tr("hist.fRate"), tr("hist.fDestination"), tr("hist.fType"), tr("hist.fTags"),
        ]), "text/csv", true);
        rows = data.length;
      }
      setNote({ ok: true, text: tr("data.exportDone", { n: rows }) });
    } catch {
      setNote({ ok: false, text: tr("data.exportError") });
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    if (portalBusy) return;
    setPortalBusy(true);
    setPortalError(null);
    const res = await openBillingPortal();
    if (res.ok) {
      window.location.assign(res.url);
      return;
    }
    setPortalError(res.code === "no_customer" ? tr("sub.noCustomer") : res.code === "not_configured" ? tr("sub.notConfigured") : tr("sub.error"));
    setPortalBusy(false);
  };

  const confirmDelete = async () => {
    if (deleting) return;
    if (paying && !cancelSub) {
      setDeleteError(tr("acct.deleteActiveSub"));
      return;
    }
    const typed = confirmEmail.trim().toLowerCase();
    if (!typed || typed !== (user?.email ?? "").trim().toLowerCase()) {
      setDeleteError(tr("acct.deleteMismatch"));
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteMyAccount(confirmEmail, paying && cancelSub);
    if (res.ok) {
      wipeLocalData();
      try { await signOut(); } catch { /* le compte n'existe plus : la session locale est déjà effacée */ }
      window.location.reload();
      return;
    }
    setDeleteError(
      res.code === "active_subscription" ? tr("acct.deleteActiveSub")
        : res.code === "stripe_cancel_failed" || res.code === "not_configured" ? tr("acct.deleteCancelFailed")
        : res.code === "confirm_mismatch" ? tr("acct.deleteMismatch")
          : tr("acct.deleteError")
    );
    setDeleting(false);
  };

  return (
    <div className="data-account">
      <h3 className="data-account-title">{tr("data.title")}</h3>
      <p className="settings-section-desc">{tr("data.hint")}</p>
      <div className="data-account-buttons">
        <button type="button" className="settings-btn settings-btn-primary" onClick={() => runExport("all")} disabled={busy !== null}>
          {busy === "all" ? tr("data.exporting") : tr("data.exportAll")}
        </button>
        <button type="button" className="settings-btn" onClick={() => runExport("spendings")} disabled={busy !== null}>
          {busy === "spendings" ? tr("data.exporting") : tr("data.exportSpendings")}
        </button>
        <button type="button" className="settings-btn" onClick={() => runExport("revenues")} disabled={busy !== null}>
          {busy === "revenues" ? tr("data.exporting") : tr("data.exportRevenues")}
        </button>
      </div>
      {note && <p className={`data-account-note${note.ok ? "" : " is-error"}`} role="status">{note.text}</p>}

      {paying && (
        <>
          <h3 className="data-account-title">{tr("sub.title")}</h3>
          <p className="settings-section-desc">{tr("sub.hint")}</p>
          <div className="data-account-buttons">
            <button type="button" className="settings-btn" onClick={openPortal} disabled={portalBusy}>
              {portalBusy ? tr("sub.opening") : tr("sub.manage")}
            </button>
          </div>
          {portalError && <p className="data-account-note is-error" role="alert">{portalError}</p>}
        </>
      )}

      <h3 className="data-account-title data-account-danger-title">{tr("acct.deleteTitle")}</h3>
      {!deleteOpen ? (
        <button type="button" className="settings-btn data-account-danger-open" onClick={() => setDeleteOpen(true)}>
          {tr("acct.deleteOpen")}
        </button>
      ) : (
        <div className="data-account-danger" role="group" aria-label={tr("acct.deleteTitle")}>
          <p>{tr("acct.deleteWarn")}</p>
          <p>{tr("acct.deleteExportFirst")}</p>
          {paying && (
            <label className="data-account-cancelsub">
              <input type="checkbox" checked={cancelSub} onChange={(e) => { setCancelSub(e.target.checked); setDeleteError(null); }} />
              <span>{tr("acct.cancelSubLabel")}</span>
            </label>
          )}
          <label className="data-account-confirm">
            <span>{tr("acct.deleteConfirmLabel", { email: user?.email ?? "" })}</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={confirmEmail}
              onChange={(e) => { setConfirmEmail(e.target.value); setDeleteError(null); }}
              placeholder={user?.email ?? ""}
            />
          </label>
          {deleteError && <p className="data-account-note is-error" role="alert">{deleteError}</p>}
          <div className="data-account-buttons">
            <button type="button" className="settings-btn data-account-delete" onClick={confirmDelete} disabled={deleting}>
              {deleting ? tr("acct.deleting") : tr("acct.deleteButton")}
            </button>
            <button type="button" className="settings-btn" onClick={() => { setDeleteOpen(false); setConfirmEmail(""); setCancelSub(false); setDeleteError(null); }} disabled={deleting}>
              {tr("set.cancelPlain")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataAccountSection;
