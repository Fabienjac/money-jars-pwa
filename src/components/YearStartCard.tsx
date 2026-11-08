// Accueil : rappel de début d'année (janvier). Propose de verser le non-dépensé des jarres de dépense vers l'épargne
// et de solder les déficits. S'affiche une seule fois par an tant qu'il n'est pas écarté, jamais le reste de l'année.
import React, { useEffect, useState } from "react";
import { fetchTotals } from "../api";
import { formatMoney } from "../baseCurrency";
import { JAR_LABELS, useT } from "../i18n";
import { yearStartPrompt, type YearStartPrompt } from "../jarTransfers";

const DISMISSED_KEY = "mjars:yearStartDismissed";

function readDismissedYear(): number | null {
  try {
    const n = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

const YearStartCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const t = useT();
  const [prompt, setPrompt] = useState<YearStartPrompt | null>(null);

  useEffect(() => {
    const now = new Date();
    if (now.getMonth() !== 0 || readDismissedYear() === now.getFullYear()) return; // pas de requête hors janvier
    let alive = true;
    fetchTotals()
      .then((tot) => { if (alive) setPrompt(yearStartPrompt({ now, jars: tot.jars, dismissedYear: readDismissedYear() })); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!prompt) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, String(new Date().getFullYear())); } catch { /* le rappel reviendra */ }
    setPrompt(null);
  };
  const open = () => {
    try { sessionStorage.setItem("mjars:scrollToTransfers", "1"); } catch { /* sans importance */ }
    onOpen();
  };

  return (
    <section className="yearstart" aria-label={t("yearstart.title")}>
      <h3 className="yearstart-title">🎆 {t("yearstart.title")}</h3>
      <ul className="yearstart-list">
        {prompt.leftover > 0 && <li>{t("yearstart.leftover", { amount: formatMoney(prompt.leftover) })}</li>}
        {prompt.deficits.length > 0 && (
          <li>{t("yearstart.deficit", { jars: prompt.deficits.map((d) => JAR_LABELS[d.jar]).join(", ") })}</li>
        )}
      </ul>
      <div className="yearstart-actions">
        <button type="button" className="push-btn" onClick={open}>{t("yearstart.open")}</button>
        <button type="button" className="push-btn push-btn--quiet" onClick={dismiss}>{t("yearstart.later")}</button>
      </div>
    </section>
  );
};

export default YearStartCard;
