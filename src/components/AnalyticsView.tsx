// src/components/AnalyticsView.tsx
import React, { useState, lazy, Suspense } from "react";

import { useT } from "../i18n";
const HistoryView = lazy(() => import("./HistoryView"));
const TagStatsView = lazy(() => import("./TagStatsView"));
const SubscriptionsPanel = lazy(() => import("./SubscriptionsPanel"));
import GlobalSummary from "./GlobalSummary";

type AnalyticsTab = "report" | "tags" | "subs";

const Fallback = () => {
  const t = useT();
  return (
  <div style={{ display: "flex", justifyContent: "center", padding: "40px", color: "var(--text-muted)" }}>
    {t("common.loading")}
  </div>
  );
};

const AnalyticsView: React.FC = () => {
  const t = useT();
  const [tab, setTab] = useState<AnalyticsTab>("report");

  return (
    <div className="analytics-view">
      <div className="analytics-header">
        <h2 className="analytics-title">{t("analytics.title")}</h2>
        <div className="analytics-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "report"}
            className={`analytics-tab${tab === "report" ? " analytics-tab--active" : ""}`}
            onClick={() => setTab("report")}
          >
            {t("analytics.report")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tags"}
            className={`analytics-tab${tab === "tags" ? " analytics-tab--active" : ""}`}
            onClick={() => setTab("tags")}
          >
            {t("analytics.byTag")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "subs"}
            className={`analytics-tab${tab === "subs" ? " analytics-tab--active" : ""}`}
            onClick={() => setTab("subs")}
          >
            {t("analytics.subscriptions")}
          </button>
        </div>
      </div>
      <Suspense fallback={<Fallback />}>
        {tab === "report" ? (
          <>
            <GlobalSummary />
            <HistoryView view="report" />
          </>
        ) : tab === "tags" ? (
          <TagStatsView />
        ) : (
          <SubscriptionsPanel />
        )}
      </Suspense>
    </div>
  );
};

export default AnalyticsView;
