// src/components/AnalyticsView.tsx
import React, { useState, lazy, Suspense } from "react";

import { useT } from "../i18n";
const HistoryView = lazy(() => import("./HistoryView"));
const TagStatsView = lazy(() => import("./TagStatsView"));

type AnalyticsTab = "report" | "tags";

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
        </div>
      </div>
      <Suspense fallback={<Fallback />}>
        {tab === "report" ? <HistoryView view="report" /> : <TagStatsView />}
      </Suspense>
    </div>
  );
};

export default AnalyticsView;
