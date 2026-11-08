// src/App.tsx - VERSION V3 FINALE avec "Utiliser" qui fonctionne
import React, { useState, useEffect, lazy, Suspense } from "react";
import { useT, useLang, t as tr } from "./i18n";
import { useBaseCurrency, getBaseCurrency, formatRevenueValue } from "./baseCurrency";
import { getRateToBase } from "./exchangeRate";
import RevenueForm from "./components/RevenueForm";
import type { HistoryUseEntry } from "./components/HistoryView";
import JarsViewV2 from "./components/JarsViewV2";
import QuickSpendingForm from "./components/QuickSpendingForm";
import { VoiceSpendingModal } from "./components/VoiceSpendingModal";
import { ImportSuccessScreen } from "./components/ImportSuccessScreen";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { AuthScreen } from "./components/AuthScreen";
import { LandingPage } from "./components/LandingPage";
import { OnboardingFlow } from "./components/OnboardingFlow";
import { PaywallModal } from "./components/PaywallModal";
import MoreView from "./components/MoreView";
import { useOffline } from "./hooks/useOffline";
import { useJarAlerts } from "./hooks/useJarAlerts";
import { useAuth } from "./contexts/AuthContext";
import { loadAccounts } from "./accountsUtils";
import { getAccounts, fetchTagsFromSheet, seedExceptionalTagIfNeeded, fetchTotals, fetchAnalytics, fetchNetWorth, searchSpendings, appendSpending, appendRevenue } from "./api";
import { setCachedTags } from "./tagsUtils";
import type { Account } from "./types";
import { offlineManager } from "./offlineManager";
import { updateStreak } from "./streakUtils";
import { saveImportedTransactions } from "./importSave";
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

function App() {
  const { user, loading: authLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>("home");
  const t = useT();
  const lang = useLang();
  const baseCurrency = useBaseCurrency(); // remonte les écrans si la devise de référence change
  const [darkMode, setDarkMode] = useState(false);

  const [prefillSpending, setPrefillSpending] = useState<any | null>(null);
  const [prefillRevenue, setPrefillRevenue] = useState<any | null>(null);

  // ✅ AJOUT : États pour les nouveaux modals V2
  const [showQuickSpending, setShowQuickSpending] = useState(false);
  const [showQuickRevenue, setShowQuickRevenue] = useState(false);
  
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

  // Alertes des jarres (point rouge sur « Plus ») : recalculées à chaque changement d'écran et à chaque saisie
  const { alerts: jarAlerts, unseen: jarAlertsUnseen, markSeen: markJarAlertsSeen } = useJarAlerts(user?.id ?? null, section);
  useEffect(() => {
    if (section === "more") markJarAlertsSeen();
  }, [section, markJarAlertsSeen]);

  // Un clic sur une notification d'alerte ouvre l'app sur « Plus » (adresse /#alerts)
  useEffect(() => {
    const openAlerts = () => {
      if (window.location.hash === "#alerts") {
        setSection("more");
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    openAlerts();
    window.addEventListener("hashchange", openAlerts);
    return () => window.removeEventListener("hashchange", openAlerts);
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
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    fetchTagsFromSheet()
      .then(async tags => {
        if (tags.length > 0) setCachedTags(tags);
        // Étiquette « Exceptionnel » pour l'indicateur « train de vie » (une seule fois par utilisateur)
        const withSeed = await seedExceptionalTagIfNeeded(tags);
        if (withSeed) setCachedTags(withSeed);
      })
      .catch(() => { /* silencieux — les défauts codés en dur sont utilisés */ });
  }, [userId]);

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

  // ✅ NOUVEAU : Gérer "Utiliser" avec la V2
  const handleUseEntry = (entry: HistoryUseEntry) => {
    if (entry.kind === "spending") {
      setPrefillSpending(entry.row);
      setShowQuickSpending(true);
    } else {
      setPrefillRevenue(entry.row);
      setShowQuickRevenue(true);
    }
  };

  // Import de transactions depuis fichiers
  const handleImportTransactions = async (transactions: any[], type: "spending" | "revenue" = "spending") => {
    console.log(`📦 Importing ${transactions.length} ${type === "revenue" ? "revenues" : "transactions"}...`);
    
    // Afficher l'écran "Importation en cours..."
    setIsImporting(true);
    setShowImportSuccess(true);
    setImporterOpen(false); // Fermer l'importeur
    
    try {
      const { successCount, errorCount } = await saveImportedTransactions(transactions, type, {
        appendSpending,
        appendRevenue,
        getRateToBase,
        baseCurrency: getBaseCurrency(),
        formatRevenueValue,
        rateFailMessage: (cur, base) => tr("app.rateFail", { cur, base }),
        fallbackError: tr("app.supabaseErr"),
        onSpendingSaved: updateStreak,
        onFailure: (index, t, reason) =>
          console.error(
            `❌ Échec import #${index + 1}:`,
            `${String(t?.date ?? "")} | ${String(t?.description ?? t?.suggestedSource ?? "")} | ${t?.amount ?? ""} ${getBaseCurrency()}`,
            "→",
            reason
          ),
      });

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
    setPrefillSpending(null);
    setShowQuickSpending(true);
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
              <JarsViewV2
                onOpenRevenue={() => setShowQuickRevenue(true)}
                onOpenSettings={() => setSection("settings")}
              />
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
              jarAlerts={jarAlerts}
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
          aria-label={jarAlertsUnseen ? `${t("nav.more")} – ${t("alerts.navDot")}` : undefined}
        >
          <span className="bottom-nav-icon">
            {jarAlertsUnseen && <span className="nav-alert-dot" aria-hidden="true" />}
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
