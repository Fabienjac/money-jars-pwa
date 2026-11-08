// Poids relatif des étiquettes : anneau + synthèse (top 3, plus grande / plus petite) + tableau trié.
// Le « poids » d'une étiquette est sa part dans la somme des étiquettes (le total fait 100 %). Une dépense qui porte
// plusieurs étiquettes compte dans chacune : le montant d'une ligne est donc le montant des dépenses TOUCHÉES par cette
// étiquette, et les montants ne s'additionnent pas au total dépensé (affiché au centre de l'anneau).
import React, { useState } from "react";
import type { TagStat } from "../tagStatsCore";
import { TagPieChart } from "./TagPieChart";
import { extremes, groupTagWeights, topShare } from "../tagWeight";
import { t as tr, localeTag, useLang } from "../i18n";

interface Props {
  stats: TagStat[];
  /** Total réellement dépensé (chaque dépense une fois). */
  totalSpent: number;
  /** Étiquettes actuellement filtrées. */
  activeTags: string[];
  onToggleTag: (id: string) => void;
  onOpenHistory: (id: string) => void;
  money: (n: number, digits?: number) => string;
}

const OTHERS_COLOR = "#8E8E93";

const TagWeightPanel: React.FC<Props> = ({ stats, totalSpent, activeTags, onToggleTag, onOpenHistory, money }) => {
  useLang();
  const [showOthers, setShowOthers] = useState(false);
  const groups = groupTagWeights(stats, 6);
  const { largest, smallest } = extremes(stats);
  const top3 = topShare(stats, 3);
  const maxShare = Math.max(...stats.map((s) => s.pieShare), 1);

  const pct = (n: number) =>
    n > 0 && n < 1 ? `< ${new Intl.NumberFormat(localeTag(), { style: "percent", maximumFractionDigits: 0 }).format(0.01)}`
      : new Intl.NumberFormat(localeTag(), { style: "percent", maximumFractionDigits: 0 }).format(n / 100);

  const Row = ({ s }: { s: TagStat }) => {
    const active = activeTags.includes(s.tagId);
    return (
      <li className={`wt-row${active ? " is-active" : ""}`}>
        <button type="button" className="wt-main" aria-pressed={active} onClick={() => onToggleTag(s.tagId)}>
          <span className="wt-emoji" aria-hidden="true">{s.emoji}</span>
          <span className="wt-name">{s.tagName}</span>
          <span className="wt-bar" aria-hidden="true"><span style={{ width: `${Math.max(3, (s.pieShare / maxShare) * 100)}%`, background: s.color }} /></span>
          <span className="wt-pct">{pct(s.pieShare)}</span>
          <span className="wt-amount">{money(s.totalAmount, 0)}</span>
        </button>
        <button type="button" className="wt-open" onClick={() => onOpenHistory(s.tagId)} aria-label={`${tr("stats.openHistoryTag")} — ${s.tagName}`}>›</button>
      </li>
    );
  };

  return (
    <section className="stats-card wt-panel">
      <h3 className="wt-title">{tr("stats.pieTitle")}</h3>

      <div className="wt-top">
        <div className="wt-donut">
          <TagPieChart stats={stats} totalSpent={totalSpent} showLegend={false} percentLabels />
        </div>
        <div className="wt-cards">
          <div className="wt-card wt-card-top3">
            <div className="wt-card-label">{tr("stats.top3")}</div>
            <div className="wt-card-big">{pct(top3)} <small>{tr("stats.ofWeight")}</small></div>
            <div className="wt-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, top3)}%` }} /></div>
          </div>
          {largest && smallest && (
            <div className="wt-card">
              <div className="wt-card-label">{tr("stats.inNumbers")}</div>
              <div className="wt-fact"><span>{tr("stats.largestTag")}</span><b>{largest.tagName} · {money(largest.totalAmount, 0)} ({pct(largest.pieShare)})</b></div>
              <div className="wt-fact"><span>{tr("stats.smallestTag")}</span><b>{smallest.tagName} · {money(smallest.totalAmount, 0)} ({pct(smallest.pieShare)})</b></div>
            </div>
          )}
        </div>
      </div>

      <div className="wt-head" aria-hidden="true">
        <span>{tr("hist.tagLabel")}</span>
        <span>{tr("stats.weight")}</span>
        <span>{tr("stats.amountCol")}</span>
      </div>
      <ul className="wt-list">
        {groups.head.map((s) => <Row key={s.tagId} s={s} />)}
        {groups.others.length > 0 && (
          <li className="wt-row wt-others">
            <button type="button" className="wt-main" aria-expanded={showOthers} onClick={() => setShowOthers((v) => !v)}>
              <span className="wt-emoji wt-dots" aria-hidden="true">•••</span>
              <span className="wt-name">{tr("stats.others")} <small>({tr("stats.othersCount", { n: groups.others.length })})</small></span>
              <span className="wt-bar" aria-hidden="true"><span style={{ width: `${Math.max(3, (groups.othersShare / maxShare) * 100)}%`, background: OTHERS_COLOR }} /></span>
              <span className="wt-pct">{pct(groups.othersShare)}</span>
              <span className="wt-amount">{money(groups.othersAmount, 0)}</span>
            </button>
            <span className="wt-open wt-open-spacer" aria-hidden="true">{showOthers ? "▴" : "▾"}</span>
          </li>
        )}
        {showOthers && groups.others.map((s) => <Row key={s.tagId} s={s} />)}
      </ul>
      <p className="stats-hint">{tr("stats.weightNote")}</p>
    </section>
  );
};

export default TagWeightPanel;
