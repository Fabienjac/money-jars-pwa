// Carte « Autonomie » : combien de mois la trésorerie (soldes des jarres) tient au rythme de dépenses actuel.
// Calcul : src/autonomy.ts. Niveau 1 = NEC + EDUC + Don + Play ; niveau 2 = les six jarres.
import React, { useEffect, useMemo, useState } from "react";
import { fetchTotals } from "../api";
import { computeAutonomy } from "../autonomy";
import { formatMoney } from "../baseCurrency";
import { localeTag, t, useT } from "../i18n";
import HelpHint from "./HelpHint";
import type { SearchSpendingResult, TotalsResponse } from "../types";

interface Props {
  /** Dépenses des 14 derniers mois (déjà lues par l'accueil). null tant qu'elles se chargent. */
  rows: SearchSpendingResult[] | null;
  /** Étiquettes comptées comme exceptionnelles. */
  oneOffTagIds: string[];
}

const num = (n: number, digits: number) =>
  n.toLocaleString(localeTag(), { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** « 9,2 mois », « 2,4 ans » au-delà de deux ans, « — » sans dépense. */
export function formatRunway(months: number | null): string {
  if (months == null) return "—";
  if (months >= 24) return t("auto.years", { n: num(months / 12, 1) });
  return t("auto.months", { n: num(months, months < 10 ? 1 : 0) });
}

function tone(months: number | null): string {
  if (months == null) return "var(--text-main)";
  if (months < 3) return "var(--danger-text)";
  if (months < 6) return "var(--warn-text)";
  return "var(--ok-text)";
}

const AutonomyCard: React.FC<Props> = ({ rows, oneOffTagIds }) => {
  useT();
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchTotals().then((r) => { if (alive) setTotals(r); }).catch(() => {});
    };
    load();
    window.addEventListener("mjars:transactionSaved", load);
    window.addEventListener("mjars:revenueSaved", load);
    return () => {
      alive = false;
      window.removeEventListener("mjars:transactionSaved", load);
      window.removeEventListener("mjars:revenueSaved", load);
    };
  }, []);

  const result = useMemo(
    () => (totals && rows ? computeAutonomy(totals.jars, rows, oneOffTagIds, new Date()) : null),
    [totals, rows, oneOffTagIds]
  );
  if (!result) return null;
  // Rien à afficher pour un compte vide : ni dépense ni solde
  if (result.burn.withOneOff <= 0 && result.treasury.total <= 0) return null;

  const { treasury, burn } = result;
  const money = (n: number) => formatMoney(n, undefined, 0);
  const cell = (months: number | null) => (
    <span style={{ fontWeight: 700, color: tone(months), fontVariantNumeric: "tabular-nums" }}>{formatRunway(months)}</span>
  );

  return (
    <section style={{ padding: "0 16px 12px" }}>
      <div style={{
        background: "var(--bg-card)", borderRadius: "16px", padding: "16px",
        border: "1px solid var(--border-color)", boxShadow: "var(--shadow-md)",
      }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "10px" }}>
          🛟 {t("auto.title")} <HelpHint topic="autonomy" more />
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "-1px", color: tone(result.liquidRegular) }}>
            {result.liquidRegular == null ? "—" : `≈ ${formatRunway(result.liquidRegular)}`}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{t("auto.headline")}</span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
          {t("auto.detail", { liquid: money(treasury.liquid), burn: money(burn.regular) })}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            marginTop: "10px", padding: 0, border: "none", background: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: "12px", fontWeight: 600, color: "var(--accent, #007AFF)",
          }}
        >
          {open ? t("auto.hide") : t("auto.show")}
        </button>

        {open && (
          <div style={{ marginTop: "10px", fontSize: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: "6px 8px", alignItems: "baseline" }}>
              <span />
              <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{t("auto.colRegular")}</span>
              <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{t("auto.colAll")}</span>

              <span style={{ color: "var(--text-main)" }}>
                {t("auto.rowLiquid")}
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: "11px" }}>{money(treasury.liquid)}</span>
              </span>
              {cell(result.liquidRegular)}
              {cell(result.liquidWithOneOff)}

              <span style={{ color: "var(--text-main)" }}>
                {t("auto.rowTotal")}
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: "11px" }}>{money(treasury.total)}</span>
              </span>
              {cell(result.totalRegular)}
              {cell(result.totalWithOneOff)}
            </div>

            <div style={{ marginTop: "10px", color: "var(--text-muted)", lineHeight: 1.5 }}>
              <div>{t("auto.burnRegular", { amount: money(burn.regular) })}</div>
              <div>{t("auto.burnAll", { amount: money(burn.withOneOff), months: num(burn.monthsCovered, 0) })}</div>
              {treasury.liquidDeficit > 0 && (
                <div style={{ color: "var(--warn-text)", marginTop: "4px" }}>
                  {t("auto.deficit", { amount: money(treasury.liquidDeficit) })}
                </div>
              )}
              {burn.shortHistory && <div style={{ marginTop: "4px" }}>{t("auto.shortHistory")}</div>}
              <div style={{ marginTop: "4px" }}>{t("auto.note")}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default AutonomyCard;
