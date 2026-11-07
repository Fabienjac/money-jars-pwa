// src/cryptoUtils.ts — cryptos favorites (puces du formulaire de revenu crypto)
import { fetchColumnMappings, saveColumnMappingToSheet } from "./api";

export interface CryptoFav {
  ticker: string;          // ex: "USDT"
  networks: string[];      // ex: ["TRC20", "ERC20"]
  coingeckoId?: string;    // pour le cours live (optionnel)
  stable?: boolean;        // stablecoin : parité ~1:1 avec USD
}

const CRYPTOS_KEY = "mjars:cryptos";
const CRYPTOS_MAPPING_KEY = "user_crypto_prefs";

export function getDefaultCryptos(): CryptoFav[] {
  return [
    { ticker: "BTC", networks: ["Bitcoin", "Lightning"], coingeckoId: "bitcoin" },
    { ticker: "ETH", networks: ["Ethereum", "Arbitrum", "Base"], coingeckoId: "ethereum" },
    { ticker: "USDT", networks: ["TRC20", "ERC20", "BEP20", "Solana", "Polygon"], coingeckoId: "tether", stable: true },
    { ticker: "USDC", networks: ["ERC20", "BEP20", "Solana", "Base", "Polygon"], coingeckoId: "usd-coin", stable: true },
    { ticker: "SOL", networks: ["Solana"], coingeckoId: "solana" },
    { ticker: "XMR", networks: ["Monero"], coingeckoId: "monero" },
  ];
}

function sanitize(list: unknown): CryptoFav[] | null {
  if (!Array.isArray(list)) return null;
  const out: CryptoFav[] = [];
  for (const c of list) {
    const ticker = String(c?.ticker ?? "").trim().toUpperCase();
    if (!ticker || out.some((x) => x.ticker === ticker)) continue;
    out.push({
      ticker,
      networks: Array.isArray(c.networks) ? c.networks.map((n: unknown) => String(n).trim()).filter(Boolean) : [],
      coingeckoId: c.coingeckoId ? String(c.coingeckoId).trim() : undefined,
      stable: !!c.stable,
    });
  }
  return out;
}

export function loadCryptos(): CryptoFav[] {
  try {
    const raw = localStorage.getItem(CRYPTOS_KEY);
    if (raw) {
      const list = sanitize(JSON.parse(raw));
      if (list) return list;
    }
  } catch { /* ignore */ }
  return getDefaultCryptos();
}

/** Sauvegarde locale + synchro cloud (best effort) + notification des écrans ouverts. */
export function saveCryptos(list: CryptoFav[]): void {
  try { localStorage.setItem(CRYPTOS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  saveColumnMappingToSheet(CRYPTOS_MAPPING_KEY, list).catch(() => {});
  window.dispatchEvent(new CustomEvent("cryptosUpdated"));
}

/** Récupère la liste cloud ; renvoie null si absente (on garde alors la liste locale). */
export async function fetchCryptosFromCloud(): Promise<CryptoFav[] | null> {
  try {
    const mappings = await fetchColumnMappings();
    const list = sanitize(mappings[CRYPTOS_MAPPING_KEY]);
    if (list && list.length > 0) {
      try { localStorage.setItem(CRYPTOS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
      return list;
    }
  } catch { /* ignore */ }
  return null;
}

/** Ticker de la liste présent dans la chaîne "méthode" (ex: "USDT (TRC20)"). Tickers longs d'abord. */
export function detectCryptoTicker(methodStr: string, list: CryptoFav[]): string | null {
  const upper = methodStr.toUpperCase();
  const tickers = [...list].map((c) => c.ticker).sort((a, b) => b.length - a.length);
  for (const t of tickers) {
    const re = new RegExp(`(^|[^A-Z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`);
    if (re.test(upper)) return t;
  }
  return null;
}
