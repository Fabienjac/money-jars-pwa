// Partie pure du support des notifications push (sans réseau ni DOM) : testable sous Node.

export type PushSupport = "not-configured" | "unsupported" | "needs-install" | "ok";

export interface SupportEnv {
  hasKey: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  isStandalone: boolean;
}

/** Que peut faire cet appareil ? */
export function classifySupport(env: SupportEnv): PushSupport {
  if (!env.hasKey) return "not-configured";
  if (env.hasServiceWorker && env.hasPushManager && env.hasNotification) return "ok";
  // iPhone / iPad : les notifications n'existent que pour une app ajoutée à l'écran d'accueil (iOS ≥ 16.4)
  if (env.isIOS && !env.isStandalone) return "needs-install";
  return "unsupported";
}

/** Clé publique VAPID (base64url) → octets, format attendu par pushManager.subscribe. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
