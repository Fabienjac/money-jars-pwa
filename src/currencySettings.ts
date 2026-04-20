const KEY_FAVORITES = "mjars:currencyFavorites";
const KEY_LAST = "mjars:lastExpenseCurrency";

const DEFAULT_FAVORITES = ["USD", "GBP", "CHF", "JPY"];

export function loadCurrencyFavorites(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_FAVORITES];
  try {
    const raw = localStorage.getItem(KEY_FAVORITES);
    if (!raw) return [...DEFAULT_FAVORITES];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_FAVORITES];
    const codes = parsed.filter((c): c is string => typeof c === "string" && c.length === 3);
    return [...new Set(codes)].slice(0, 8);
  } catch {
    return [...DEFAULT_FAVORITES];
  }
}

export function saveCurrencyFavorites(codes: string[]): void {
  if (typeof window === "undefined") return;
  const cleaned = [...new Set(codes.map((c) => c.toUpperCase()).filter(Boolean))].slice(0, 8);
  localStorage.setItem(KEY_FAVORITES, JSON.stringify(cleaned));
  window.dispatchEvent(new CustomEvent("currencySettingsUpdated"));
}

export function loadLastExpenseCurrency(): string {
  if (typeof window === "undefined") return "EUR";
  return localStorage.getItem(KEY_LAST) || "EUR";
}

export function saveLastExpenseCurrency(code: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_LAST, code.toUpperCase());
}
