// Origine d'une inscription : un lien du type https://…/?ref=seminaire est mémorisé, puis attaché au compte créé
// (user_metadata.ref). Permet de savoir d'où viennent les inscrits (séminaire, newsletter…), sans traceur tiers.

const REF_KEY = "mjars:ref";
const REF_PATTERN = /^[a-z0-9_-]{1,32}$/;
/** Un compte plus ancien que cela n'est pas « une inscription issue du lien » : on ne l'étiquette pas. */
const FRESH_ACCOUNT_MS = 24 * 60 * 60 * 1000;

/** Lit ?ref=… dans l'adresse ; renvoie null si absent ou mal formé. */
export function parseRef(search: string): string | null {
  try {
    const raw = new URLSearchParams(search).get("ref");
    const v = (raw ?? "").trim().toLowerCase();
    return REF_PATTERN.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Mémorise l'origine au premier contact (la première origine est conservée). */
export function captureRef(search: string = window.location.search): void {
  const ref = parseRef(search);
  if (!ref) return;
  try {
    if (!window.localStorage.getItem(REF_KEY)) window.localStorage.setItem(REF_KEY, ref);
  } catch { /* stockage indisponible : l'origine est simplement perdue */ }
}

export function getRef(): string | null {
  try {
    const v = window.localStorage.getItem(REF_KEY);
    return v && REF_PATTERN.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Faut-il étiqueter ce compte avec l'origine mémorisée ? Oui s'il est récent et n'en a pas encore. */
export function shouldTagUser(
  user: { created_at?: string; user_metadata?: Record<string, unknown> | null },
  ref: string | null,
  now: number = Date.now(),
): boolean {
  if (!ref) return false;
  if (user.user_metadata && typeof user.user_metadata.ref === "string" && user.user_metadata.ref) return false;
  const created = user.created_at ? Date.parse(user.created_at) : NaN;
  if (!Number.isFinite(created)) return false;
  return now - created <= FRESH_ACCOUNT_MS;
}
