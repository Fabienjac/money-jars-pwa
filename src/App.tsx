// src/App.tsx - VERSION V3 FINALE avec "Utiliser" qui fonctionne
import React, { useState, useEffect, lazy, Suspense } from "react";
import { useT, useLang, t as tr } from "./i18n";
import { useBaseCurrency, getBaseCurrency, formatRevenueValue } from "./baseCurrency";
import { getRateToBase } from "./exchangeRate";
import SpendingForm from "./components/SpendingForm";
import RevenueForm from "./components/RevenueForm";
import type { HistoryUseEntry } from "./components/HistoryView";
import JarsView from "./components/JarsView";
import JarsViewV2 from "./components/JarsViewV2";
import QuickSpendingForm from "./components/QuickSpendingForm";
import { VoiceSpendingModal } from "./components/VoiceSpendingModal";
import { RecentTransactions } from "./components/RecentTransactions";
import { ImportSuccessScreen } from "./components/ImportSuccessScreen";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { AuthScreen } from "./components/AuthScreen";
import { LandingPage } from "./components/LandingPage";
import { OnboardingFlow } from "./components/OnboardingFlow";
import { PaywallModal } from "./components/PaywallModal";
import MoreView from "./components/MoreView";
import { useOffline } from "./hooks/useOffline";
import { useAuth } from "./contexts/AuthContext";
import { loadAccounts } from "./accountsUtils";
import { getAccounts, fetchTagsFromSheet, fetchTotals, fetchAnalytics, fetchNetWorth, searchSpendings, appendSpending, appendRevenue } from "./api";
import { setCachedTags } from "./tagsUtils";
import type { Account } from "./types";
import { offlineManager } from "./offlineManager";
import { updateStreak } from "./streakUtils";
import "./style.css";

// Lazy-loaded heavy views
const HistoryView = lazy(() => import("./components/HistoryView"));
const SettingsView = lazy(() => import("./components/SettingsView"));
const AnalyticsView = lazy(() => import("./components/AnalyticsView"));
const UniversalImporterLazy = lazy(() =>
  import("./components/UniversalImporter").then(m => ({ default: m.UniversalImporter }))
);

const SuspenseFallback = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px", color: "var(--text-muted)" }}>
    {tr("common.loading")}
  </div>
);

type Section = "home" | "history" | "analytics" | "more" | "settings";
type EntryMode = "spending" | "revenue";

function App() {
  const { user, loading: authLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>("home");
  const t = useT();
  const lang = useLang();
  const baseCurrency = useBaseCurrency(); // remonte les écrans si la devise de référence change
  const [darkMode, setDarkMode] = useState(false);

  const [entryOpen, setEntryOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>("spending");

  const [prefillSpending, setPrefillSpending] = useState<any | null>(null);
  const [prefillRevenue, setPrefillRevenue] = useState<any | null>(null);

  // ✅ AJOUT : États pour les nouveaux modals V2
  const [showQuickSpending, setShowQuickSpending] = useState(false);
  const [showQuickRevenue, setShowQuickRevenue] = useState(false);
  
  // ✅ AJOUT : Toggle pour activer/désactiver la V2
  const [useV2, setUseV2] = useState(() => {
    try {
      const stored = localStorage.getItem("use_jars_v2");
      return stored === null ? true : stored === "true"; // Par défaut TRUE = V2 activée
    } catch {
      return true; // Par défaut, utiliser V2
    }
  });

  // Saisie vocale
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Importeur universel
  const [importerOpen, setImporterOpen] = useState(false);
  
  // États pour l'écran de succès d'importation
  const [showImportSuccess, setShowImportSuccess] = useState(false);
  const [importStats, setImportStats] = useState({ successCount: 0, errorCount: 0 });
  const [isImporting, setIsImporting] = useState(false);
  
  // Comptes de dépenses
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Mode offline
  const offline = useOffline();
  const [pendingCount, setPendingCount] = useState(() => offlineManager.getPendingCount());

  useEffect(() => {
    return offlineManager.subscribe((state) => setPendingCount(state.pendingTransactions.length));
  }, []);

  // Vérifier si l'onboarding a déjà été fait (jar_settings présents)
  useEffect(() => {
    if (!user) return;
    import("./lib/supabase").then(({ supabase }) => {
      supabase.from("jar_settings").select("id").eq("user_id", user.id).limit(1)
        .then(({ data, error }) => {
          // En cas d'erreur réseau, on ne touche pas à l'état existant
          // pour éviter de relancer l'onboarding sur un compte déjà configuré
          if (!error) setOnboardingDone(!!(data && data.length > 0));
        });
    });
  }, [user]);

  // Thème
  useEffect(() => {
    try {
      const stored = localStorage.getItem("mj-dark-mode");
      if (stored === "1") setDarkMode(true);
    } catch {}
  }, []);

  // Charger les comptes depuis le Sheet (synchro Mac / iPhone)
  useEffect(() => {
    if (!user) return;
    getAccounts()
      .then((list) => setAccounts(list.length > 0 ? list : loadAccounts()))
      .catch(() => setAccounts(loadAccounts()));
  }, [user]);

  // Charger les tags depuis le Sheet au démarrage
  useEffect(() => {
    fetchTagsFromSheet()
      .then(tags => { if (tags.length > 0) setCachedTags(tags); })
      .catch(() => { /* silencieux — les défauts codés en dur sont utilisés */ });
  }, []);

  // ── Prefetch silencieux au démarrage ──────────────────────────────────────
  // Chauffe le cache dès l'ouverture de l'app, en parallèle, sans bloquer l'UI.
  // Quand l'utilisateur navigue vers l'écran d'accueil ou les rapports,
  // les données sont déjà en cache → affichage quasi-instantané.
  useEffect(() => {
    const warmCache = () => {
      Promise.allSettled([
        fetchTotals(),
        fetchAnalytics(),
        fetchNetWorth(),
        searchSpendings("", 500), // pour le graphique + tags du mois
      ]);
    };
    // Délai de 1.5s pour ne pas concurrencer le rendu initial
    const t = setTimeout(warmCache, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const reload = () => {
      getAccounts()
        .then((list) => setAccounts(list.length > 0 ? list : loadAccounts()))
        .catch(() => setAccounts(loadAccounts()));
    };
    window.addEventListener("spendingAccountsUpdated", reload);
    return () => window.removeEventListener("spendingAccountsUpdated", reload);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("mj-dark-mode", darkMode ? "1" : "0");
    } catch {}
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{
        minHeight: "100dvh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "var(--bg-body)",
      }}>
        <div style={{ fontSize: "40px" }}>🏺</div>
      </div>
    );
  }

  if (!user) {
    return showAuth
      ? <AuthScreen />
      : <LandingPage onStart={() => setShowAuth(true)} />;
  }

  if (onboardingDone === null) {
    return (
      <div style={{
        minHeight: "100dvh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "var(--bg-body)",
      }}>
        <div style={{ fontSize: "40px" }}>🏺</div>
      </div>
    );
  }

  if (!onboardingDone) {
    return <OnboardingFlow onComplete={() => setOnboardingDone(true)} />;
  }
  // ──────────────────────────────────────────────────────────────────────────

  const openEntry = (mode: EntryMode, prefill?: any) => {
    setEntryMode(mode);
    if (mode === "spending") {
      setPrefillSpending(prefill ?? null);
    } else {
      setPrefillRevenue(prefill ?? null);
    }
    setEntryOpen(true);
  };

  const closeEntry = () => {
    setEntryOpen(false);
  };

  // ✅ NOUVEAU : Gérer "Utiliser" avec la V2
  const handleUseEntry = (entry: HistoryUseEntry) => {
    if (useV2) {
      // Mode V2 : ouvrir les nouveaux modals
      if (entry.kind === "spending") {
        setPrefillSpending(entry.row);
        setShowQuickSpending(true);
      } else {
        setPrefillRevenue(entry.row);
        setShowQuickRevenue(true);
      }
    } else {
      // Mode V1 : ancien comportement
      if (entry.kind === "spending") {
        openEntry("spending", entry.row);
      } else {
        openEntry("revenue", entry.row);
      }
    }
  };

  // Import de transactions depuis fichiers
  const handleImportTransactions = async (transactions: any[], type: "spending" | "revenue" = "spending") => {
    console.log(`📦 Importing ${transactions.length} ${type === "revenue" ? "revenues" : "transactions"}...`);
    
    // Normalise n'importe quel format de date vers YYYY-MM-DD (attendu par Supabase)
    const normalizeToISO = (dateStr: string): string => {
      if (!dateStr) return "";
      const cleaned = dateStr.replace(/\s*:\s*/g, ":").replace(/\s*,\s*/g, ", ").trim();

      // Déjà YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);

      // DD/MM/YYYY
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
        const [d, m, y] = cleaned.split("/");
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }

      // "04 September 2025, 12:00pm"
      const months: { [key: string]: string } = {
        January: "01", February: "02", March: "03", April: "04",
        May: "05", June: "06", July: "07", August: "08",
        September: "09", October: "10", November: "11", December: "12",
      };
      const match = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (match) {
        const day = match[1].padStart(2, "0");
        const month = months[match[2]];
        if (month) return `${match[3]}-${month}-${day}`;
      }

      console.warn(`⚠️ Could not parse date: ${dateStr}`);
      return cleaned;
    };
    
    // Afficher l'écran "Importation en cours..."
    setIsImporting(true);
    setShowImportSuccess(true);
    setImporterOpen(false); // Fermer l'importeur
    
    try {
      let successCount = 0;
      let errorCount = 0;

      // Fonction pour extraire la devise de la méthode
      const extractCurrencyFromMethod = (method: string): string | null => {
        if (!method) return null;
        const knownCurrencies = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'ADA', 'SOL', 'DOGE', 'DOT', 'MATIC', 'LTC', 'BCH'];
        // "USDC_ETH" ou "USDT_TRC20" → devise = partie avant "_" (actif, pas le réseau)
        if (method.includes('_')) {
          const firstToken = method.split('_')[0].trim().toUpperCase();
          if (knownCurrencies.includes(firstToken)) return firstToken;
        }
        const currencyPatterns = [
          /BTC/i, /ETH/i, /USDT/i, /USDC/i, /XRP/i,
          /ADA/i, /SOL/i, /DOGE/i, /DOT/i, /MATIC/i,
          /LTC/i, /BCH/i,
        ];
        for (const pattern of currencyPatterns) {
          if (pattern.test(method)) {
            return method.match(pattern)![0].toUpperCase();
          }
        }
        return null;
      };

      // Fonction pour récupérer le taux de change historique
      // Taux vers la devise de référence (fiat : taux historique ; crypto : prix CoinGecko)
      const getHistoricalRate = (fromCurrency: string, dateStr: string): Promise<number | null> =>
        getRateToBase(fromCurrency, dateStr);

      // Importer chaque transaction individuellement
      const logImportFailure = (index: number, t: any, reason: string) => {
        console.error(
          `❌ Échec import #${index + 1}:`,
          `${String(t?.date ?? "")} | ${String(t?.description ?? t?.suggestedSource ?? "")} | ${t?.amount ?? ""} ${getBaseCurrency()}`,
          "→",
          reason
        );
      };

      for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];
        try {
          // Pour les REVENUS : calculer automatiquement le taux si nécessaire
          let resolvedRate = t.usdEurRate || t.tauxUSDEUR || null;
          if (type === "revenue" && (!resolvedRate || resolvedRate === 0)) {
            const method = t.methodeCrypto || t.suggestedMethod || "";
            const currency = extractCurrencyFromMethod(method);
            if (currency && currency !== getBaseCurrency()) {
              const fetchedRate = await getHistoricalRate(currency, t.date);
              if (fetchedRate) resolvedRate = fetchedRate;
            }
          }

          // Envoi vers Supabase via api.ts
          const date = normalizeToISO(t.date); // DD/MM/YYYY attendu par api.ts

          let result: { ok: boolean; error?: string };

          if (type === "spending") {
            result = await appendSpending({
              date,
              jar:          t.suggestedJar,
              account:      t.suggestedAccount || "",
              amount:       t.amount,
              description:  t.description || "",
              tags:         t.tags || "",
              subscription: "",
            });
          } else {
            // Montant converti dans la devise de référence ; montant d'origine conservé dans « value »
            const baseCur = getBaseCurrency();
            const valStr = String(t.valeur || t.currency || "").trim().toUpperCase();
            const cur = /^[A-Z]{3}$/.test(valStr) ? valStr : baseCur;
            const origAmount = Number(t.amount) || 0;
            const fx = cur === baseCur ? 1 : await getRateToBase(cur, t.date);
            if (!fx) {
              logImportFailure(i, t, tr("app.rateFail", { cur, base: baseCur }));
              errorCount++;
              continue;
            }
            const baseAmount = Math.round(origAmount * fx * 100) / 100;
            const qty = Number(t.quantiteCrypto) || 0;
            result = await appendRevenue({
              date,
              source:         t.suggestedSource || t.suggestedAccount || t.description || "",
              amount:         origAmount ? baseAmount : undefined,
              value:          origAmount ? formatRevenueValue(origAmount, cur) : (t.valeur || t.currency || null),
              cryptoQuantity: t.quantiteCrypto || null,
              method:         t.methodeCrypto || t.suggestedMethod || null,
              rate:           qty > 0 && baseAmount > 0 ? baseAmount / qty : (cur !== baseCur ? fx : (resolvedRate ?? undefined)),
              cryptoAddress:  t.adresseCrypto || null,
              destination:    t.compteDestination || t.suggestedMethod || null,
              incomeType:     t.type || null,
              tags:           t.tags || "",
            });
          }

          if (result.ok) {
            console.log(`✅ Imported #${i + 1}: ${t.description || t.suggestedSource}`);
            successCount++;
            if (type === "spending") updateStreak();
          } else {
            logImportFailure(i, t, result.error || tr("app.supabaseErr"));
            errorCount++;
          }

        } catch (error: any) {
          logImportFailure(i, t, error?.message || String(error));
          errorCount++;
        }
      }

      if (errorCount > 0) {
        console.warn(`⚠️ Import terminé: ${successCount} réussie(s), ${errorCount} échouée(s). Voir les lignes "❌ Échec import #N" ci-dessus pour le détail.`);
      } else {
        console.log(`✅ Import terminé: ${successCount} réussie(s), ${errorCount} échouée(s)`);
      }
      
      // Message différent selon le mode
      if (!offline.isOnline && successCount > 0) {
        console.log(`📴 ${successCount} transaction(s) seront synchronisées au retour en ligne`);
      }
      
      // Mettre à jour les stats et afficher l'écran de succès
      setImportStats({ successCount, errorCount });
      setIsImporting(false);
      
    } catch (error: any) {
      console.error("❌ Erreur import:", error);
      setImportStats({ successCount: 0, errorCount: transactions.length });
      setIsImporting(false);
    }
  };

  const navColor = (active: boolean) => (active ? "#007AFF" : "#8E8E93");

  const openSpending = () => {
    if (useV2) {
      setPrefillSpending(null);
      setShowQuickSpending(true);
    } else {
      openEntry("spending");
    }
  };

  return (
    <div className={`app-shell ${darkMode ? "dark" : ""}`}>
      {/* Paywall si essai expiré / abonnement inactif */}
      <PaywallModal />

      {/* Indicateur de mode offline */}
      <OfflineIndicator />

      {/* Badge transactions en attente */}
      {pendingCount > 0 && (
        <div
          style={{
            position: "fixed",
            top: "12px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2000,
            backgroundColor: "#FF9500",
            color: "white",
            fontSize: "13px",
            fontWeight: "700",
            padding: "6px 14px",
            borderRadius: "20px",
            boxShadow: "0 2px 8px rgba(255, 149, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            cursor: "default",
          }}
          title={t("app.pendingTitle")}
        >
          {t("app.pending", { n: pendingCount })}
        </div>
      )}
      
      <div className="app-main">
        {section === "home" && (
          <header className="home-header">
            <div>
              <p className="home-kicker">{t("app.kicker")}</p>
              <h1 className="home-title">{t("app.title")}</h1>
            </div>
          </header>
        )}

        <main className="app-content" key={`${baseCurrency}-${lang}`}>
          {/* ✅ MODIFICATION : Utiliser JarsViewV2 */}
          {section === "home" && (
            <>
              {useV2 ? (
                <JarsViewV2
                  onOpenRevenue={() => setShowQuickRevenue(true)}
                />
              ) : (
                <JarsView />
              )}
            </>
          )}
          
          {section === "history" && (
            <Suspense fallback={<SuspenseFallback />}>
              <HistoryView view="history" onUseEntry={handleUseEntry} onImport={() => setImporterOpen(true)} />
            </Suspense>
          )}
          {section === "analytics" && (
            <Suspense fallback={<SuspenseFallback />}>
              <AnalyticsView />
            </Suspense>
          )}
          {section === "more" && (
            <MoreView
              darkMode={darkMode}
              onToggleDark={() => setDarkMode((v) => !v)}
              onImport={() => setImporterOpen(true)}
              onOpenSettings={() => setSection("settings")}
            />
          )}
          {section === "settings" && (
            <>
              <button type="button" className="back-link" onClick={() => setSection("more")}>
                ‹ {t("nav.more")}
              </button>
              <Suspense fallback={<SuspenseFallback />}>
                <SettingsView />
              </Suspense>
            </>
          )}
        </main>
      </div>

      {/* Bottom navigation */}
      <nav className="bottom-nav">
        <button
          type="button"
          className={`bottom-nav-btn ${section === "home" ? "active" : ""}`}
          onClick={() => setSection("home")}
        >
          <span className="bottom-nav-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M3.5 10.5L14 3.5L24.5 10.5V22.75C24.5 23.3467 24.2629 23.919 23.841 24.341C23.419 24.7629 22.8467 25 22.25 25H5.75C5.15326 25 4.58097 24.7629 4.15901 24.341C3.73705 23.919 3.5 23.3467 3.5 22.75V10.5Z"
                stroke={navColor(section === "home")}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10.5 25V14H17.5V25"
                stroke={navColor(section === "home")}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="bottom-nav-label">{t("nav.home")}</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-btn ${section === "history" ? "active" : ""}`}
          onClick={() => setSection("history")}
        >
          <span className="bottom-nav-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M22.75 24.5H5.25C4.42157 24.5 3.75 23.8284 3.75 23V5.5C3.75 4.67157 4.42157 4 5.25 4H22.75C23.5784 4 24.25 4.67157 24.25 5.5V23C24.25 23.8284 23.5784 24.5 22.75 24.5Z"
                stroke={navColor(section === "history")}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3.75 10.5H24.25M10.5 4V7M17.5 4V7"
                stroke={navColor(section === "history")}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect x="8" y="14" width="4" height="4" rx="1" fill={navColor(section === "history")} />
              <rect x="16" y="14" width="4" height="4" rx="1" fill={navColor(section === "history")} />
            </svg>
          </span>
          <span className="bottom-nav-label">{t("nav.history")}</span>
        </button>

        <button
          type="button"
          className="bottom-nav-add"
          aria-label={t("nav.expenseAria")}
          onClick={openSpending}
        >
          <span className="bottom-nav-add-circle">+</span>
          <span className="bottom-nav-label bottom-nav-add-label">{t("nav.expense")}</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-btn ${section === "analytics" ? "active" : ""}`}
          onClick={() => setSection("analytics")}
        >
          <span className="bottom-nav-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M4 24V13M11 24V5M18 24V16M25 24V9"
                stroke={navColor(section === "analytics")}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="bottom-nav-label">{t("nav.analytics")}</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-btn ${section === "more" || section === "settings" ? "active" : ""}`}
          onClick={() => setSection("more")}
        >
          <span className="bottom-nav-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="6" cy="14" r="2.2" fill={navColor(section === "more" || section === "settings")} />
              <circle cx="14" cy="14" r="2.2" fill={navColor(section === "more" || section === "settings")} />
              <circle cx="22" cy="14" r="2.2" fill={navColor(section === "more" || section === "settings")} />
            </svg>
          </span>
          <span className="bottom-nav-label">{t("nav.more")}</span>
        </button>
      </nav>

      {/* 🎙️ Modal saisie vocale */}
      {voiceOpen && (
        <VoiceSpendingModal
          onClose={() => setVoiceOpen(false)}
          onSaved={() => setVoiceOpen(false)}
        />
      )}

      {/* ✅ AJOUT : Modal QuickSpendingForm avec prefill */}
      {showQuickSpending && (
        <QuickSpendingForm
          prefill={prefillSpending}
          onVoice={() => {
            setShowQuickSpending(false);
            setPrefillSpending(null);
            setVoiceOpen(true);
          }}
          onClose={() => {
            setShowQuickSpending(false);
            setPrefillSpending(null); // Réinitialiser
          }}
          onSuccess={() => {}}
        />
      )}

      {/* ✅ AJOUT : Modal RevenueForm avec prefill */}
      {showQuickRevenue && (
        <RevenueForm
          fullscreen
          prefill={prefillRevenue}
          onClearPrefill={() => setPrefillRevenue(null)}
          onClose={() => {
            setShowQuickRevenue(false);
            setPrefillRevenue(null);
          }}
          onSuccess={() => {
            setShowQuickRevenue(false);
            setPrefillRevenue(null);
          }}
        />
      )}

      {/* Bottom sheet "Nouvelle entrée" (V1 uniquement) */}
      {entryOpen && !useV2 && (
        <div className="entry-sheet-backdrop" onClick={closeEntry}>
          <div
            className="entry-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="entry-sheet-header">
              <div className="entry-tabs">
                <button
                  type="button"
                  className={`entry-tab ${
                    entryMode === "spending" ? "active" : ""
                  }`}
                  onClick={() => setEntryMode("spending")}
                >
                  {t("nav.expense")}
                </button>
                <button
                  type="button"
                  className={`entry-tab ${
                    entryMode === "revenue" ? "active" : ""
                  }`}
                  onClick={() => setEntryMode("revenue")}
                >
                  {t("app.income")}
                </button>
              </div>
              <button
                type="button"
                className="entry-close-btn"
                onClick={closeEntry}
              >
                ×
              </button>
            </header>

            <RecentTransactions
              mode={entryMode}
              onSelect={(transaction) => {
                if (entryMode === "spending") {
                  setPrefillSpending(transaction);
                } else {
                  setPrefillRevenue(transaction);
                }
              }}
            />

            <div className="entry-sheet-body">
              {entryMode === "spending" ? (
                <SpendingForm
                  prefill={prefillSpending}
                  onClearPrefill={() => setPrefillSpending(null)}
                />
              ) : (
                <RevenueForm
                  prefill={prefillRevenue}
                  onClearPrefill={() => setPrefillRevenue(null)}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Importeur universel — plein écran */}
      {importerOpen && (
        <div className="isf-screen">
          <div className="rsf-header">
            <button type="button" className="qsf-close" onClick={() => setImporterOpen(false)} aria-label={t("app.close")}>✕</button>
            <h2 className="qsf-title">{t("app.importTitle")}</h2>
            <span className="rsf-header-spacer" />
          </div>
          <div className="isf-body">
            <Suspense fallback={<SuspenseFallback />}>
              <UniversalImporterLazy
                onImport={handleImportTransactions}
                accounts={accounts.map(acc => ({ name: acc.name, emoji: acc.icon ?? "🏦" }))}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Écran de succès d'importation */}
      {showImportSuccess && (
        <ImportSuccessScreen
          successCount={importStats.successCount}
          errorCount={importStats.errorCount}
          isImporting={isImporting}
          onClose={() => {
            setShowImportSuccess(false);
            // Rafraîchir la page pour voir les nouvelles données
            if (importStats.successCount > 0) {
              setTimeout(() => {
                window.location.reload();
              }, 300);
            }
          }}
        />
      )}
    </div>
  );
}

export default App;
