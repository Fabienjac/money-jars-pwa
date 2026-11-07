// Notifications push d'alerte des jarres (côté app) : abonnement de l'appareil, état, demandes au serveur.
// Le serveur (netlify/functions/pushJarAlerts.js) décide et envoie ; ici on ne fait que gérer l'appareil.
import { supabase } from "./lib/supabase";
import { t, getLang, JAR_LABELS } from "./i18n";
import { currencySymbol } from "./baseCurrency";
import { classifySupport, urlBase64ToUint8Array, type PushSupport } from "./pushSupport";

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "";
const ENDPOINT = "/.netlify/functions/pushJarAlerts";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true;
  return classifySupport({
    hasKey: VAPID_PUBLIC_KEY.length > 0,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    isIOS,
    isStandalone,
  });
}

export interface PushStatus {
  support: PushSupport;
  permission: NotificationPermission | "unavailable";
  subscribed: boolean;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js").catch(() => undefined);
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function getPushStatus(): Promise<PushStatus> {
  const support = pushSupport();
  const permission = "Notification" in window ? Notification.permission : "unavailable";
  if (support !== "ok") return { support, permission, subscribed: false };
  const sub = await currentSubscription();
  return { support, permission, subscribed: !!sub && permission === "granted" };
}

/** À appeler depuis un clic : la demande d'autorisation exige un geste volontaire (iOS en particulier). */
export async function enablePush(): Promise<PushStatus> {
  if (pushSupport() !== "ok") return getPushStatus();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return getPushStatus();

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    }));

  const json = sub.toJSON();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("subscription incomplete");
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    await sub.unsubscribe().catch(() => {});
    throw new Error(error.message);
  }
  try { localStorage.removeItem(NO_DEVICE_KEY); } catch { /* sans importance */ }
  return getPushStatus();
}

export async function disablePush(): Promise<PushStatus> {
  const sub = await currentSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
  return getPushStatus();
}

async function call(action: "jarAlerts" | "test"): Promise<{ sent: number; devices: number } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const labels = Object.fromEntries((["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"] as const).map((k) => [k, JAR_LABELS[k]]));
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, lang: getLang(), currency: currencySymbol(), labels }),
  });
  if (!res.ok) throw new Error(`push ${res.status}`);
  return res.json();
}

/** Notification de test vers tous les appareils de l'utilisateur. */
export async function sendTestPush(): Promise<{ sent: number; devices: number } | null> {
  return call("test");
}

// Si aucun appareil n'est abonné, inutile d'interroger le serveur à chaque alerte : on réessaie après 24 h.
const NO_DEVICE_KEY = "mjars:pushNoDeviceUntil";

/**
 * Demande au serveur d'envoyer les alertes de jarres qui viennent d'apparaître. Silencieux en cas d'échec :
 * le point rouge dans l'app reste la source de vérité.
 */
export async function requestJarAlertPush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) return;
  try {
    const until = Number(localStorage.getItem(NO_DEVICE_KEY) || 0);
    if (until > Date.now()) return;
  } catch { /* stockage indisponible : on continue */ }
  try {
    const r = await call("jarAlerts");
    if (r && r.devices === 0) {
      try { localStorage.setItem(NO_DEVICE_KEY, String(Date.now() + 24 * 3600 * 1000)); } catch { /* idem */ }
    }
  } catch { /* hors ligne ou fonction indisponible */ }
}

// Textes d'état pour l'écran « Plus »
export function pushStateLabel(s: PushStatus): string {
  switch (s.support) {
    case "unsupported": return t("push.unsupported");
    case "needs-install": return t("push.needsInstall");
    case "ok":
      if (s.permission === "denied") return t("push.denied");
      return s.subscribed ? t("push.on") : t("push.off");
    default: return "";
  }
}
