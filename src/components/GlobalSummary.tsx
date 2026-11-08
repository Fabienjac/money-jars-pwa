// Bilan global depuis le début : revenus, dépenses, solde. Affiché en tête de l'onglet « Rapport » des Analyses.
import React, { useEffect, useState } from "react";
import { fetchTotals } from "../api";
import { currencySymbol as curSym } from "../baseCurrency";
import { localeTag, useT } from "../i18n";
import type { TotalsResponse } from "../types";

function formatMoney(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString(localeTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const GlobalSummary: React.FC = () => {
  const t = useT();
  const [totals, setTotals] = useState<TotalsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => fetchTotals().then((tot) => { if (alive) setTotals(tot); }).catch(() => {});
    load();
    window.addEventListener("mjars:transactionSaved", load);
    window.addEventListener("mjars:revenueSaved", load);
    return () => {
      alive = false;
      window.removeEventListener("mjars:transactionSaved", load);
      window.removeEventListener("mjars:revenueSaved", load);
    };
  }, []);

  if (!totals) return null;
  const totalRevenues = totals.totalRevenues || 0;
  const totalSpendings = Object.values(totals.jars).reduce((acc, j) => acc + (j.spendings || 0), 0);
  const totalBalance = totalRevenues - totalSpendings;

  return (
    <section className="jars-v2-summary global-summary">
      <h3 className="jars-v2-summary-title">{t("home.quickSummary")}</h3>
      <p className="jars-v2-summary-scope">{t("home.summaryScope")}</p>
      <div className="jars-v2-summary-grid">
        <div className="summary-item summary-revenues">
          <span className="summary-label">{t("home.income")}</span>
          <span className="summary-value">{formatMoney(totalRevenues)}&nbsp;{curSym()}</span>
        </div>
        <div className="summary-item summary-spendings">
          <span className="summary-label">{t("home.spending")}</span>
          <span className="summary-value">{formatMoney(totalSpendings)}&nbsp;{curSym()}</span>
        </div>
        <div className="summary-item summary-balance" style={{ gridColumn: "1 / -1" }}>
          <span className="summary-label">{t("home.balance")}</span>
          <span className="summary-value summary-value--highlight">{formatMoney(totalBalance)}&nbsp;{curSym()}</span>
        </div>
      </div>
    </section>
  );
};

export default GlobalSummary;
