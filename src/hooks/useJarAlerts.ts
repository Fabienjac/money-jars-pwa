// Alertes des jarres pour la barre de navigation : calcule les alertes à partir des totaux (mis en cache par
// api.ts), mémorise ce que l'utilisateur a déjà consulté, et expose `unseen` pour le point rouge sur « Plus ».
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTotals } from "../api";
import {
  computeJarAlerts,
  hasUnseenAlerts,
  markAllSeen,
  reconcileSeen,
  type JarAlert,
  type SeenLevels,
} from "../jarAlerts";
import { requestJarAlertPush } from "../push";

const seenKey = (userId: string) => `mjars:jarAlertsSeen:${userId}`;
// Niveaux déjà signalés au serveur pour les notifications push (une demande par franchissement de niveau)
const pushedKey = (userId: string) => `mjars:jarAlertsPushed:${userId}`;

function readLevels(key: string): SeenLevels {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as SeenLevels) : {};
  } catch {
    return {};
  }
}

function writeLevels(key: string, levels: SeenLevels): void {
  try { localStorage.setItem(key, JSON.stringify(levels)); } catch { /* sans conséquence */ }
}

function readSeen(userId: string | null): SeenLevels {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(seenKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as SeenLevels) : {};
  } catch {
    return {};
  }
}

function writeSeen(userId: string | null, seen: SeenLevels): void {
  if (!userId) return;
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(seen));
  } catch {
    /* stockage indisponible : le point rouge reviendra, sans conséquence */
  }
}

/**
 * @param userId  utilisateur connecté (null = rien à faire)
 * @param refreshOn  valeur qui change quand il faut recalculer (ex. l'onglet affiché)
 */
export function useJarAlerts(userId: string | null, refreshOn: unknown) {
  const [alerts, setAlerts] = useState<JarAlert[]>([]);
  const [seen, setSeen] = useState<SeenLevels>(() => readSeen(userId));
  const seenRef = useRef(seen);
  seenRef.current = seen;

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const totals = await fetchTotals();
      const next = computeJarAlerts(totals.jars);
      const reconciled = reconcileSeen(next, seenRef.current);
      if (JSON.stringify(reconciled) !== JSON.stringify(seenRef.current)) {
        writeSeen(userId, reconciled);
        setSeen(reconciled);
      }
      setAlerts(next);

      // Notification push : seulement quand un niveau vient d'être franchi (le serveur relit tout et dédoublonne)
      const pushedBefore = readLevels(pushedKey(userId));
      if (hasUnseenAlerts(next, pushedBefore)) {
        writeLevels(pushedKey(userId), markAllSeen(next));
        void requestJarAlertPush();
      } else {
        const lowered = reconcileSeen(next, pushedBefore);
        if (JSON.stringify(lowered) !== JSON.stringify(pushedBefore)) writeLevels(pushedKey(userId), lowered);
      }
    } catch {
      /* hors ligne ou erreur réseau : on garde l'état précédent */
    }
  }, [userId]);

  // Changement d'utilisateur : on relit sa mémoire
  useEffect(() => {
    setSeen(readSeen(userId));
    setAlerts([]);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshOn]);

  // Nouvelle dépense ou nouveau revenu : les totaux changent
  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener("mjars:transactionSaved", onChange);
    window.addEventListener("mjars:revenueSaved", onChange);
    return () => {
      window.removeEventListener("mjars:transactionSaved", onChange);
      window.removeEventListener("mjars:revenueSaved", onChange);
    };
  }, [refresh]);

  /** L'utilisateur consulte les alertes : le point rouge disparaît jusqu'à une aggravation. */
  const markSeen = useCallback(() => {
    const next = markAllSeen(alerts);
    if (JSON.stringify(next) === JSON.stringify(seenRef.current)) return;
    writeSeen(userId, next);
    setSeen(next);
  }, [alerts, userId]);

  return { alerts, unseen: hasUnseenAlerts(alerts, seen), markSeen };
}
