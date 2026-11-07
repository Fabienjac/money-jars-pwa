// src/suppliersUtils.ts
import { JarKey, SearchSpendingResult } from "./types";

export interface Supplier {
  key: string;
  name: string;
  count: number;
  jar: JarKey;
  account: string;
  tags: string[];
  lastAmount: number;
}

const CURRENCY_SUFFIX = /\s*\([\d\s.,]+\s*[A-Za-z]{3,5}\)\s*$/;
const DEFAULT_DESC = /^Dépense\s+(NEC|FFA|LTSS|PLAY|EDUC|GIFT)$/;

export function cleanSupplierName(desc: string): string {
  return (desc || "").replace(CURRENCY_SUFFIX, "").replace(/\s+/g, " ").trim();
}

export function normalizeSupplier(s: string): string {
  return cleanSupplierName(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// rows doivent être triées de la plus récente à la plus ancienne
export function buildSuppliers(rows: SearchSpendingResult[]): Supplier[] {
  const map = new Map<string, Supplier>();
  for (const r of rows) {
    const name = cleanSupplierName(r.description);
    if (!name || DEFAULT_DESC.test(name)) continue;
    const key = normalizeSupplier(name);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      continue;
    }
    map.set(key, {
      key,
      name,
      count: 1,
      jar: r.jar,
      account: r.account,
      tags: r.tags ? r.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      lastAmount: r.amount,
    });
  }
  return Array.from(map.values());
}

export function topSuppliers(all: Supplier[], n: number): Supplier[] {
  const recent = all.slice(0, 40);
  return [...recent].sort((a, b) => b.count - a.count).slice(0, n);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export interface SupplierSearch {
  matches: Supplier[];
  exact: Supplier | null;
  didYouMean: Supplier | null;
}

export function searchSuppliers(all: Supplier[], query: string, limit = 5): SupplierSearch {
  const q = normalizeSupplier(query);
  if (!q) return { matches: [], exact: null, didYouMean: null };

  const exact = all.find(s => s.key === q) || null;
  const starts = all.filter(s => s.key.startsWith(q));
  const contains = all.filter(s => !s.key.startsWith(q) && s.key.includes(q));
  const matches = [...starts, ...contains].slice(0, limit);

  let didYouMean: Supplier | null = null;
  if (!exact && matches.length === 0 && q.length >= 3) {
    let best = Infinity;
    for (const s of all) {
      const d = levenshtein(q, s.key);
      if (d < best) { best = d; didYouMean = s; }
    }
    if (best > Math.max(2, Math.floor(q.length / 4))) didYouMean = null;
  }
  return { matches, exact, didYouMean };
}
