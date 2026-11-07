import React, { useEffect, useState } from "react";
import { CryptoFav, loadCryptos, saveCryptos, fetchCryptosFromCloud, getDefaultCryptos } from "../cryptoUtils";

import { useT } from "../i18n";
interface Draft {
  original: string | null; // ticker d'origine (null = ajout)
  ticker: string;
  networks: string[];
  newNetwork: string;
  coingeckoId: string;
  stable: boolean;
}

const emptyDraft: Draft = { original: null, ticker: "", networks: [], newNetwork: "", coingeckoId: "", stable: false };

const addNetwork = (list: string[], raw: string): string[] => {
  const n = raw.trim();
  if (!n || list.some((x) => x.toLowerCase() === n.toLowerCase())) return list;
  return [...list, n];
};

const CryptoSettings: React.FC = () => {
  const t = useT();
  const [list, setList] = useState<CryptoFav[]>(loadCryptos);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCryptosFromCloud().then((l) => { if (l) setList(l); });
  }, []);

  const commit = (next: CryptoFav[]) => {
    setList(next);
    saveCryptos(next);
  };

  const startEdit = (c: CryptoFav) => {
    setError(null);
    setDraft({
      original: c.ticker,
      ticker: c.ticker,
      networks: [...c.networks],
      newNetwork: "",
      coingeckoId: c.coingeckoId ?? "",
      stable: !!c.stable,
    });
  };

  const saveDraft = () => {
    if (!draft) return;
    const ticker = draft.ticker.trim().toUpperCase();
    if (!ticker) { setError(t("settings.crypto.errTicker")); return; }
    if (list.some((c) => c.ticker === ticker && c.ticker !== draft.original)) {
      setError(t("settings.crypto.errDup", { ticker }));
      return;
    }
    const item: CryptoFav = {
      ticker,
      networks: addNetwork(draft.networks, draft.newNetwork),
      coingeckoId: draft.coingeckoId.trim() || undefined,
      stable: draft.stable,
    };
    const next = draft.original === null
      ? [...list, item]
      : list.map((c) => (c.ticker === draft.original ? item : c));
    commit(next);
    setDraft(null);
    setError(null);
  };

  const remove = (ticker: string) => commit(list.filter((c) => c.ticker !== ticker));

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{t("settings.crypto.title")}</h3>
      <p className="settings-section-desc">{t("settings.crypto.desc")}</p>

      {list.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {list.map((c) => (
            <div
              key={c.ticker}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 12,
                border: "1px solid var(--border-color)", background: "var(--bg-body)",
              }}
            >
              <span style={{ fontSize: 20 }} aria-hidden="true">🪙</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--text-main)" }}>{c.ticker}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {c.networks.length > 0 ? c.networks.join(" · ") : t("settings.crypto.noNetwork")}
                  {c.stable ? t("settings.crypto.stable") : ""}
                  {c.coingeckoId ? "" : t("settings.crypto.noLive")}
                </div>
              </div>
              <button type="button" onClick={() => startEdit(c)} aria-label={t("settings.crypto.edit", { ticker: c.ticker })}
                style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", padding: 6 }}>✏️</button>
              <button type="button" onClick={() => remove(c.ticker)} aria-label={t("settings.crypto.remove", { ticker: c.ticker })}
                style={{ border: "none", background: "none", fontSize: 16, cursor: "pointer", padding: 6, color: "var(--text-muted)" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <div className="crypto-edit">
          <div className="form-group-inline">
            <label className="form-label-inline">{t("settings.crypto.ticker")}</label>
            <input
              type="text"
              className="form-input-inline"
              placeholder="ex: DOGE"
              value={draft.ticker}
              onChange={(e) => setDraft({ ...draft, ticker: e.target.value })}
              autoFocus
            />
          </div>
          <div className="form-group-inline">
            <label className="form-label-inline">{t("settings.crypto.networks")}</label>
            {draft.networks.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {draft.networks.map((n) => (
                  <span
                    key={n}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "6px 6px 6px 12px", borderRadius: 999,
                      border: "1.5px solid var(--border-color)", background: "var(--bg-card)",
                      color: "var(--text-main)", fontSize: 14, fontWeight: 600,
                    }}
                  >
                    {n}
                    <button
                      type="button"
                      aria-label={t("settings.crypto.removeNetwork", { n })}
                      onClick={() => setDraft({ ...draft, networks: draft.networks.filter((x) => x !== n) })}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, padding: "0 4px" }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                className="form-input-inline"
                placeholder={t("settings.crypto.networkPlaceholder")}
                value={draft.newNetwork}
                onChange={(e) => setDraft({ ...draft, newNetwork: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setDraft({ ...draft, networks: addNetwork(draft.networks, draft.newNetwork), newNetwork: "" });
                  }
                }}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                className="settings-btn settings-btn-secondary settings-btn-small"
                onClick={() => setDraft({ ...draft, networks: addNetwork(draft.networks, draft.newNetwork), newNetwork: "" })}
              >
                {t("settings.crypto.addNetwork")}
              </button>
            </div>
          </div>
          <div className="form-group-inline">
            <label className="form-label-inline">{t("settings.crypto.coingecko")}</label>
            <input
              type="text"
              className="form-input-inline"
              placeholder="ex: dogecoin"
              value={draft.coingeckoId}
              onChange={(e) => setDraft({ ...draft, coingeckoId: e.target.value })}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-main)" }}>
            <input
              type="checkbox"
              checked={draft.stable}
              onChange={(e) => setDraft({ ...draft, stable: e.target.checked })}
            />
            {t("settings.crypto.stableCheck")}
          </label>
          {error && <div style={{ color: "#FF3B30", fontSize: 13 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="settings-btn settings-btn-add settings-btn-small" onClick={saveDraft}>
              {draft.original === null ? t("settings.crypto.add") : t("settings.crypto.save")}
            </button>
            <button type="button" className="settings-btn settings-btn-secondary settings-btn-small" onClick={() => { setDraft(null); setError(null); }}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="settings-btn settings-btn-add settings-btn-small" onClick={() => { setError(null); setDraft(emptyDraft); }}>
            {t("settings.crypto.addCrypto")}
          </button>
          <button
            type="button"
            className="settings-btn settings-btn-secondary settings-btn-small"
            onClick={() => commit(getDefaultCryptos())}
          >
            {t("settings.crypto.reset")}
          </button>
        </div>
      )}
    </section>
  );
};

export default CryptoSettings;
