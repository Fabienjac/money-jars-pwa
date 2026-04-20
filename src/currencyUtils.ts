export interface CurrencyInfo {
  code: string;
  label: string;
  flag: string;
}

export const ALL_CURRENCIES: CurrencyInfo[] = [
  { code: "EUR", label: "Euro", flag: "🇪🇺" },
  { code: "USD", label: "Dollar américain", flag: "🇺🇸" },
  { code: "GBP", label: "Livre sterling", flag: "🇬🇧" },
  { code: "CHF", label: "Franc suisse", flag: "🇨🇭" },
  { code: "HKD", label: "Dollar de Hong Kong", flag: "🇭🇰" },
  { code: "CAD", label: "Dollar canadien", flag: "🇨🇦" },
  { code: "JPY", label: "Yen japonais", flag: "🇯🇵" },
  { code: "AUD", label: "Dollar australien", flag: "🇦🇺" },
  { code: "SGD", label: "Dollar de Singapour", flag: "🇸🇬" },
  { code: "CNY", label: "Yuan chinois", flag: "🇨🇳" },
  { code: "SEK", label: "Couronne suédoise", flag: "🇸🇪" },
  { code: "NOK", label: "Couronne norvégienne", flag: "🇳🇴" },
  { code: "DKK", label: "Couronne danoise", flag: "🇩🇰" },
  { code: "NZD", label: "Dollar néo-zélandais", flag: "🇳🇿" },
  { code: "MXN", label: "Peso mexicain", flag: "🇲🇽" },
  { code: "BRL", label: "Real brésilien", flag: "🇧🇷" },
  { code: "INR", label: "Roupie indienne", flag: "🇮🇳" },
  { code: "KRW", label: "Won sud-coréen", flag: "🇰🇷" },
  { code: "THB", label: "Baht thaïlandais", flag: "🇹🇭" },
  { code: "MYR", label: "Ringgit malaisien", flag: "🇲🇾" },
  { code: "IDR", label: "Roupie indonésienne", flag: "🇮🇩" },
  { code: "PHP", label: "Peso philippin", flag: "🇵🇭" },
  { code: "PLN", label: "Zloty polonais", flag: "🇵🇱" },
  { code: "CZK", label: "Couronne tchèque", flag: "🇨🇿" },
  { code: "HUF", label: "Forint hongrois", flag: "🇭🇺" },
  { code: "RON", label: "Leu roumain", flag: "🇷🇴" },
  { code: "BGN", label: "Lev bulgare", flag: "🇧🇬" },
  { code: "ISK", label: "Couronne islandaise", flag: "🇮🇸" },
  { code: "ILS", label: "Shekel israélien", flag: "🇮🇱" },
  { code: "TRY", label: "Livre turque", flag: "🇹🇷" },
  { code: "ZAR", label: "Rand sud-africain", flag: "🇿🇦" },
  { code: "BTC", label: "Bitcoin", flag: "₿" },
  { code: "ETH", label: "Ethereum", flag: "Ξ" },
  { code: "USDT", label: "Tether", flag: "₮" },
  { code: "USDC", label: "USD Coin", flag: "🔵" },
  { code: "SOL", label: "Solana", flag: "◎" },
];

export const DEFAULT_PREFERRED = ["EUR", "USD", "GBP", "CHF", "HKD", "CAD", "JPY"];
const STORAGE_KEY = "mjars:preferredCurrencies";

export function loadPreferredCurrencies(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERRED;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_PREFERRED;
    const result = parsed.filter((c): c is string => typeof c === "string" && c.length > 0);
    if (!result.includes("EUR")) result.unshift("EUR");
    return result;
  } catch {
    return DEFAULT_PREFERRED;
  }
}

export function savePreferredCurrencies(currencies: string[]): void {
  const withEur = currencies.includes("EUR") ? currencies : ["EUR", ...currencies];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(withEur));
}

export function getCurrencyInfo(code: string): CurrencyInfo {
  return ALL_CURRENCIES.find((c) => c.code === code) ?? { code, label: code, flag: "💱" };
}
