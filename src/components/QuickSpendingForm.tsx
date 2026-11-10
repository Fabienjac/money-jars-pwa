// src/components/QuickSpendingForm.tsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { appendSpending, getAccounts, searchSpendings, fetchEntryRules, saveTags as saveTagsApi } from "../api";
import { findBestRule, spendingPatch, describeRule, type EntryRule } from "../entryRules";
import { updateStreak } from "../streakUtils";
import { JarKey } from "../types";
import { loadAccounts } from "../accountsUtils";
import { tagsToString, loadTags, setCachedTags } from "../tagsUtils";
import { createTag, splitTags } from "../tagCreate";
import { loadPreferredCurrencies, getCurrencyInfo } from "../currencyUtils";
import { loadLastExpenseCurrency, saveLastExpenseCurrency } from "../currencySettings";
import { useExchangeRate } from "../hooks/useExchangeRate";
import { useBaseCurrency, formatMoney } from "../baseCurrency";
import { useT, t as tr, localeTag, JAR_LABELS as I18N_JARS } from "../i18n";
import {
  Supplier,
  buildSuppliers,
  topSuppliers,
  searchSuppliers,
  cleanSupplierName,
} from "../suppliersUtils";
import CurrencySelector from "./CurrencySelector";

const JAR_LABELS: Record<JarKey, { label: string; emoji: string; color: string }> = {
  NEC: { label: "NEC", emoji: "🏺", color: "var(--jar-nec, #007AFF)" },
  FFA: { label: "FFA", emoji: "🌱", color: "var(--jar-ffa, #34C759)" },
  LTSS: { label: "LTSS", emoji: "🏦", color: "var(--jar-ltss, #FFD60A)" },
  PLAY: { label: "PLAY", emoji: "🎮", color: "var(--jar-play, #FF9500)" },
  EDUC: { label: "EDUC", emoji: "📚", color: "var(--jar-educ, #AF52DE)" },
  GIFT: { label: "GIFT", emoji: "🎁", color: "var(--jar-gift, #5AC8FA)" },
};

const LAST_TAGS_KEY = "mjars:lastSpendingTags";
const LAST_JAR_KEY = "mjars:lastSpendingJar";

let suppliersCache: Supplier[] | null = null;

const todayISO = () => new Date().toISOString().slice(0, 10);

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function formatDateLabel(iso: string): string {
  if (iso === todayISO()) return tr("qsf.today");
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(localeTag(), { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(y, m - 1, d));
}

interface QuickSpendingFormProps {
  onClose: () => void;
  onSuccess?: () => void;
  prefill?: any | null;
  onVoice?: () => void;
}

const QuickSpendingForm: React.FC<QuickSpendingFormProps> = ({ onClose, onSuccess, prefill, onVoice }) => {
  const t = useT();
  const base = useBaseCurrency();
  const [date, setDate] = useState<string>(todayISO());
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(() => loadLastExpenseCurrency());
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const backspaceLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const [jar, setJar] = useState<JarKey>(() => readLS<JarKey>(LAST_JAR_KEY, "NEC"));
  const [account, setAccount] = useState(() => localStorage.getItem("mjars:defaultSpendingAccount") || "");
  const [supplier, setSupplier] = useState("");
  const [picked, setPicked] = useState<Supplier | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>(() => readLS<string[]>(LAST_TAGS_KEY, []));
  const [preferredCurrencies, setPreferredCurrencies] = useState<string[]>(loadPreferredCurrencies);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>(suppliersCache ?? []);
  // Règles automatiques (Réglages) : un mot-clé dans le fournisseur remplit jarre, compte et étiquettes.
  const [entryRules, setEntryRules] = useState<EntryRule[]>([]);
  const [appliedRule, setAppliedRule] = useState<{ rule: EntryRule; summary: string; prev: { jar: JarKey; account: string; tags: string[] } } | null>(null);
  // Champs que la personne a choisis elle-même : une règle ne les remplace jamais.
  const touched = useRef({ jar: false, account: false, tags: false });

  const { rate, loading: rateLoading, error: rateError } = useExchangeRate(currency, date, base);

  const [accounts, setAccountsState] = useState(loadAccounts());

  useEffect(() => {
    let cancelled = false;
    searchSpendings("", 500)
      .then((res) => {
        if (cancelled) return;
        const built = buildSuppliers(res.rows);
        suppliersCache = built;
        setSuppliers(built);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchEntryRules().then((list) => { if (!cancelled) setEntryRules(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const reload = () =>
      getAccounts()
        .then((list) => setAccountsState(list.length > 0 ? list : loadAccounts()))
        .catch(() => setAccountsState(loadAccounts()));
    reload();
    window.addEventListener("spendingAccountsUpdated", reload);
    return () => window.removeEventListener("spendingAccountsUpdated", reload);
  }, []);

  useEffect(() => {
    if (accounts.length > 0 && !accounts.some(a => a.name === account)) {
      setAccount(accounts[0].name);
    }
  }, [accounts, account]);

  useEffect(() => {
    const reload = () => setPreferredCurrencies(loadPreferredCurrencies());
    window.addEventListener("preferredCurrenciesUpdated", reload);
    return () => window.removeEventListener("preferredCurrenciesUpdated", reload);
  }, []);

  useEffect(() => {
    if (prefill) {
      if (prefill.jar) { setJar(prefill.jar); touched.current.jar = true; }
      if (prefill.account) { setAccount(prefill.account); touched.current.account = true; }
      if (prefill.amount != null) setAmount(String(prefill.amount));
      if (prefill.description) setSupplier(cleanSupplierName(prefill.description));
      if (prefill.tags && typeof prefill.tags === "string") {
        const tagIds = prefill.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
        setSelectedTags(tagIds);
        touched.current.tags = true;
      }
    }
  }, [prefill]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const frequent = useMemo(() => topSuppliers(suppliers, 6), [suppliers]);
  const search = useMemo(() => searchSuppliers(suppliers, supplier), [suppliers, supplier]);
  const typing = supplier.trim().length > 0 && !picked;
  const [allTags, setAllTags] = useState(() => loadTags());
  const { shown: shownTags, others: otherTags } = useMemo(() => splitTags(allTags, selectedTags), [allTags, selectedTags]);
  const [showOtherTags, setShowOtherTags] = useState(false);
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagEmoji, setNewTagEmoji] = useState("🏷️");
  const [tagMsg, setTagMsg] = useState<string | null>(null);
  const tagLabel = (id: string) => allTags.find((x) => x.id === id)?.name ?? id;

  /** Cherche la règle de ce texte et remplit les champs que la personne n'a pas choisis (forceAll : choix d'une suggestion de l'historique). */
  const applyRuleFor = (text: string, forceAll = false) => {
    const rule = findBestRule(text, entryRules, "spending");
    if (!rule) { setAppliedRule(null); return; }
    if (!forceAll && appliedRule?.rule.keyword === rule.keyword) return;
    const patch = spendingPatch(
      rule,
      forceAll ? { jar: false, account: false, tags: false } : touched.current,
      accounts.map((a) => a.name),
      Object.keys(JAR_LABELS),
    );
    if (!patch.jar && !patch.account && !patch.tags) { setAppliedRule(null); return; }
    const summary = describeRule({ ...rule, jar: patch.jar, account: patch.account, tags: patch.tags ?? [] }, tagLabel);
    setAppliedRule({ rule, summary, prev: { jar, account, tags: selectedTags } });
    if (patch.jar) setJar(patch.jar as JarKey);
    if (patch.account) setAccount(patch.account);
    if (patch.tags) setSelectedTags(patch.tags);
  };

  const undoRule = () => {
    if (!appliedRule) return;
    setJar(appliedRule.prev.jar);
    setAccount(appliedRule.prev.account);
    setSelectedTags(appliedRule.prev.tags);
    touched.current = { jar: true, account: true, tags: true }; // la personne a refusé : on n'y touche plus
    setAppliedRule(null);
  };

  // Au fil de la frappe du fournisseur : applique la règle correspondante (sauf si un fournisseur de l'historique est choisi)
  useEffect(() => {
    if (picked) return;
    if (!supplier.trim()) { setAppliedRule(null); return; }
    applyRuleFor(supplier);
  }, [supplier, entryRules, accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const applySupplier = (s: Supplier) => {
    setSupplier(s.name);
    setPicked(s);
    setJar(s.jar);
    if (accounts.some(a => a.name === s.account)) setAccount(s.account);
    if (s.tags.length > 0) setSelectedTags(s.tags);
    applyRuleFor(s.name, true); // une règle écrite par la personne l'emporte sur ce qui a été appris de l'historique
    supplierInputRef.current?.blur();
  };

  const clearSupplier = () => {
    setSupplier("");
    setPicked(null);
    setAppliedRule(null);
    touched.current = { jar: false, account: false, tags: false };
  };

  const handleNumberClick = (num: string) => {
    if (num === "." && amount.includes(".")) return;
    setAmount(prev => prev + num);
  };

  const handleBackspace = () => setAmount(prev => prev.slice(0, -1));
  const handleClear = () => setAmount("");

  const toggleTag = (tagId: string) => {
    touched.current.tags = true;
    setAppliedRule(null);
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    );
  };

  const closeNewTag = () => { setNewTagOpen(false); setNewTagName(""); setNewTagEmoji("🏷️"); };

  /** Crée un tag depuis la saisie (ou retrouve celui qui existe déjà sous ce nom) et le sélectionne. */
  const handleCreateTag = async () => {
    const r = createTag(newTagName, newTagEmoji, allTags);
    if (r.kind === "error") { setTagMsg(t(r.reason === "empty" ? "qsf.tagErrEmpty" : "qsf.tagErrLong")); return; }
    touched.current.tags = true;
    setAppliedRule(null);
    if (r.kind === "existing") {
      setTagMsg(t("qsf.tagExists", { name: r.tag.name }));
      setSelectedTags(prev => (prev.includes(r.tag.id) ? prev : [...prev, r.tag.id]));
      closeNewTag();
      return;
    }
    const updated = [...allTags, r.tag];
    setAllTags(updated);
    setCachedTags(updated);
    setSelectedTags(prev => [...prev, r.tag.id]);
    setTagMsg(null);
    closeNewTag();
    try { await saveTagsApi(updated); } catch { setTagMsg(t("qsf.tagSaveErr")); }
  };

  const handleSubmit = async () => {
    const name = search.exact?.name ?? cleanSupplierName(supplier);
    if (!name) {
      setMessage(t("qsf.errSupplier"));
      return;
    }
    const raw = parseFloat(amount.replace(",", "."));
    if (!amount || !isFinite(raw) || raw <= 0) {
      setMessage(t("qsf.errAmount"));
      return;
    }
    if (currency !== base && !rate) {
      setMessage(t("qsf.errRate"));
      return;
    }

    try {
      setLoading(true);

      const tagsString = selectedTags.length > 0 ? tagsToString(selectedTags) : undefined;
      const originalAmount = parseFloat(amount);
      const eurAmount = currency === base ? originalAmount : originalAmount * rate!;
      const finalDescription = currency !== base
        ? `${name} (${originalAmount} ${currency})`
        : name;

      await appendSpending({
        date,
        jar,
        account,
        amount: Math.round(eurAmount * 100) / 100,
        description: finalDescription,
        tags: tagsString,
      });

      saveLastExpenseCurrency(currency);
      writeLS(LAST_TAGS_KEY, selectedTags);
      writeLS(LAST_JAR_KEY, jar);
      suppliersCache = null;
      updateStreak();
      window.dispatchEvent(new CustomEvent("mjars:transactionSaved"));

      setMessage(t("qsf.saved"));

      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 800);

    } catch (error: any) {
      console.error("Erreur:", error);
      setMessage(`❌ ${error.message || t("qsf.errorFallback")}`);
    } finally {
      setLoading(false);
    }
  };

  const selectedTagObjects = selectedTags
    .map(id => allTags.find(t => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);

  const currencyInfo = getCurrencyInfo(currency);
  const canSubmit = !loading && !!amount && supplier.trim().length > 0;

  return (
    <div className={`qsf-screen${detailsOpen ? " qsf-screen--details" : ""}`}>
      {/* Header */}
      <div className="qsf-header">
        <button type="button" className="qsf-close" onClick={onClose} aria-label={t("qsf.close")}>✕</button>
        <h2 className="qsf-title">{t("qsf.title")}</h2>
        {onVoice && (
          <button type="button" className="qsf-voice" onClick={onVoice} aria-label={t("qsf.voice")} title={t("qsf.voice")}>
            🎙️
          </button>
        )}
        <button
          type="button"
          className={`qsf-currency-pill${currency !== base ? " qsf-currency-pill--foreign" : ""}`}
          onClick={() => setCurrencyOpen(o => !o)}
          aria-expanded={currencyOpen}
        >
          {currencyInfo.flag} {currency} ▾
        </button>
      </div>

      {currencyOpen && (
        <div className="qsf-currency-panel">
          <CurrencySelector
            value={currency}
            preferred={preferredCurrencies}
            onChange={(c) => { setCurrency(c); setCurrencyOpen(false); }}
          />
        </div>
      )}

      {/* Fournisseur */}
      <div className="qsf-supplier">
        <div className="qsf-supplier-field">
          <input
            ref={supplierInputRef}
            type="text"
            className="qsf-supplier-input"
            placeholder={t("qsf.supplierPlaceholder")}
            value={supplier}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            onChange={(e) => { setSupplier(e.target.value); setPicked(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
          {supplier && (
            <button type="button" className="qsf-supplier-clear" onClick={clearSupplier} aria-label={t("qsf.clear")}>✕</button>
          )}
        </div>

        <div className="qsf-chips">
          {!typing && frequent.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`qsf-chip${picked?.key === s.key ? " qsf-chip--active" : ""}`}
              onClick={() => applySupplier(s)}
            >
              {s.name}
            </button>
          ))}
          {!typing && frequent.length === 0 && (
            <span className="qsf-chips-hint">{t("qsf.frequentHint")}</span>
          )}
          {typing && (
            <>
              {search.didYouMean && (
                <button type="button" className="qsf-chip qsf-chip--suggest" onClick={() => applySupplier(search.didYouMean!)}>
                  {t("qsf.didYouMean", { name: search.didYouMean.name })}
                </button>
              )}
              {search.matches.map((s) => (
                <button key={s.key} type="button" className="qsf-chip" onClick={() => applySupplier(s)}>
                  {s.name}
                </button>
              ))}
              {!search.exact && (
                <span className="qsf-chips-hint">{t("qsf.newSupplier", { name: cleanSupplierName(supplier) })}</span>
              )}
            </>
          )}
        </div>
      </div>

      {appliedRule && (
        <div className="qsf-rule-hint" role="status">
          <span>⚡ {t("rules.applied", { summary: appliedRule.summary })}</span>
          <button type="button" onClick={undoRule}>{t("rules.undo")}</button>
        </div>
      )}

      {/* Amount */}
      <div className="qsf-amount-area">
        <div className="qsf-amount-row">
          <span className={`qsf-amount-number${amount ? "" : " qsf-amount-number--empty"}`}>{amount || "0"}</span>
          <span className="qsf-amount-unit">{currency}</span>
        </div>
        {currency !== base && amount && parseFloat(amount) > 0 ? (
          <div className="qsf-rate-hint">
            {rateLoading && <span>⏳</span>}
            {!rateLoading && rate && <span>≈ {formatMoney(parseFloat(amount) * rate, base)}</span>}
            {!rateLoading && rateError && <span className="qsf-rate-error">⚠️ {rateError}</span>}
          </div>
        ) : !amount && picked && currency === base ? (
          <button type="button" className="qsf-last-amount" onClick={() => setAmount(String(picked.lastAmount))}>
            {t("qsf.last", { amount: formatMoney(picked.lastAmount, base) })}
          </button>
        ) : (
          <div className="qsf-rate-hint" />
        )}
      </div>

      {/* Jarres : la jarre choisie est nommée, pour comprendre que les tuiles servent à choisir où l'on puise */}
      <div className="qsf-jar-caption">
        {t("qsf.jarFrom")} <b>{JAR_LABELS[jar].emoji} {I18N_JARS[jar] ?? jar}</b>
      </div>
      <div className="qsf-jars" role="radiogroup" aria-label={t("qsf.jarFrom")}>
        {(Object.keys(JAR_LABELS) as JarKey[]).map((jarKey) => (
          <button
            key={jarKey}
            type="button"
            role="radio"
            aria-checked={jar === jarKey}
            className={`qsf-jar${jar === jarKey ? " qsf-jar--active" : ""}`}
            style={{ "--jar-color": JAR_LABELS[jarKey].color } as React.CSSProperties}
            onClick={() => { touched.current.jar = true; setAppliedRule(null); setJar(jarKey); }}
          >
            <span className="qsf-jar-emoji">{JAR_LABELS[jarKey].emoji}</span>
            <span className="qsf-jar-label">{JAR_LABELS[jarKey].label}</span>
          </button>
        ))}
      </div>

      {/* Numpad */}
      <div className="qsf-numpad">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"].map((key) => (
          <button
            key={key}
            type="button"
            className={`qsf-key${key === "⌫" ? " qsf-key--back" : ""}`}
            onClick={() => key === "⌫" ? handleBackspace() : handleNumberClick(key)}
            onPointerDown={() => {
              if (key === "⌫") backspaceLongPressRef.current = setTimeout(handleClear, 600);
            }}
            onPointerUp={() => { if (backspaceLongPressRef.current) clearTimeout(backspaceLongPressRef.current); }}
            onPointerLeave={() => { if (backspaceLongPressRef.current) clearTimeout(backspaceLongPressRef.current); }}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Résumé + détails */}
      <div className="qsf-details">
        <button
          type="button"
          className="qsf-summary"
          onClick={() => setDetailsOpen(o => !o)}
          aria-expanded={detailsOpen}
        >
          <span className="qsf-summary-main">
            <span className="qsf-summary-text">
              💳 {account} · 📅 {formatDateLabel(date)}
            </span>
            <span className="qsf-summary-edit">{detailsOpen ? t("qsf.close") : t("qsf.edit")}</span>
          </span>
          <span className="qsf-summary-tags">
            {selectedTagObjects.length === 0 && <span className="qsf-summary-notag">{t("qsf.noTag")}</span>}
            {selectedTagObjects.map(t => (
              <span key={t.id} className="qsf-summary-tag">{t.emoji} {t.name}</span>
            ))}
          </span>
        </button>

        {detailsOpen && (
          <div className="qsf-details-body">
            <label className="qsf-field">
              <span className="qsf-field-icon">💳</span>
              <select className="qsf-select" value={account} onChange={(e) => { touched.current.account = true; setAppliedRule(null); setAccount(e.target.value); }}>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.name}>{acc.icon} {acc.name}</option>
                ))}
              </select>
            </label>

            <div className="qsf-field qsf-field--wrap">
              <span className="qsf-field-icon">🏷️</span>
              <div className="qsf-tags-wrap">
                {[...shownTags, ...(showOtherTags ? otherTags : [])].map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={`qsf-tag${selectedTags.includes(tag.id) ? " qsf-tag--active" : ""}`}
                    aria-pressed={selectedTags.includes(tag.id)}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.emoji} {tag.name}
                  </button>
                ))}
                {otherTags.length > 0 && (
                  <button type="button" className="qsf-tag qsf-tag--more" onClick={() => setShowOtherTags(v => !v)}>
                    {showOtherTags ? t("qsf.tagsFewer") : t("qsf.tagsMore", { n: otherTags.length })}
                  </button>
                )}
                {!newTagOpen && (
                  <button type="button" className="qsf-tag qsf-tag--more" onClick={() => { setTagMsg(null); setNewTagOpen(true); }}>
                    {t("qsf.newTag")}
                  </button>
                )}
                {newTagOpen && (
                  <div className="qsf-newtag">
                    <input
                      className="qsf-newtag-emoji"
                      value={newTagEmoji}
                      maxLength={4}
                      aria-label={t("qsf.tagEmoji")}
                      onChange={(e) => setNewTagEmoji(e.target.value)}
                    />
                    <input
                      className="qsf-newtag-name"
                      value={newTagName}
                      maxLength={40}
                      autoFocus
                      placeholder={t("qsf.tagNamePh")}
                      onChange={(e) => { setNewTagName(e.target.value); setTagMsg(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateTag(); } }}
                    />
                    <button type="button" className="qsf-newtag-ok" onClick={handleCreateTag}>{t("qsf.tagCreate")}</button>
                    <button type="button" className="qsf-newtag-cancel" onClick={closeNewTag} aria-label={t("common.cancel")}>✕</button>
                  </div>
                )}
                {tagMsg && <span className="qsf-tags-hint qsf-tags-hint--msg" role="status">{tagMsg}</span>}
                <span className="qsf-tags-hint">{t("qsf.tagsHint")}</span>
              </div>
            </div>

            <label className="qsf-field">
              <input
                type="date"
                className="qsf-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="qsf-footer">
        {message && (
          <div className={`qsf-message${message.includes("✅") ? " qsf-message--ok" : " qsf-message--err"}`}>
            {message}
          </div>
        )}
        <button
          type="button"
          className="qsf-submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {loading ? t("qsf.saving") : t("qsf.save")}
        </button>
      </div>
    </div>
  );
};

export default QuickSpendingForm;
