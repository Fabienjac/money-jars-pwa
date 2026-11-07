import React, { useState } from "react";
import { CURRENCIES } from "../currencies";
import { setBaseCurrency, useBaseCurrency, currencySymbol } from "../baseCurrency";

import { useT } from "../i18n";
const BaseCurrencySettings: React.FC = () => {
  const t = useT();
  const base = useBaseCurrency();
  const [pending, setPending] = useState<string | null>(null);

  const confirm = () => {
    if (pending) setBaseCurrency(pending);
    setPending(null);
  };

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{t("settings.base.title")}</h3>
      <p className="settings-section-desc">{t("settings.base.desc")}</p>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
        {t("settings.base.label", { symbol: currencySymbol(base) })}
        <select
          value={pending ?? base}
          onChange={(e) => setPending(e.target.value === base ? null : e.target.value)}
          style={{ padding: "10px 12px", border: "1.5px solid var(--border-color)", borderRadius: 10, fontSize: 15, background: "var(--bg-card)", color: "var(--text-main)" }}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
          ))}
        </select>
      </label>

      {pending && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(255,149,0,0.4)", background: "rgba(255,149,0,0.08)", color: "var(--text-main)", fontSize: 14, lineHeight: 1.45 }}>
          {t("settings.base.warn", { from: base, to: pending })}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" className="settings-btn settings-btn-add settings-btn-small" onClick={confirm}>{t("settings.base.confirm", { to: pending })}</button>
            <button type="button" className="settings-btn settings-btn-secondary settings-btn-small" onClick={() => setPending(null)}>{t("common.cancel")}</button>
          </div>
        </div>
      )}

    </section>
  );
};

export default BaseCurrencySettings;
