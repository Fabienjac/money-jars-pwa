// src/importSave.ts
// Enregistre les transactions validées par l'utilisateur après un import de relevé.
// Isolé de App.tsx (et sans dépendance au réseau) pour pouvoir être testé avec de faux services.
import type { RevenueRow, SpendingRow } from "./types";

type SaveResult = { ok: boolean; error?: string };

export interface ImportSaveDeps {
  appendSpending: (row: SpendingRow) => Promise<SaveResult>;
  appendRevenue: (row: RevenueRow) => Promise<SaveResult>;
  /** Taux de la devise vers la devise de référence (null si indisponible). */
  getRateToBase: (currency: string, date: string) => Promise<number | null>;
  baseCurrency: string;
  formatRevenueValue: (amount: number, currency: string) => string;
  rateFailMessage: (currency: string, base: string) => string;
  fallbackError: string;
  /** Appelé après chaque dépense enregistrée (ex. série quotidienne). */
  onSpendingSaved?: () => void;
  onFailure?: (index: number, t: any, reason: string) => void;
}

export interface ImportSaveReport {
  successCount: number;
  errorCount: number;
  failures: { index: number; reason: string }[];
}

const CRYPTOS = ["BTC", "ETH", "USDT", "USDC", "XRP", "ADA", "SOL", "DOGE", "DOT", "MATIC", "LTC", "BCH"];

/** "USDC_ETH" → "USDC" (l'actif, pas le réseau) ; null si aucune crypto reconnue. */
export function extractCurrencyFromMethod(method: string): string | null {
  if (!method) return null;
  if (method.includes("_")) {
    const first = method.split("_")[0].trim().toUpperCase();
    if (CRYPTOS.includes(first)) return first;
  }
  for (const c of CRYPTOS) {
    if (new RegExp(c, "i").test(method)) return c;
  }
  return null;
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** Ramène une date vers YYYY-MM-DD (format attendu par la base) ; "" si illisible. */
export function normalizeToISO(dateStr: string): string {
  if (!dateStr) return "";
  const cleaned = String(dateStr).replace(/\s*:\s*/g, ":").replace(/\s*,\s*/g, ", ").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);
  const dmy = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const named = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (month) return `${named[3]}-${month}-${named[1].padStart(2, "0")}`;
  }
  return "";
}

export async function saveImportedTransactions(
  transactions: any[],
  type: "spending" | "revenue",
  deps: ImportSaveDeps
): Promise<ImportSaveReport> {
  const report: ImportSaveReport = { successCount: 0, errorCount: 0, failures: [] };
  const fail = (index: number, t: any, reason: string) => {
    report.errorCount++;
    report.failures.push({ index, reason });
    deps.onFailure?.(index, t, reason);
  };

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    try {
      const date = normalizeToISO(t.date);
      if (!date) { fail(i, t, "invalid date"); continue; }

      let result: SaveResult;
      if (type === "spending") {
        const amount = Number(t.amount);
        if (!Number.isFinite(amount)) { fail(i, t, "invalid amount"); continue; }
        result = await deps.appendSpending({
          date,
          jar: t.suggestedJar || "NEC",
          account: t.suggestedAccount || "",
          amount,
          description: t.description || "",
          tags: t.tags || "",
          subscription: "",
        });
      } else {
        let resolvedRate = t.usdEurRate || t.tauxUSDEUR || null;
        if (!resolvedRate) {
          const cryptoCur = extractCurrencyFromMethod(t.methodeCrypto || t.suggestedMethod || "");
          if (cryptoCur && cryptoCur !== deps.baseCurrency) {
            const fetched = await deps.getRateToBase(cryptoCur, t.date);
            if (fetched) resolvedRate = fetched;
          }
        }
        // Montant converti dans la devise de référence ; montant d'origine conservé dans « value »
        const valStr = String(t.valeur || t.currency || "").trim().toUpperCase();
        const cur = /^[A-Z]{3}$/.test(valStr) ? valStr : deps.baseCurrency;
        const origAmount = Number(t.amount) || 0;
        const fx = cur === deps.baseCurrency ? 1 : await deps.getRateToBase(cur, t.date);
        if (!fx) { fail(i, t, deps.rateFailMessage(cur, deps.baseCurrency)); continue; }
        const baseAmount = Math.round(origAmount * fx * 100) / 100;
        const qty = Number(t.quantiteCrypto) || 0;
        result = await deps.appendRevenue({
          date,
          source: t.suggestedSource || t.suggestedAccount || t.description || "",
          amount: origAmount ? baseAmount : undefined,
          value: origAmount ? deps.formatRevenueValue(origAmount, cur) : (t.valeur || t.currency || null),
          cryptoQuantity: t.quantiteCrypto || null,
          method: t.methodeCrypto || t.suggestedMethod || null,
          rate: qty > 0 && baseAmount > 0 ? baseAmount / qty : (cur !== deps.baseCurrency ? fx : (resolvedRate ?? undefined)),
          cryptoAddress: t.adresseCrypto || null,
          destination: t.compteDestination || t.suggestedMethod || null,
          incomeType: t.type || null,
          tags: t.tags || "",
        });
      }

      if (result.ok) {
        report.successCount++;
        if (type === "spending") deps.onSpendingSaved?.();
      } else {
        fail(i, t, result.error || deps.fallbackError);
      }
    } catch (e: any) {
      fail(i, t, e?.message || String(e));
    }
  }
  return report;
}
