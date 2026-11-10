// État de la liste « Pour démarrer » : compteurs lus quand l'écran (ou l'entrée de Plus) est visible, drapeaux locaux.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchStartCounts } from "../api";
import { computeSteps, nextStep, progressOf, type StartFacts } from "../startChecklist";
import { installMarked, isInstalledApp, setInstallMarked, setStartHidden, startHidden, voiceUsed } from "../startFlags";

const UNKNOWN: Pick<StartFacts, "accounts" | "revenues" | "spendings" | "manualRules"> = { accounts: null, revenues: null, spendings: null, manualRules: null };

/** `active` : l'écran Plus ou la liste est affiché → on (re)lit les compteurs. */
export function useStartChecklist(userId: string | null, active: boolean) {
  const [counts, setCounts] = useState(UNKNOWN);
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHiddenState] = useState(startHidden);
  const [installed, setInstalledState] = useState(() => isInstalledApp() || installMarked());
  const [voice, setVoice] = useState(voiceUsed);

  const refresh = useCallback(async () => {
    const c = await fetchStartCounts().catch(() => UNKNOWN);
    setCounts(c);
    setVoice(voiceUsed());
    setInstalledState(isInstalledApp() || installMarked());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (userId && active) refresh();
  }, [userId, active, refresh]);

  // Un revenu ou une dépense vient d'être enregistré pendant que la liste est affichée : on la remet à jour
  useEffect(() => {
    if (!active) return;
    const on = () => refresh();
    window.addEventListener("mjars:transactionSaved", on);
    window.addEventListener("mjars:revenueSaved", on);
    return () => {
      window.removeEventListener("mjars:transactionSaved", on);
      window.removeEventListener("mjars:revenueSaved", on);
    };
  }, [active, refresh]);

  const steps = useMemo(() => computeSteps({ ...counts, voiceUsed: voice, installed }), [counts, voice, installed]);
  const progress = useMemo(() => progressOf(steps), [steps]);
  const next = useMemo(() => nextStep(steps), [steps]);

  const setHidden = useCallback((on: boolean) => { setStartHidden(on); setHiddenState(on); }, []);
  const markInstalled = useCallback((on: boolean) => { setInstallMarked(on); setInstalledState(on || isInstalledApp()); }, []);

  return { loaded, counts, steps, progress, next, hidden, setHidden, installed, markInstalled };
}
