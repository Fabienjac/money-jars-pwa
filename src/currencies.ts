/** Codes ISO 4217 courants pour la saisie (liste figée, pas d’appel réseau). */
export interface CurrencyInfo {
  code: string;
  name: string;
  symbol?: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "USD", name: "Dollar américain", symbol: "$" },
  { code: "GBP", name: "Livre sterling", symbol: "£" },
  { code: "CHF", name: "Franc suisse" },
  { code: "JPY", name: "Yen japonais", symbol: "¥" },
  { code: "CNY", name: "Yuan renminbi", symbol: "¥" },
  { code: "HKD", name: "Dollar de Hong Kong", symbol: "$" },
  { code: "SGD", name: "Dollar de Singapour", symbol: "$" },
  { code: "AUD", name: "Dollar australien", symbol: "$" },
  { code: "NZD", name: "Dollar néo-zélandais", symbol: "$" },
  { code: "CAD", name: "Dollar canadien", symbol: "$" },
  { code: "MXN", name: "Peso mexicain", symbol: "$" },
  { code: "BRL", name: "Réal brésilien", symbol: "R$" },
  { code: "ARS", name: "Peso argentin", symbol: "$" },
  { code: "CLP", name: "Peso chilien", symbol: "$" },
  { code: "COP", name: "Peso colombien", symbol: "$" },
  { code: "PEN", name: "Sol péruvien", symbol: "S/" },
  { code: "INR", name: "Roupie indienne", symbol: "₹" },
  { code: "KRW", name: "Won sud-coréen", symbol: "₩" },
  { code: "THB", name: "Baht thaïlandais", symbol: "฿" },
  { code: "IDR", name: "Roupie indonésienne", symbol: "Rp" },
  { code: "MYR", name: "Ringgit malaisien", symbol: "RM" },
  { code: "PHP", name: "Peso philippin", symbol: "₱" },
  { code: "VND", name: "Dong vietnamien", symbol: "₫" },
  { code: "TWD", name: "Dollar taïwanais", symbol: "NT$" },
  { code: "AED", name: "Dirham des EAU" },
  { code: "SAR", name: "Riyal saoudien" },
  { code: "QAR", name: "Riyal qatari" },
  { code: "KWD", name: "Dinar koweïtien" },
  { code: "ILS", name: "Shekel israélien", symbol: "₪" },
  { code: "TRY", name: "Lire turque", symbol: "₺" },
  { code: "PLN", name: "Zloty polonais", symbol: "zł" },
  { code: "CZK", name: "Couronne tchèque", symbol: "Kč" },
  { code: "HUF", name: "Forint hongrois", symbol: "Ft" },
  { code: "RON", name: "Leu roumain", symbol: "lei" },
  { code: "BGN", name: "Lev bulgare", symbol: "лв" },
  { code: "HRK", name: "Kuna croate", symbol: "kn" },
  { code: "ISK", name: "Couronne islandaise", symbol: "kr" },
  { code: "NOK", name: "Couronne norvégienne", symbol: "kr" },
  { code: "SEK", name: "Couronne suédoise", symbol: "kr" },
  { code: "DKK", name: "Couronne danoise", symbol: "kr" },
  { code: "RUB", name: "Rouble russe", symbol: "₽" },
  { code: "UAH", name: "Hryvnia ukrainienne", symbol: "₴" },
  { code: "EGP", name: "Livre égyptienne", symbol: "E£" },
  { code: "ZAR", name: "Rand sud-africain", symbol: "R" },
  { code: "MAD", name: "Dirham marocain" },
  { code: "TND", name: "Dinar tunisien" },
  { code: "XOF", name: "Franc CFA (Afrique de l’Ouest)" },
  { code: "XAF", name: "Franc CFA (Afrique centrale)" },
];

const byCode = new Map(CURRENCIES.map((c) => [c.code, c]));

export function getCurrencyInfo(code: string): CurrencyInfo | undefined {
  return byCode.get(code);
}

export function getCurrencySymbolOrCode(code: string): string {
  const c = getCurrencyInfo(code);
  return c?.symbol ?? c?.code ?? code;
}
