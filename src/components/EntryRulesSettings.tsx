// Réglages > Règles automatiques : un mot-clé → ce qui se remplit seul à la saisie.
//   - dépense : jarre, compte, étiquettes (appliqué par QuickSpendingForm) ;
//   - revenu : compte de destination et type de revenu (appliqué par RevenueForm).
// Stockées dans le cloud, avec les règles apprises à l'import. Tout se choisit dans des listes (comptes, jarres,
// étiquettes) ou avec des suggestions tirées de l'existant (types de revenu) : pas de variante d'orthographe.
// Logique pure : src/entryRules.ts.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEntryRules, saveEntryRule, deleteEntryRule, searchRevenues } from "../api";
import { describeRule, distinctLabels, legacyToRules, normalizeKeyword, type EntryRule, type RuleMode } from "../entryRules";
import type { AutoRule } from "../autoRules";
import type { Tag } from "../tagsUtils";
import { useT } from "../i18n";

const JARS = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
const LEARNED_SHOWN = 50;

interface Draft {
  original: string | null; // mot-clé d'origine (null = nouvelle règle)
  keyword: string;
  jar: string;
  account: string;
  tags: string[];
  destination: string;
  incomeType: string;
}

interface Props {
  mode: RuleMode;
  accountNames: string[];
  tags: Tag[];
  /** Types de revenu déjà utilisés dans les comptes de revenus (suggestions). */
  knownTypes?: string[];
  /** Anciennes règles de ce mode gardées sur l'appareil : reprises dans le cloud une fois, puis retirées de l'appareil. */
  legacy: AutoRule[];
  onLegacyMigrated: () => void;
  /** Nombre de règles écrites à la main (pour le résumé du bloc des Réglages). */
  onManualCount?: (n: number) => void;
}

const EntryRulesSettings: React.FC<Props> = ({ mode, accountNames, tags, knownTypes = [], legacy, onLegacyMigrated, onManualCount }) => {
  const t = useT();
  const isRevenue = mode === "revenue";
  const [all, setAll] = useState<EntryRule[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showLearned, setShowLearned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyTypes, setHistoryTypes] = useState<string[]>([]);

  const flash = (m: string) => { setMessage(m); setTimeout(() => setMessage(null), 2500); };
  const tagName = useCallback((id: string) => tags.find((x) => x.id === id)?.name ?? id, [tags]);

  const reload = useCallback(async () => {
    const list = await fetchEntryRules();
    setAll(list);
    return list;
  }, []);

  // Chargement, puis reprise (une seule fois) des anciennes règles locales de ce mode
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await reload();
      if (cancelled || legacy.length === 0) return;
      const toSave = legacyToRules(
        legacy.map((l) => ({ mode: l.mode, keyword: l.keyword, jar: l.jar, account: l.account, destination: l.destination, incomeType: l.incomeType })),
        list,
        mode,
      );
      for (const r of toSave) {
        const res = await saveEntryRule(r);
        if (!res.ok) return; // on garde les anciennes règles sur l'appareil, on réessaiera
      }
      if (cancelled) return;
      onLegacyMigrated();
      if (toSave.length > 0) { flash(t("rules.migrated", { n: toSave.length })); await reload(); }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Revenus : types déjà utilisés dans l'historique, pour proposer la même écriture plutôt qu'une variante
  useEffect(() => {
    if (!isRevenue) return;
    let cancelled = false;
    searchRevenues("", 300)
      .then((res) => { if (!cancelled) setHistoryTypes(distinctLabels(res.rows.map((r) => r.incomeType))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isRevenue]);

  const typeSuggestions = useMemo(() => distinctLabels([...knownTypes, ...historyTypes]), [knownTypes, historyTypes]);
  const rules = useMemo(() => (all ?? []).filter((r) => r.mode === mode), [all, mode]);
  const manual = useMemo(() => rules.filter((r) => r.origin === "manual"), [rules]);
  const learned = useMemo(() => rules.filter((r) => r.origin === "learned"), [rules]);
  useEffect(() => { onManualCount?.(manual.length); }, [manual.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (r: EntryRule | null) => {
    setError(null);
    setDraft(r
      ? { original: r.keyword, keyword: r.keyword, jar: r.jar ?? "", account: r.account ?? "", tags: [...r.tags], destination: r.destination ?? "", incomeType: r.incomeType ?? "" }
      : { original: null, keyword: "", jar: "", account: "", tags: [], destination: "", incomeType: "" });
  };

  const save = async () => {
    if (!draft) return;
    const keyword = normalizeKeyword(draft.keyword);
    if (!keyword) { setError(t("rules.errKeyword")); return; }
    const empty = isRevenue ? !draft.destination && !draft.incomeType.trim() : !draft.jar && !draft.account && draft.tags.length === 0;
    if (empty) { setError(t(isRevenue ? "rules.errNothingRevenue" : "rules.errNothing")); return; }
    // Le mot-clé est la clé d'une règle dans la base : un même mot ne peut pas servir une dépense ET un revenu
    if (keyword !== draft.original && (all ?? []).some((r) => r.keyword === keyword)) {
      setError(t("rules.errDup", { keyword }));
      return;
    }
    setBusy(true);
    const rule: EntryRule = isRevenue
      ? { keyword, mode, tags: [], destination: draft.destination || undefined, incomeType: draft.incomeType.trim() || undefined, origin: "manual" }
      : { keyword, mode, jar: draft.jar || undefined, account: draft.account || undefined, tags: draft.tags, origin: "manual" };
    const res = await saveEntryRule(rule);
    if (res.ok && draft.original && draft.original !== keyword) await deleteEntryRule(draft.original);
    setBusy(false);
    if (!res.ok) { setError(t("rules.errSave", { error: res.error ?? "" })); return; }
    setDraft(null);
    setError(null);
    flash(t("rules.saved"));
    await reload();
  };

  const remove = async (r: EntryRule) => {
    if (!confirm(t("rules.confirmDelete"))) return;
    const res = await deleteEntryRule(r.keyword);
    if (!res.ok) { flash(t("rules.errSave", { error: res.error ?? "" })); return; }
    flash(t("rules.deleted"));
    await reload();
  };

  const toggleTag = (id: string) =>
    setDraft((d) => (d ? { ...d, tags: d.tags.includes(id) ? d.tags.filter((x) => x !== id) : [...d.tags, id] } : d));

  const accountField = isRevenue ? draft?.destination : draft?.account;
  const accountOptions = draft && accountField && !accountNames.includes(accountField) ? [...accountNames, accountField] : accountNames;
  const listId = `rule-type-list-${mode}`;

  const editor = draft ? (
    <div className="form-inline rules-edit">
      <div className="form-group-inline">
        <label className="form-label-inline">{t("rules.keyword")}</label>
        <input
          type="text"
          className="form-input-inline"
          placeholder={t(isRevenue ? "rules.keywordPhRevenue" : "rules.keywordPh")}
          value={draft.keyword}
          onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
          autoFocus
        />
      </div>
      {!isRevenue && (
        <div className="form-group-inline">
          <label className="form-label-inline">{t("rules.jar")}</label>
          <select className="form-select-inline" value={draft.jar} onChange={(e) => setDraft({ ...draft, jar: e.target.value })}>
            <option value="">{t("rules.noJar")}</option>
            {JARS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}
      <div className="form-group-inline">
        <label className="form-label-inline">{t(isRevenue ? "rules.destination" : "rules.account")}</label>
        <select
          className="form-select-inline"
          value={accountField ?? ""}
          onChange={(e) => setDraft(isRevenue ? { ...draft, destination: e.target.value } : { ...draft, account: e.target.value })}
        >
          <option value="">{t("rules.noAccount")}</option>
          {accountOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {isRevenue && (
        <div className="form-group-inline">
          <label className="form-label-inline">{t("rules.type")}</label>
          <input
            type="text"
            className="form-input-inline"
            list={listId}
            placeholder={t("rules.typePh")}
            value={draft.incomeType}
            onChange={(e) => setDraft({ ...draft, incomeType: e.target.value })}
          />
          <datalist id={listId}>
            {typeSuggestions.map((v) => <option key={v} value={v} />)}
          </datalist>
          <span className="rules-hint">{t("rules.typeHint")}</span>
        </div>
      )}
      {!isRevenue && tags.length > 0 && (
        <div className="form-group-inline rules-tags-group">
          <label className="form-label-inline">{t("rules.tags")}</label>
          <div className="rules-tags">
            {tags.map((tg) => (
              <button
                key={tg.id}
                type="button"
                className={`rules-tag${draft.tags.includes(tg.id) ? " is-on" : ""}`}
                aria-pressed={draft.tags.includes(tg.id)}
                onClick={() => toggleTag(tg.id)}
              >
                {tg.emoji} {tg.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <div className="rules-error" role="alert">{error}</div>}
      <div className="rules-edit-buttons">
        <button type="button" className="settings-btn settings-btn-add settings-btn-small" disabled={busy} onClick={save}>{t("rules.save")}</button>
        <button type="button" className="settings-btn settings-btn-secondary settings-btn-small" onClick={() => { setDraft(null); setError(null); }}>{t("common.cancel")}</button>
      </div>
    </div>
  ) : null;

  const card = (r: EntryRule) => (
    <div key={r.keyword} className={`rule-card ${mode}`}>
      <div className="rule-card-content">
        <p className="rule-keyword">"{r.keyword}"</p>
        <div className="rule-details">
          <span className="rule-badge">{describeRule(r, tagName) || "—"}</span>
        </div>
      </div>
      <button type="button" className="rules-icon-btn" onClick={() => startEdit(r)} aria-label={t("rules.edit", { keyword: r.keyword })}>✏️</button>
      <button type="button" className="rule-delete-btn" onClick={() => remove(r)} aria-label={t("rules.delete", { keyword: r.keyword })}>✕</button>
    </div>
  );

  const row = (r: EntryRule) => (draft && draft.original === r.keyword ? <React.Fragment key={r.keyword}>{editor}</React.Fragment> : card(r));

  return (
    <div className="rules-block" data-mode={mode}>
      <h4 className="rules-sub-title">{t(isRevenue ? "rules.revenueTitle" : "rules.spendingTitle")}</h4>
      <p className="settings-section-desc">{t(isRevenue ? "rules.revenueDesc" : "rules.spendingDesc")}</p>
      {message && <div className="rules-flash" role="status">{message}</div>}

      {all === null ? null : manual.length === 0 && !draft ? (
        <p className="rules-empty">{t("rules.none")}</p>
      ) : (
        <div className="rules-list">{manual.map(row)}</div>
      )}

      {draft && draft.original === null ? editor : null}
      {!draft ? (
        <button type="button" className="settings-btn settings-btn-add settings-btn-small" onClick={() => startEdit(null)}>
          {t(isRevenue ? "rules.addRevenue" : "rules.addSpending")}
        </button>
      ) : null}

      {learned.length > 0 && (
        <div className="rules-learned">
          <button type="button" className="rules-learned-toggle" aria-expanded={showLearned} onClick={() => setShowLearned((v) => !v)}>
            {t("rules.learnedTitle", { n: learned.length })} <span aria-hidden="true">{showLearned ? "▴" : "▾"}</span>
          </button>
          {showLearned && (
            <>
              <p className="settings-section-desc">{t("rules.learnedHint")}</p>
              <div className="rules-list">{learned.slice(0, LEARNED_SHOWN).map(row)}</div>
              {learned.length > LEARNED_SHOWN && <p className="rules-empty">{t("rules.learnedMore", { n: learned.length - LEARNED_SHOWN })}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EntryRulesSettings;
