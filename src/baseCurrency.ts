// src/baseCurrency.ts — devise de référence de l'utilisateur (toutes les conversions y aboutissent)
import { useEffect, useState } from "react";
import { fetchColumnMappings, saveColumnMappingToSheet } from "./api";
import { localeTag } from "./i18n";

const BASE_KEY = "mjars:baseCurrency";
const BASE_MAPPING_KEY = "user_currency_prefs";
const DEFAULT_BASE = "EUR";

export function getBaseCurrency(): string {
  try {
    const v = localStorage.getItem(BASE_KEY);
    if (v && /^[A-Z]{3}$/.test(v)) return v;
  } catch { /* ignore */ }
  return DEFAULT_BASE;
}

/** Sauvegarde locale + cloud (best effort) + notification des écrans ouverts. */
export function setBaseCurrency(code: string): void {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return;
  try { localStorage.setItem(BASE_KEY, c); } catch { /* ignore */ }
  saveColumnMappingToSheet(BASE_MAPPING_KEY, { base: c }).catch(() => {});
  window.dispatchEvent(new CustomEvent("baseCurrencyUpdated"));
}

export async function fetchBaseCurrencyFromCloud(): Promise<string | null> {
  try {
    const m = await fetchColumnMappings();
    const base = (m[BASE_MAPPING_KEY] as { base?: string } | undefined)?.base;
    if (base && /^[A-Z]{3}$/.test(base)) {
      try { localStorage.setItem(BASE_KEY, base); } catch { /* ignore */ }
      return base;
    }
  } catch { /* ignore */ }
  return null;
}

/** Devise de référence, à jour quand elle change dans Réglages. */
export function useBaseCurrency(): string {
  const [base, setBase] = useState<string>(getBaseCurrency);
  useEffect(() => {
    const reload = () => setBase(getBaseCurrency());
    window.addEventListener("baseCurrencyUpdated", reload);
    fetchBaseCurrencyFromCloud().then((b) => { if (b) setBase(b); });
    return () => window.removeEventListener("baseCurrencyUpdated", reload);
  }, []);
  return base;
}

const symbolCache = new Map<string, string>();

/** Symbole court (« € », « $ », « CHF »…) selon la langue du navigateur. */
export function currencySymbol(code: string = getBaseCurrency()): string {
  const key = `${localeTag()}|${code}`;
  const cached = symbolCache.get(key);
  if (cached) return cached;
  let sym = code;
  try {
    const parts = new Intl.NumberFormat(localeTag(), { style: "currency", currency: code }).formatToParts(0);
    sym = parts.find((p) => p.type === "currency")?.value ?? code;
  } catch { /* garde le code */ }
  symbolCache.set(key, sym);
  return sym;
}

/** Montant formaté dans une devise (par défaut la devise de référence). */
export function formatMoney(amount: number, code: string = getBaseCurrency(), digits = 2): string {
  try {
    return new Intl.NumberFormat(localeTag(), {
      style: "currency",
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${amount.toFixed(digits)} ${code}`;
  }
}

/** Pourcentage dans la langue courante : « 32 % » en français, « 32% » en anglais (valeur en pourcent : 32 = 32 %). */
export function formatPercent(value: number, digits = 0): string {
  const v = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(localeTag(), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v / 100);
  } catch {
    return v.toFixed(digits) + " %";
  }
}

// ── Champ « valeur » des revenus ───────────────────────────────────────────────
// Anciens revenus : value = "USD" (montant saisi dans cette devise, converti ailleurs).
// Nouveaux revenus : value = "1000 USD" (montant d'origine) et amount = montant déjà converti
// dans la devise de référence. La présence d'un nombre au début distingue les deux formats.

export function formatRevenueValue(originalAmount: number, currency: string): string {
  return `${Number(originalAmount.toFixed(2))} ${currency.toUpperCase()}`;
}

export function parseRevenueValue(value: string | null | undefined): { currency: string; original?: number; converted: boolean } {
  const v = String(value ?? "").trim();
  const m = v.match(/^(-?[\d.]+)\s+([A-Za-z]{3,5})$/); // 3 lettres (EUR) ou ticker crypto (USDT, MATIC)
  if (m) return { currency: m[2].toUpperCase(), original: parseFloat(m[1]), converted: true };
  return { currency: v.toUpperCase(), converted: false };
}
