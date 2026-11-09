// src/components/SettingsView.tsx - VERSION OPTIMISÉE COMPACTE
import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

function LogoutButton() {
  const t = useT();
  const { signOut, user } = useAuth();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {user && (
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
          {t("set.signedInAs")} <strong>{user.email}</strong>
        </p>
      )}
      <button
        onClick={signOut}
        className="settings-btn"
        style={{ color: "#FF3B30", borderColor: "#FF3B30", maxWidth: "200px" }}
      >
        {t("set.signOut")}
      </button>
    </div>
  );
}
import { JarKey, Account, RevenueAccount } from "../types";
import { loadAutoRules, AutoRule } from "../autoRules";
import { loadAccounts, saveAccounts } from "../accountsUtils";
import { loadRevenueAccounts, saveRevenueAccounts } from "../revenueAccountsUtils";
import CryptoSettings from "./CryptoSettings";
import BaseCurrencySettings from "./BaseCurrencySettings";
import DataAccountSection from "./DataAccountSection";
import { loadTags, setCachedTags, Tag } from "../tagsUtils";
import { getAccounts, getRevenueAccounts, setAccounts as setAccountsApi, setRevenueAccounts as setRevenueAccountsApi, fetchTagsFromSheet, saveTags as saveTagsApi, bulkRenameSpendingAccount, bulkRenameRevenueSource, fetchJarSettings, saveJarSettings } from "../api";
import { ALL_CURRENCIES, loadPreferredCurrencies, savePreferredCurrencies, getCurrencyInfo } from "../currencyUtils";

import { currencySymbol as curSym, useBaseCurrency } from "../baseCurrency";
import LanguageSettings from "./LanguageSettings";
import JarTransfers from "./JarTransfers";
import AccountTransfers from "./AccountTransfers";
import SettingsAccordion from "./SettingsAccordion";
import EntryRulesSettings from "./EntryRulesSettings";
import { SEEN_KEY, OPEN_KEY, initialOpenIds, parseOpenIds, toggleOpenId, percentsSummary } from "../settingsAccordion";
import { useT, useLang, JAR_LABELS } from "../i18n";
import type { TKey } from "../i18n";
const JAR_EMOJIS: Record<JarKey, string> = {
  NEC: "🏺",
  FFA: "🌱",
  LTSS: "🏦",
  PLAY: "🎮",
  EDUC: "📚",
  GIFT: "🎁",
};

const JAR_COLORS: Record<JarKey, string> = {
  NEC: "#007AFF",
  FFA: "#34C759",
  LTSS: "#FFD60A",
  PLAY: "#FF9500",
  EDUC: "#AF52DE",
  GIFT: "#5AC8FA",
};

interface JarSetting {
  key: JarKey;
  percent: number;
  initialBalance: number;
}

const SETTINGS_KEY = "mjars:jarSettings";
const RULES_KEY = "mjars:autoRules";
const DEFAULT_SPENDING_ACCOUNT_KEY = "mjars:defaultSpendingAccount";
const DEFAULT_REVENUE_ACCOUNT_KEY = "mjars:defaultRevenueAccount";

function loadDefaultAccount(key: string): string {
  return localStorage.getItem(key) || "";
}
function saveDefaultAccount(key: string, value: string): void {
  localStorage.setItem(key, value);
}

function loadSettings(): JarSetting[] {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return [
        { key: "NEC", percent: 55, initialBalance: 0 },
        { key: "FFA", percent: 10, initialBalance: 0 },
        { key: "LTSS", percent: 10, initialBalance: 0 },
        { key: "PLAY", percent: 10, initialBalance: 0 },
        { key: "EDUC", percent: 10, initialBalance: 0 },
        { key: "GIFT", percent: 5, initialBalance: 0 },
      ];
    }
    return JSON.parse(raw);
  } catch {
    return [
      { key: "NEC", percent: 55, initialBalance: 0 },
      { key: "FFA", percent: 10, initialBalance: 0 },
      { key: "LTSS", percent: 10, initialBalance: 0 },
      { key: "PLAY", percent: 10, initialBalance: 0 },
      { key: "EDUC", percent: 10, initialBalance: 0 },
      { key: "GIFT", percent: 5, initialBalance: 0 },
    ];
  }
}

function saveSettings(settings: JarSetting[]) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function saveRules(rules: AutoRule[]) {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

const SettingsView: React.FC = () => {
  const t = useT();
  const [jarSettings, setJarSettings] = useState<JarSetting[]>(loadSettings());
  const [rules, setRules] = useState<AutoRule[]>(loadAutoRules());
  const [spendingRuleCount, setSpendingRuleCount] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [revenueAccounts, setRevenueAccounts] = useState<RevenueAccount[]>([]);
  const [tags, setTags] = useState<Tag[]>(loadTags);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagDraft, setEditTagDraft] = useState<Partial<Tag>>({});
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagDraft, setNewTagDraft] = useState<Partial<Tag>>({ id: "", name: "", emoji: "🏷️", color: "#8E8E93", favori: true, categorie: "Intention" });
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [defaultSpendingAccount, setDefaultSpendingAccount] = useState(() => loadDefaultAccount(DEFAULT_SPENDING_ACCOUNT_KEY));
  const [defaultRevenueAccount, setDefaultRevenueAccount] = useState(() => loadDefaultAccount(DEFAULT_REVENUE_ACCOUNT_KEY));

  // Charger les paramètres des jarres depuis Supabase (synchro cross-device)
  useEffect(() => {
    fetchJarSettings()
      .then(remote => {
        if (!remote || remote.length === 0) return;
        // Reconstruire dans le bon ordre
        const JAR_ORDER: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
        const map = new Map(remote.map(r => [r.key, r]));
        const ordered: JarSetting[] = JAR_ORDER.map(k => {
          const r = map.get(k);
          return r ? { key: k, percent: r.percent, initialBalance: r.initialBalance } : { key: k, percent: 0, initialBalance: 0 };
        });
        setJarSettings(ordered);
        saveSettings(ordered); // mise à jour du cache localStorage
      })
      .catch(() => {}); // silencieux — on garde localStorage si erreur réseau
  }, []);

  // Charger les tags depuis le Sheet
  useEffect(() => {
    setTagsLoading(true);
    fetchTagsFromSheet()
      .then(fetched => { if (fetched.length > 0) { setCachedTags(fetched); setTags(fetched); } })
      .catch(() => {})
      .finally(() => setTagsLoading(false));
  }, []);

  const handleSaveTags = async (updated: Tag[]) => {
    setTagsLoading(true);
    try {
      await saveTagsApi(updated);
      setCachedTags(updated);
      setTags(updated);
      setMessage(t("set.tagsSaved"));
    } catch (e: any) {
      setMessage(t("set.errorMsg", { msg: e.message }));
    } finally {
      setTagsLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleEditTagSave = () => {
    if (!editingTagId) return;
    const updated = tags.map(t => t.id === editingTagId ? { ...t, ...editTagDraft } : t);
    setEditingTagId(null);
    handleSaveTags(updated);
  };

  const handleDeleteTag = (id: string) => {
    if (!window.confirm(t("set.confirmDeleteTag", { id }))) return;
    handleSaveTags(tags.filter(t => t.id !== id));
  };

  const handleAddTag = () => {
    const id = (newTagDraft.id || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!id || tags.some(t => t.id === id)) { setMessage(t("set.badTagId")); return; }
    const tag: Tag = { id, name: newTagDraft.name || id, emoji: newTagDraft.emoji || "🏷️", color: newTagDraft.color || "#8E8E93", favori: newTagDraft.favori ?? true, categorie: newTagDraft.categorie || "Intention" };
    setShowAddTag(false);
    setNewTagDraft({ id: "", name: "", emoji: "🏷️", color: "#8E8E93", favori: true, categorie: "Intention" });
    handleSaveTags([...tags, tag]);
  };

  // Charger comptes de dépenses et revenus depuis le Sheet (synchro Mac / iPhone)
  useEffect(() => {
    let cancelled = false;
    setAccountsLoading(true);
    Promise.all([
      getAccounts().catch(() => loadAccounts()),
      getRevenueAccounts().catch(() => loadRevenueAccounts()),
    ]).then(([accs, revAccs]) => {
      if (!cancelled) {
        // Le serveur peut renvoyer [] (non connecté, table vide, erreur) : on garde alors la liste locale
        setAccounts(Array.isArray(accs) && accs.length > 0 ? accs : loadAccounts());
        setRevenueAccounts(Array.isArray(revAccs) && revAccs.length > 0 ? revAccs : loadRevenueAccounts());
      }
    }).finally(() => { if (!cancelled) setAccountsLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showRevenueAccountForm, setShowRevenueAccountForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Nouvelle règle
  const [newRuleMode] = useState<"spending" | "revenue">("revenue"); // les règles de dépense ont leur propre bloc (EntryRulesSettings)
  const [newRuleKeyword, setNewRuleKeyword] = useState("");
  const [newRuleJar, setNewRuleJar] = useState<JarKey>("NEC");
  const [newRuleAccount, setNewRuleAccount] = useState("");
  const [newRuleDestination, setNewRuleDestination] = useState("");
  const [newRuleIncomeType, setNewRuleIncomeType] = useState("");

  // Nouveau compte
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountIcon, setNewAccountIcon] = useState("💳");

  // Nouveau compte de revenu
  const [newRevenueAccountName, setNewRevenueAccountName] = useState("");
  const [newRevenueAccountIcon, setNewRevenueAccountIcon] = useState("💰");
  const [newRevenueAccountType, setNewRevenueAccountType] = useState("");

  // Devises préférées
  const [preferredCurrencies, setPreferredCurrenciesState] = useState<string[]>(loadPreferredCurrencies);
  const [currencySearch, setCurrencySearch] = useState("");

  const handleAddCurrency = (code: string) => {
    if (preferredCurrencies.includes(code)) return;
    const updated = [...preferredCurrencies, code];
    setPreferredCurrenciesState(updated);
    savePreferredCurrencies(updated);
    window.dispatchEvent(new Event("preferredCurrenciesUpdated"));
    setCurrencySearch("");
  };

  const handleRemoveCurrency = (code: string) => {
    if (code === "EUR") return;
    const updated = preferredCurrencies.filter((c) => c !== code);
    setPreferredCurrenciesState(updated);
    savePreferredCurrencies(updated);
    window.dispatchEvent(new Event("preferredCurrenciesUpdated"));
  };

  const currencySuggestions = currencySearch.trim()
    ? ALL_CURRENCIES.filter(
        (c) =>
          !preferredCurrencies.includes(c.code) &&
          (c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
           c.label.toLowerCase().includes(currencySearch.toLowerCase()))
      ).slice(0, 6)
    : [];

  // Édition inline des comptes de dépenses
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountName, setEditingAccountName] = useState("");
  const [editingAccountIcon, setEditingAccountIcon] = useState("💳");

  // Édition inline des comptes de revenus
  const [editingRevenueAccountId, setEditingRevenueAccountId] = useState<string | null>(null);
  const [editingRevenueAccountName, setEditingRevenueAccountName] = useState("");
  const [editingRevenueAccountIcon, setEditingRevenueAccountIcon] = useState("💰");

  const totalPercent = jarSettings.reduce((sum, j) => sum + j.percent, 0);

  const handlePercentChange = (key: JarKey, value: string) => {
    const num = parseFloat(value) || 0;
    setJarSettings((prev) =>
      prev.map((j) => (j.key === key ? { ...j, percent: num } : j))
    );
  };

  const handleBalanceChange = (key: JarKey, value: string) => {
    const num = parseFloat(value) || 0;
    setJarSettings((prev) =>
      prev.map((j) => (j.key === key ? { ...j, initialBalance: num } : j))
    );
  };

  const handleSaveSettings = async () => {
    if (totalPercent !== 100) {
      setMessage(t("set.totalMust100"));
      return;
    }
    saveSettings(jarSettings); // localStorage immédiat
    setMessage("⏳ Synchronisation…");
    const result = await saveJarSettings(
      jarSettings.map(j => ({ key: j.key, percent: j.percent, initialBalance: j.initialBalance }))
    );
    if (result.ok) {
      setMessage(t("set.savedCloud"));
    } else {
      setMessage(t("set.localOnly", { error: result.error ?? "" }));
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleResetSettings = async () => {
    if (!confirm(t("set.confirmResetPct"))) return;
    const defaults: JarSetting[] = [
      { key: "NEC", percent: 55, initialBalance: 0 },
      { key: "FFA", percent: 10, initialBalance: 0 },
      { key: "LTSS", percent: 10, initialBalance: 0 },
      { key: "PLAY", percent: 10, initialBalance: 0 },
      { key: "EDUC", percent: 10, initialBalance: 0 },
      { key: "GIFT", percent: 5, initialBalance: 0 },
    ];
    setJarSettings(defaults);
    saveSettings(defaults); // localStorage immédiat
    const result = await saveJarSettings(
      defaults.map(j => ({ key: j.key, percent: j.percent, initialBalance: j.initialBalance }))
    );
    if (result.ok) {
      setMessage(t("set.resetDone"));
    } else {
      setMessage(t("set.localOnly", { error: result.error ?? "" }));
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAddRule = () => {
    if (!newRuleKeyword.trim()) {
      alert(t("set.keywordRequired"));
      return;
    }

    const newRule: AutoRule = {
      id: `rule_${Date.now()}`,
      mode: newRuleMode,
      keyword: newRuleKeyword.trim(),
      jar: newRuleMode === "spending" ? newRuleJar : undefined,
      account: newRuleMode === "spending" ? newRuleAccount : undefined,
      destination: newRuleMode === "revenue" ? newRuleDestination : undefined,
      incomeType: newRuleMode === "revenue" ? newRuleIncomeType : undefined,
    };

    const updated = [...rules, newRule];
    setRules(updated);
    saveRules(updated);
    setNewRuleKeyword("");
    setNewRuleJar("NEC");
    setNewRuleAccount("");
    setNewRuleDestination("");
    setNewRuleIncomeType("");
    setShowRuleForm(false);
    setMessage(t("set.ruleAdded"));
    setTimeout(() => setMessage(null), 2000);
  };

  const handleDeleteRule = (id: string) => {
    if (!confirm(t("set.confirmDeleteRule"))) return;
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    saveRules(updated);
    setMessage(t("set.ruleDeleted"));
    setTimeout(() => setMessage(null), 2000);
  };

  const handleAddAccount = () => {
    if (!newAccountName.trim()) {
      alert(t("set.nameRequired"));
      return;
    }

    const newAccount: Account = {
      id: `account_${Date.now()}`,
      name: newAccountName.trim(),
      icon: newAccountIcon,
    };

    const updated = [...accounts, newAccount];
    setAccounts(updated);
    saveAccounts(updated);
    setAccountsApi(updated)
      .then(() => {
        setMessage(t("set.accountAdded"));
        setTimeout(() => setMessage(null), 3000);
      })
      .catch((e) => {
        setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur"));
        setTimeout(() => setMessage(null), 5000);
      });
    window.dispatchEvent(new CustomEvent("spendingAccountsUpdated"));
    setNewAccountName("");
    setNewAccountIcon("💳");
    setShowAccountForm(false);
  };

  const handleEditAccount = (id: string) => {
    const account = accounts.find((a) => a.id === id);
    if (!account) return;
    setEditingAccountId(id);
    setEditingAccountName(account.name);
    setEditingAccountIcon(account.icon ?? "💳");
  };

  const handleCancelEditAccount = () => {
    setEditingAccountId(null);
    setEditingAccountName("");
    setEditingAccountIcon("💳");
  };

  const handleSaveEditAccount = async () => {
    if (!editingAccountId) return;
    if (!editingAccountName.trim()) {
      alert(t("set.nameRequired"));
      return;
    }
    const oldName = accounts.find((a) => a.id === editingAccountId)?.name ?? "";
    const newName = editingAccountName.trim();

    const updated = accounts.map((a) =>
      a.id === editingAccountId
        ? { ...a, name: newName, icon: editingAccountIcon || a.icon }
        : a
    );
    setAccounts(updated);
    saveAccounts(updated);
    window.dispatchEvent(new CustomEvent("spendingAccountsUpdated"));
    setEditingAccountId(null);

    if (oldName && oldName !== newName) {
      setMessage(t("set.updatingTx"));
      await setAccountsApi(updated).catch((e) => setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur")));
      const result = await bulkRenameSpendingAccount(oldName, newName);
      if (result.ok) {
        setMessage(t("set.renamed", { n: result.count }));
      } else {
        setMessage(t("set.listOkTxErr", { error: result.error ?? "" }));
      }
    } else {
      setMessage(t("set.accountUpdated"));
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteAccount = (id: string) => {
    if (!confirm(t("set.confirmDeleteAccount"))) return;
    const updated = accounts.filter((a) => a.id !== id);
    setAccounts(updated);
    saveAccounts(updated);
    setAccountsApi(updated).catch((e) => setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur")));
    window.dispatchEvent(new CustomEvent("spendingAccountsUpdated"));
    setMessage(t("set.accountDeleted"));
    setTimeout(() => setMessage(null), 2000);
  };

  const handleAddRevenueAccount = () => {
    if (!newRevenueAccountName.trim()) {
      alert(t("set.nameRequired"));
      return;
    }

    const newAccount: RevenueAccount = {
      id: `revaccount_${Date.now()}`,
      name: newRevenueAccountName.trim(),
      icon: newRevenueAccountIcon,
      type: newRevenueAccountType,
    };

    const updated = [...revenueAccounts, newAccount];
    setRevenueAccounts(updated);
    saveRevenueAccounts(updated);
    setRevenueAccountsApi(updated).catch((e) => setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur")));
    window.dispatchEvent(new CustomEvent("revenueAccountsUpdated"));
    setNewRevenueAccountName("");
    setNewRevenueAccountIcon("💰");
    setNewRevenueAccountType("");
    setShowRevenueAccountForm(false);
    setMessage(t("set.revAccountAdded"));
    setTimeout(() => setMessage(null), 2000);
  };

  const handleEditRevenueAccount = (id: string) => {
    const account = revenueAccounts.find((a) => a.id === id);
    if (!account) return;
    setEditingRevenueAccountId(id);
    setEditingRevenueAccountName(account.name);
    setEditingRevenueAccountIcon(account.icon ?? "💰");
  };

  const handleCancelEditRevenueAccount = () => {
    setEditingRevenueAccountId(null);
    setEditingRevenueAccountName("");
    setEditingRevenueAccountIcon("💰");
  };

  const handleSaveEditRevenueAccount = async () => {
    if (!editingRevenueAccountId) return;
    if (!editingRevenueAccountName.trim()) {
      alert(t("set.nameRequired"));
      return;
    }
    const oldName = revenueAccounts.find((a) => a.id === editingRevenueAccountId)?.name ?? "";
    const newName = editingRevenueAccountName.trim();

    const updated = revenueAccounts.map((a) =>
      a.id === editingRevenueAccountId
        ? { ...a, name: newName, icon: editingRevenueAccountIcon || a.icon }
        : a
    );
    setRevenueAccounts(updated);
    saveRevenueAccounts(updated);
    window.dispatchEvent(new CustomEvent("revenueAccountsUpdated"));
    setEditingRevenueAccountId(null);

    if (oldName && oldName !== newName) {
      setMessage(t("set.updatingTx"));
      await setRevenueAccountsApi(updated).catch((e) => setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur")));
      const result = await bulkRenameRevenueSource(oldName, newName);
      if (result.ok) {
        setMessage(t("set.renamed", { n: result.count }));
      } else {
        setMessage(t("set.listOkTxErr", { error: result.error ?? "" }));
      }
    } else {
      setMessage(t("set.revAccountUpdated"));
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteRevenueAccount = (id: string) => {
    if (!confirm(t("set.confirmDeleteRevAccount"))) return;
    const updated = revenueAccounts.filter((a) => a.id !== id);
    setRevenueAccounts(updated);
    saveRevenueAccounts(updated);
    setRevenueAccountsApi(updated).catch((e) => setMessage("⚠️ Synchro Sheet: " + (e?.message || "erreur")));
    window.dispatchEvent(new CustomEvent("revenueAccountsUpdated"));
    setMessage(t("set.revAccountDeleted"));
    setTimeout(() => setMessage(null), 2000);
  };

  // ── Blocs repliables : premier passage = jarres ouvertes, ensuite tout replié (voir settingsAccordion.ts) ──
  const lang = useLang();
  const baseCurrency = useBaseCurrency();
  const [openIds, setOpenIds] = useState<string[]>(() => {
    let seen = false;
    let stored: string[] | null = null;
    const forced: string[] = [];
    try {
      seen = !!localStorage.getItem(SEEN_KEY);
      stored = parseOpenIds(sessionStorage.getItem(OPEN_KEY));
      // Arrivée depuis le rappel de janvier de l'accueil : le bloc des transferts doit être ouvert
      if (sessionStorage.getItem("mjars:scrollToTransfers")) forced.push("xfer");
    } catch { /* stockage indisponible : valeurs par défaut */ }
    return initialOpenIds({ seen, stored, forced });
  });
  useEffect(() => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* sans importance */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(OPEN_KEY, JSON.stringify(openIds)); } catch { /* sans importance */ }
  }, [openIds]);
  const isOpen = (id: string) => openIds.includes(id);
  const toggleSection = (id: string) => setOpenIds((prev) => toggleOpenId(prev, id));

  const plural = (n: number, zero: TKey, one: TKey, other: TKey) => (n === 0 ? t(zero) : n === 1 ? t(one) : t(other, { n }));
  const revenueRules = rules.filter((r) => r.mode === "revenue");
  const sumRules = plural(spendingRuleCount + revenueRules.length, "set.sum.rules.zero", "set.sum.rules.one", "set.sum.rules.other");
  const sumAccounts = plural(accounts.length, "set.sum.accounts.zero", "set.sum.accounts.one", "set.sum.accounts.other");
  const sumRevAccounts = plural(revenueAccounts.length, "set.sum.revAccounts.zero", "set.sum.revAccounts.one", "set.sum.revAccounts.other");
  const sumTags = plural(tags.length, "set.sum.tags.zero", "set.sum.tags.one", "set.sum.tags.other");
  const sumDefaults = [defaultSpendingAccount, defaultRevenueAccount].filter(Boolean).join(" · ") || t("set.sum.defaultsNone");
  const SHOWN_CURRENCIES = 5;
  const sumCurrencies = preferredCurrencies.slice(0, SHOWN_CURRENCIES).join(" · ")
    + (preferredCurrencies.length > SHOWN_CURRENCIES ? " " + t("set.sum.more", { n: preferredCurrencies.length - SHOWN_CURRENCIES }) : "");

  return (
    <main className="settings-view">
      <h2 className="settings-title">{t("set.title")}</h2>

      {/* Message de feedback */}
      {message && (
        <div className={`settings-message ${message.includes("✅") ? "success" : "error"}`}>
          {message}
        </div>
      )}

      <SettingsAccordion id="lang" title={t("settings.lang.title")} summary={lang === "fr" ? "Français" : "English"} open={isOpen("lang")} onToggle={toggleSection}><LanguageSettings /></SettingsAccordion>

      {/* Section: Répartition des jarres */}
      <SettingsAccordion id="jars" title={t("set.jarsTitle")} summary={percentsSummary(jarSettings)} open={isOpen("jars")} onToggle={toggleSection}>
      <section className="settings-section">
        <h3 className="settings-section-title">{t("set.jarsTitle")}</h3>

        <div className="jars-grid">
          {jarSettings.map((jar) => (
            <div
              key={jar.key}
              className="jar-card"
              style={{ borderLeftColor: JAR_COLORS[jar.key] }}
            >
              <div className="jar-card-header">
                <span className="jar-card-emoji">{JAR_EMOJIS[jar.key]}</span>
                <span className="jar-card-label">
                  {jar.key} - {JAR_LABELS[jar.key]}
                </span>
              </div>
              <div className="jar-card-inputs">
                <div className="jar-input-row">
                  <span className="jar-input-label">%</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={jar.percent}
                    onChange={(e) => handlePercentChange(jar.key, e.target.value)}
                    className="jar-input"
                    aria-label={`${JAR_LABELS[jar.key]} (%)`}
                  />
                  <span className="jar-input-unit">%</span>
                </div>
                <div className="jar-input-row">
                  <span className="jar-input-label">{curSym()}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={jar.initialBalance}
                    onChange={(e) => handleBalanceChange(jar.key, e.target.value)}
                    className="jar-input"
                    aria-label={`${JAR_LABELS[jar.key]} (${curSym()})`}
                  />
                  <span className="jar-input-unit">{curSym()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className={`settings-total ${
            totalPercent === 100 ? "valid" : totalPercent > 100 ? "error" : "warning"
          }`}
        >
          {t("set.totalPct", { pct: totalPercent })}
        </div>

        <div className="settings-btn-group">
          <button
            type="button"
            className="settings-btn settings-btn-primary"
            onClick={handleSaveSettings}
            disabled={totalPercent !== 100}
          >
            {t("set.saveBtn")}
          </button>
          <button
            type="button"
            className="settings-btn settings-btn-secondary"
            onClick={handleResetSettings}
          >
            {t("set.resetBtn")}
          </button>
        </div>
      </section>
      </SettingsAccordion>

      {/* Section: Transferts entre jarres */}
      <SettingsAccordion id="xfer" title={t("xfer.title")} open={isOpen("xfer")} onToggle={toggleSection}><JarTransfers /></SettingsAccordion>

      {/* Section: Virements entre comptes */}
      <SettingsAccordion id="atr" title={t("atr.title")} open={isOpen("atr")} onToggle={toggleSection}><AccountTransfers /></SettingsAccordion>

      {/* Section: Règles automatiques */}
      <SettingsAccordion id="rules" title={t("set.rulesTitle")} summary={sumRules} open={isOpen("rules")} onToggle={toggleSection}>
      <section className="settings-section">
        <h3 className="settings-section-title">{t("set.rulesTitle")}</h3>

        <EntryRulesSettings
          accountNames={accounts.map((a) => a.name)}
          tags={tags}
          legacySpending={rules.filter((r) => r.mode === "spending")}
          onLegacyMigrated={() => {
            const kept = rules.filter((r) => r.mode !== "spending");
            setRules(kept);
            saveRules(kept);
          }}
          onManualCount={setSpendingRuleCount}
        />

        <h4 className="rules-sub-title">{t("rules.revenueTitle")}</h4>
        {revenueRules.length > 0 && (
          <div className="rules-list">
            {revenueRules.map((rule) => (
              <div key={rule.id} className={`rule-card ${rule.mode}`}>
                <div className="rule-card-content">
                  <p className="rule-keyword">"{rule.keyword}"</p>
                  <div className="rule-details">
                    {rule.mode === "spending" && (
                      <>
                        <span className="rule-badge">{t("set.badgeJar", { v: rule.jar ?? "" })}</span>
                        <span className="rule-badge">{t("set.badgeAccount", { v: rule.account ?? "" })}</span>
                      </>
                    )}
                    {rule.mode === "revenue" && (
                      <>
                        <span className="rule-badge">{t("set.badgeDest", { v: rule.destination ?? "" })}</span>
                        <span className="rule-badge">{t("set.badgeType", { v: rule.incomeType ?? "" })}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="rule-delete-btn"
                  onClick={() => handleDeleteRule(rule.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {!showRuleForm ? (
          <button
            type="button"
            className="settings-btn settings-btn-add settings-btn-small"
            onClick={() => setShowRuleForm(true)}
          >
            {t("set.addRule")}
          </button>
        ) : (
          <div className="form-inline">
            <div className="form-group-inline">
              <label className="form-label-inline">{t("set.keyword")}</label>
              <input
                type="text"
                className="form-input-inline"
                placeholder={t("set.phKeyword")}
                value={newRuleKeyword}
                onChange={(e) => setNewRuleKeyword(e.target.value)}
              />
            </div>

            {newRuleMode === "revenue" && (
              <>
                <div className="form-group-inline">
                  <label className="form-label-inline">{t("set.destination")}</label>
                  <input
                    type="text"
                    className="form-input-inline"
                    placeholder={t("set.phBank")}
                    value={newRuleDestination}
                    onChange={(e) => setNewRuleDestination(e.target.value)}
                  />
                </div>
                <div className="form-group-inline">
                  <label className="form-label-inline">{t("set.type")}</label>
                  <input
                    type="text"
                    className="form-input-inline"
                    placeholder={t("set.phSalary")}
                    value={newRuleIncomeType}
                    onChange={(e) => setNewRuleIncomeType(e.target.value)}
                  />
                </div>
              </>
            )}

            <button
              type="button"
              className="settings-btn settings-btn-add settings-btn-small"
              onClick={handleAddRule}
            >
              {t("set.add")}
            </button>
            <button
              type="button"
              className="settings-btn settings-btn-secondary settings-btn-small"
              onClick={() => setShowRuleForm(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
      </section>
      </SettingsAccordion>

      {/* Section: Comptes de dépenses */}
      <SettingsAccordion id="accounts" title={t("set.spendAccounts")} summary={sumAccounts} open={isOpen("accounts")} onToggle={toggleSection}>
      <section className="settings-section">
        <h3 className="settings-section-title">{t("set.spendAccounts")}</h3>
        {accountsLoading && (
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px" }}>{t("set.loading")}</p>
        )}

        {accounts.length > 0 && (
          <div className="accounts-grid">
            {accounts.map((acc) => (
              <div key={acc.id} className="account-card" style={editingAccountId === acc.id ? { gridColumn: "1 / -1", alignItems: "stretch" } : {}}>
                {editingAccountId === acc.id ? (
                  <>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", width: "100%" }}>
                      <input
                        type="text"
                        className="form-emoji-input"
                        value={editingAccountIcon}
                        onChange={(e) => setEditingAccountIcon(e.target.value)}
                        style={{ flexShrink: 0, width: 48 }}
                      />
                      <input
                        type="text"
                        className="form-input-inline"
                        value={editingAccountName}
                        onChange={(e) => setEditingAccountName(e.target.value)}
                        style={{ flex: 1, minWidth: 0 }}
                        autoFocus
                      />
                    </div>
                    <div className="account-edit-actions">
                      <button
                        type="button"
                        className="settings-btn settings-btn-add settings-btn-small"
                        onClick={handleSaveEditAccount}
                      >
                        {t("set.save")}
                      </button>
                      <button
                        type="button"
                        className="settings-btn settings-btn-secondary settings-btn-small"
                        onClick={handleCancelEditAccount}
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="account-icon">{acc.icon}</span>
                    <span className="account-name">{acc.name}</span>
                    <button
                      type="button"
                      className="account-edit-btn"
                      onClick={() => handleEditAccount(acc.id)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="account-delete-btn"
                      onClick={() => handleDeleteAccount(acc.id)}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {!showAccountForm ? (
          <button
            type="button"
            className="settings-btn settings-btn-add settings-btn-small"
            onClick={() => setShowAccountForm(true)}
          >
            {t("set.addAccount")}
          </button>
        ) : (
          <div className="form-inline">
            <div className="form-group-inline" style={{ flexBasis: "80px" }}>
              <label className="form-label-inline">{t("set.icon")}</label>
              <input
                type="text"
                className="form-emoji-input"
                value={newAccountIcon}
                onChange={(e) => setNewAccountIcon(e.target.value)}
              />
            </div>
            <div className="form-group-inline">
              <label className="form-label-inline">{t("set.name")}</label>
              <input
                type="text"
                className="form-input-inline"
                placeholder={t("set.phAccount")}
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="settings-btn settings-btn-add settings-btn-small"
              onClick={handleAddAccount}
            >
              {t("set.add")}
            </button>
            <button
              type="button"
              className="settings-btn settings-btn-secondary settings-btn-small"
              onClick={() => setShowAccountForm(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
      </section>
      </SettingsAccordion>

      {/* Section: Comptes de revenus */}
      <SettingsAccordion id="revaccounts" title={t("set.revAccounts")} summary={sumRevAccounts} open={isOpen("revaccounts")} onToggle={toggleSection}>
      <section className="settings-section">
        <h3 className="settings-section-title">{t("set.revAccounts")}</h3>

        {revenueAccounts.length > 0 && (
          <div className="accounts-grid">
            {revenueAccounts.map((acc) => (
              <div key={acc.id} className="account-card" style={editingRevenueAccountId === acc.id ? { gridColumn: "1 / -1", alignItems: "stretch" } : {}}>
                {editingRevenueAccountId === acc.id ? (
                  <>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", width: "100%" }}>
                      <input
                        type="text"
                        className="form-emoji-input"
                        value={editingRevenueAccountIcon}
                        onChange={(e) => setEditingRevenueAccountIcon(e.target.value)}
                        style={{ flexShrink: 0, width: 48 }}
                      />
                      <input
                        type="text"
                        className="form-input-inline"
                        value={editingRevenueAccountName}
                        onChange={(e) => setEditingRevenueAccountName(e.target.value)}
                        style={{ flex: 1, minWidth: 0 }}
                        autoFocus
                      />
                    </div>
                    <div className="account-edit-actions">
                      <button
                        type="button"
                        className="settings-btn settings-btn-add settings-btn-small"
                        onClick={handleSaveEditRevenueAccount}
                      >
                        {t("set.save")}
                      </button>
                      <button
                        type="button"
                        className="settings-btn settings-btn-secondary settings-btn-small"
                        onClick={handleCancelEditRevenueAccount}
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="account-icon">{acc.icon}</span>
                    <span className="account-name">{acc.name}</span>
                    <button
                      type="button"
                      className="account-edit-btn"
                      onClick={() => handleEditRevenueAccount(acc.id)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="account-delete-btn"
                      onClick={() => handleDeleteRevenueAccount(acc.id)}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {!showRevenueAccountForm ? (
          <button
            type="button"
            className="settings-btn settings-btn-add settings-btn-small"
            onClick={() => setShowRevenueAccountForm(true)}
          >
            {t("set.addAccount")}
          </button>
        ) : (
          <div className="form-inline">
            <div className="form-group-inline" style={{ flexBasis: "80px" }}>
              <label className="form-label-inline">{t("set.icon")}</label>
              <input
                type="text"
                className="form-emoji-input"
                value={newRevenueAccountIcon}
                onChange={(e) => setNewRevenueAccountIcon(e.target.value)}
              />
            </div>
            <div className="form-group-inline">
              <label className="form-label-inline">{t("set.name")}</label>
              <input
                type="text"
                className="form-input-inline"
                placeholder={t("set.phRevAccount")}
                value={newRevenueAccountName}
                onChange={(e) => setNewRevenueAccountName(e.target.value)}
              />
            </div>
            <div className="form-group-inline">
              <label className="form-label-inline">{t("set.type")}</label>
              <input
                type="text"
                className="form-input-inline"
                placeholder={t("set.phRevType")}
                value={newRevenueAccountType}
                onChange={(e) => setNewRevenueAccountType(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="settings-btn settings-btn-add settings-btn-small"
              onClick={handleAddRevenueAccount}
            >
              {t("set.add")}
            </button>
            <button
              type="button"
              className="settings-btn settings-btn-secondary settings-btn-small"
              onClick={() => setShowRevenueAccountForm(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
      </section>
      </SettingsAccordion>

      <SettingsAccordion id="crypto" title={t("settings.crypto.title")} open={isOpen("crypto")} onToggle={toggleSection}><CryptoSettings /></SettingsAccordion>

      {/* ── Comptes par défaut ── */}
      <SettingsAccordion id="defaults" title={t("set.defaultsTitle")} summary={sumDefaults} open={isOpen("defaults")} onToggle={toggleSection}>
      <section className="settings-section">
        <h3 className="settings-section-title">{t("set.defaultsTitle")}</h3>
        <p className="settings-section-desc">{t("set.defaultsDesc")}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
            {t("set.defaultSpending")}
            <select
              value={defaultSpendingAccount}
              onChange={e => {
                setDefaultSpendingAccount(e.target.value);
                saveDefaultAccount(DEFAULT_SPENDING_ACCOUNT_KEY, e.target.value);
                window.dispatchEvent(new Event("defaultAccountsUpdated"));
                setMessage(t("set.defaultSaved"));
                setTimeout(() => setMessage(null), 2000);
              }}
              style={{ padding: "10px 12px", border: "1.5px solid var(--border-color)", borderRadius: 10, fontSize: 15, background: "var(--bg-card)", color: "var(--text-main)" }}
            >
              <option value="">{t("set.noneLast")}</option>
              {accounts.map(a => <option key={a.id} value={a.name}>{a.icon} {a.name}</option>)}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
            {t("set.defaultRevenue")}
            <select
              value={defaultRevenueAccount}
              onChange={e => {
                setDefaultRevenueAccount(e.target.value);
                saveDefaultAccount(DEFAULT_REVENUE_ACCOUNT_KEY, e.target.value);
                window.dispatchEvent(new Event("defaultAccountsUpdated"));
                setMessage(t("set.defaultSaved"));
                setTimeout(() => setMessage(null), 2000);
              }}
              style={{ padding: "10px 12px", border: "1.5px solid var(--border-color)", borderRadius: 10, fontSize: 15, background: "var(--bg-card)", color: "var(--text-main)" }}
            >
              <option value="">{t("set.noneLast")}</option>
              {revenueAccounts.map(a => <option key={a.id} value={a.name}>{a.icon} {a.name}</option>)}
            </select>
          </label>
        </div>
      </section>
      </SettingsAccordion>

      <SettingsAccordion id="base" title={t("settings.base.title")} summary={baseCurrency} open={isOpen("base")} onToggle={toggleSection}><BaseCurrencySettings /></SettingsAccordion>

      {/* ── Devises préférées ── */}
      <SettingsAccordion id="currencies" title={t("set.currenciesTitle")} summary={sumCurrencies} open={isOpen("currencies")} onToggle={toggleSection}>
      <section className="settings-section">
        <h3 className="settings-section-title">{t("set.currenciesTitle")}</h3>
        <p className="settings-section-desc">
          {t("set.currenciesDesc")} {t("set.baseAlways", { code: "EUR" })}
        </p>

        <div className="settings-currency-list">
          {preferredCurrencies.map((code) => {
            const info = getCurrencyInfo(code);
            return (
              <div key={code} className="settings-currency-item">
                <span className="settings-currency-flag">{info.flag}</span>
                <span className="settings-currency-code">{code}</span>
                <span className="settings-currency-label">{info.label}</span>
                {code !== "EUR" && (
                  <button
                    type="button"
                    className="settings-btn settings-btn-danger settings-btn-small"
                    onClick={() => handleRemoveCurrency(code)}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="settings-currency-add">
          <input
            type="text"
            className="settings-input"
            placeholder={t("set.phCurrency")}
            value={currencySearch}
            onChange={(e) => setCurrencySearch(e.target.value)}
          />
          {currencySuggestions.length > 0 && (
            <div className="settings-currency-suggestions">
              {currencySuggestions.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className="settings-currency-suggestion"
                  onClick={() => handleAddCurrency(c.code)}
                >
                  <span>{c.flag}</span>
                  <strong>{c.code}</strong>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
      </SettingsAccordion>
      {/* ── Section Tags ── */}
      <SettingsAccordion id="tags" title={t("set.tagsTitle")} summary={sumTags} open={isOpen("tags")} onToggle={toggleSection}>
      <section className="settings-section">
        <h3 className="settings-section-title">{t("set.tagsTitle")}</h3>

        {tagsLoading && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("set.loading")}</p>}

        {/* Liste des tags */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tags.map(tag => (
            <div key={tag.id}>
              {editingTagId === tag.id ? (
                /* ── Formulaire d'édition inline ── */
                <div style={{ background: "var(--bg-body)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{t("set.emoji")}</div>
                      <input type="text" value={editTagDraft.emoji ?? tag.emoji} onChange={e => setEditTagDraft(d => ({ ...d, emoji: e.target.value }))}
                        style={{ width: "100%", padding: "8px 6px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 20, textAlign: "center", background: "var(--bg-card)", color: "var(--text-main)" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{t("set.name")}</div>
                      <input type="text" value={editTagDraft.name ?? tag.name} onChange={e => setEditTagDraft(d => ({ ...d, name: e.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{t("set.color")}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="color" value={editTagDraft.color ?? tag.color} onChange={e => setEditTagDraft(d => ({ ...d, color: e.target.value }))}
                          style={{ width: 36, height: 36, border: "none", borderRadius: 8, cursor: "pointer", padding: 2 }} />
                        <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>{editTagDraft.color ?? tag.color}</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{t("set.favorite")}</div>
                      <button type="button" onClick={() => setEditTagDraft(d => ({ ...d, favori: !(d.favori ?? tag.favori) }))}
                        style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid var(--border-color)", background: (editTagDraft.favori ?? tag.favori) ? "#FFF9C4" : "var(--bg-card)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-main)" }}>
                        {(editTagDraft.favori ?? tag.favori) ? t("common.yesStar") : t("common.noStar")}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleEditTagSave} className="settings-btn settings-btn-primary" style={{ flex: 2 }}>{t("common.saveDisk")}</button>
                    <button onClick={() => setEditingTagId(null)} className="settings-btn" style={{ flex: 1 }}>{t("set.cancelPlain")}</button>
                  </div>
                </div>
              ) : (
                /* ── Ligne tag normal ── */
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border-color)" }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{tag.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-main)" }}>{tag.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: tag.color, display: "inline-block", flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{tag.id}</span>
                      {tag.favori && <span style={{ fontSize: 10, background: "#FFF9C4", color: "#B8860B", borderRadius: 6, padding: "1px 6px", fontWeight: 600 }}>{t("set.favoriteStar")}</span>}
                    </div>
                  </div>
                  <button onClick={() => { setEditingTagId(tag.id); setEditTagDraft({}); }}
                    className="settings-btn settings-btn-small" style={{ flexShrink: 0 }}>✏️</button>
                  <button onClick={() => handleDeleteTag(tag.id)}
                    className="settings-btn settings-btn-danger settings-btn-small" style={{ flexShrink: 0 }}>🗑️</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Formulaire ajout */}
        {showAddTag ? (
          <div style={{ background: "var(--bg-body)", borderRadius: 12, padding: 14, marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-main)" }}>{t("set.newTag")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{t("set.emoji")}</div>
                <input type="text" value={newTagDraft.emoji} onChange={e => setNewTagDraft(d => ({ ...d, emoji: e.target.value }))}
                  style={{ width: "100%", padding: "8px 6px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 20, textAlign: "center", background: "var(--bg-card)", color: "var(--text-main)" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{t("set.name")}</div>
                <input type="text" placeholder={t("set.phTagName")} value={newTagDraft.name} onChange={e => setNewTagDraft(d => ({ ...d, name: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)" }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{t("set.tagId")}</div>
              <input type="text" placeholder={t("set.phTagId")} value={newTagDraft.id}
                onChange={e => setNewTagDraft(d => ({ ...d, id: e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") }))}
                onBlur={() => { if (!newTagDraft.id && newTagDraft.name) setNewTagDraft(d => ({ ...d, id: (d.name || "").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") })); }}
                style={{ width: "100%", padding: "8px 10px", border: "1.5px solid var(--border-color)", borderRadius: 8, fontSize: 14, fontFamily: "monospace", background: "var(--bg-card)", color: "var(--text-main)" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{t("set.color")}</div>
                <input type="color" value={newTagDraft.color} onChange={e => setNewTagDraft(d => ({ ...d, color: e.target.value }))}
                  style={{ width: "100%", height: 36, border: "none", borderRadius: 8, cursor: "pointer", padding: 2 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{t("set.favorite")}</div>
                <button type="button" onClick={() => setNewTagDraft(d => ({ ...d, favori: !d.favori }))}
                  style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "1.5px solid var(--border-color)", background: newTagDraft.favori ? "#FFF9C4" : "var(--bg-card)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-main)" }}>
                  {newTagDraft.favori ? t("common.yesStar") : t("common.noStar")}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAddTag} className="settings-btn settings-btn-primary" style={{ flex: 2 }}>{t("set.addBtn")}</button>
              <button onClick={() => setShowAddTag(false)} className="settings-btn" style={{ flex: 1 }}>{t("set.cancelPlain")}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddTag(true)} className="settings-btn settings-btn-primary" style={{ width: "100%", marginTop: 10 }}>
            {t("set.addTag")}
          </button>
        )}
      </section>
      </SettingsAccordion>

      {/* ── Compte ──────────────────────────────────────────────────── */}
      <SettingsAccordion id="account" title={t("set.account")} open={isOpen("account")} onToggle={toggleSection}>
      <section className="settings-section">
        <h2 className="settings-section-title">{t("set.account")}</h2>
        <LogoutButton />
        <DataAccountSection />
      </section>
      </SettingsAccordion>

    </main>
  );
};

export default SettingsView;
