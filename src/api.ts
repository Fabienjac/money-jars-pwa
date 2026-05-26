// src/api.ts — backend Supabase
import { supabase } from "./lib/supabase";
import type {
  SpendingRow,
  RevenueRow,
  TotalsResponse,
  SearchSpendingResult,
  SearchRevenueResult,
  Account,
  RevenueAccount,
  JarKey,
} from "./types";
import { AutoTagRule, saveCachedRules, loadCachedRules } from "./autoTagRules";

// ── Helpers dates ──────────────────────────────────────────────────────────────
// L'app utilise DD/MM/YYYY en interne ; Supabase stocke en YYYY-MM-DD (type date)

function toISO(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split("/");
  if (!d || !m || !y) return ddmmyyyy; // passthrough si déjà ISO
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function toDDMMYYYY(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ── Cache localStorage ─────────────────────────────────────────────────────────
const CACHE_TTL = 30 * 60 * 1000; // 30 min

function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function setCache<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function clearCache(...keys: string[]) {
  keys.forEach(k => localStorage.removeItem(k));
}

// ── Dépenses ───────────────────────────────────────────────────────────────────

export async function appendSpending(row: SpendingRow): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non connecté" };

  const { error } = await supabase.from("transactions_spending").insert({
    user_id:      user.id,
    date:         toISO(row.date),
    jar:          row.jar,
    account:      row.account,
    amount:       row.amount,
    description:  row.description,
    tags:         row.tags ?? "",
    subscription: row.subscription ?? "",
  });

  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals", "mjars:cache:analytics", "mjars:cache:spendings");
  return { ok: true };
}

export async function updateSpending(rowIndex: number, row: SpendingRow): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("transactions_spending").update({
    date:         toISO(row.date),
    jar:          row.jar,
    account:      row.account,
    amount:       row.amount,
    description:  row.description,
    tags:         row.tags ?? "",
    subscription: row.subscription ?? "",
  }).eq("id", rowIndex);

  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals", "mjars:cache:analytics", "mjars:cache:spendings");
  return { ok: true };
}

export async function deleteSpending(rowIndex: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("transactions_spending").delete().eq("id", rowIndex);
  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals", "mjars:cache:analytics", "mjars:cache:spendings");
  return { ok: true };
}

export async function searchSpendings(q: string, max = 50): Promise<{ rows: SearchSpendingResult[] }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { rows: [] };

  let query = supabase
    .from("transactions_spending")
    .select("id, date, jar, account, amount, description, tags, subscription")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(max);

  if (q.trim()) {
    query = query.ilike("description", `%${q}%`);
  }

  const { data, error } = await query;
  if (error || !data) return { rows: [] };

  return {
    rows: data.map(r => ({
      rowIndex:     r.id,
      date:         toDDMMYYYY(r.date),
      jar:          r.jar as JarKey,
      account:      r.account,
      amount:       Number(r.amount),
      description:  r.description,
      tags:         r.tags,
      subscription: r.subscription,
    })),
  };
}

// ── Revenus ────────────────────────────────────────────────────────────────────

export async function appendRevenue(row: RevenueRow): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non connecté" };

  const { error } = await supabase.from("transactions_revenue").insert({
    user_id:         user.id,
    date:            toISO(row.date),
    source:          row.source,
    amount:          row.amount ?? null,
    value:           row.value ?? null,
    crypto_quantity: row.cryptoQuantity ?? null,
    method:          row.method ?? null,
    rate:            row.rate ?? null,
    crypto_address:  row.cryptoAddress ?? null,
    destination:     row.destination ?? null,
    income_type:     row.incomeType ?? null,
    tags:            row.tags ?? "",
  });

  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals", "mjars:cache:analytics");
  return { ok: true };
}

export async function updateRevenue(rowIndex: number, row: RevenueRow): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("transactions_revenue").update({
    date:            toISO(row.date),
    source:          row.source,
    amount:          row.amount ?? null,
    value:           row.value ?? null,
    crypto_quantity: row.cryptoQuantity ?? null,
    method:          row.method ?? null,
    rate:            row.rate ?? null,
    crypto_address:  row.cryptoAddress ?? null,
    destination:     row.destination ?? null,
    income_type:     row.incomeType ?? null,
    tags:            row.tags ?? "",
  }).eq("id", rowIndex);

  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals", "mjars:cache:analytics");
  return { ok: true };
}

export async function deleteRevenue(rowIndex: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("transactions_revenue").delete().eq("id", rowIndex);
  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals", "mjars:cache:analytics");
  return { ok: true };
}

export async function searchRevenues(q: string, max = 50): Promise<{ rows: SearchRevenueResult[] }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { rows: [] };

  let query = supabase
    .from("transactions_revenue")
    .select("id, date, source, amount, value, crypto_quantity, method, rate, crypto_address, destination, income_type, tags")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(max);

  if (q.trim()) {
    query = query.ilike("source", `%${q}%`);
  }

  const { data, error } = await query;
  if (error || !data) return { rows: [] };

  return {
    rows: data.map(r => ({
      rowIndex:     r.id,
      date:         toDDMMYYYY(r.date),
      source:       r.source,
      amount:       Number(r.amount ?? 0),
      value:        r.value ?? "",
      cryptoQuantity: Number(r.crypto_quantity ?? 0),
      method:       r.method ?? "",
      rate:         Number(r.rate ?? 0),
      cryptoAddress: r.crypto_address ?? "",
      destination:  r.destination ?? "",
      incomeType:   r.income_type ?? "",
      tags:         r.tags,
    })),
  };
}

// ── Totaux (calculés depuis les transactions) ──────────────────────────────────

export async function fetchTotals(forceRefresh = false): Promise<TotalsResponse> {
  const CACHE_KEY = "mjars:cache:totals";
  if (!forceRefresh) {
    const cached = getCached<TotalsResponse>(CACHE_KEY);
    if (cached) return cached;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return emptyTotals();

  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Récupérer les paramètres des bocaux
  const { data: jarRows } = await supabase
    .from("jar_settings")
    .select("jar_key, percent, initial_balance")
    .eq("user_id", user.id);

  // Dépenses depuis le début (pour le net global) — on group par jar côté JS
  const { data: spendings } = await supabase
    .from("transactions_spending")
    .select("jar, amount")
    .eq("user_id", user.id);

  // Revenus depuis le début
  const { data: revenues } = await supabase
    .from("transactions_revenue")
    .select("amount, rate, crypto_quantity")
    .eq("user_id", user.id);

  const JAR_KEYS: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
  const DEFAULT_PCT: Record<JarKey, number> = { NEC: 55, FFA: 10, LTSS: 10, PLAY: 10, EDUC: 10, GIFT: 5 };

  // Calcul du total des revenus
  const totalRevenues = (revenues ?? []).reduce((sum, r) => {
    const amount = r.amount != null ? Number(r.amount) : (Number(r.crypto_quantity ?? 0) * Number(r.rate ?? 0));
    return sum + amount;
  }, 0);

  // Paramètres bocaux
  const jarPcts: Record<JarKey, number> = { ...DEFAULT_PCT };
  const jarInitial: Record<JarKey, number> = { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 };
  (jarRows ?? []).forEach(r => {
    if (JAR_KEYS.includes(r.jar_key as JarKey)) {
      jarPcts[r.jar_key as JarKey] = Number(r.percent);
      jarInitial[r.jar_key as JarKey] = Number(r.initial_balance);
    }
  });

  // Totaux dépenses par bocal
  const spendingByJar: Record<JarKey, number> = { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 };
  (spendings ?? []).forEach(s => {
    if (JAR_KEYS.includes(s.jar as JarKey)) {
      spendingByJar[s.jar as JarKey] += Number(s.amount);
    }
  });

  const split = { ...jarPcts };
  const jarsResult = {} as TotalsResponse["jars"];
  JAR_KEYS.forEach(key => {
    const jarRevenues = totalRevenues * (jarPcts[key] / 100) + jarInitial[key];
    const jarSpendings = spendingByJar[key];
    jarsResult[key] = {
      revenues:  jarRevenues,
      spendings: jarSpendings,
      net:       jarRevenues - jarSpendings,
      revPct:    jarRevenues > 0 ? (jarSpendings / jarRevenues) * 100 : 0,
    };
  });

  const result: TotalsResponse = { jars: jarsResult, totalRevenues, split };
  setCache(CACHE_KEY, result);
  return result;
}

function emptyTotals(): TotalsResponse {
  const JAR_KEYS: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
  const jars = {} as TotalsResponse["jars"];
  JAR_KEYS.forEach(k => { jars[k] = { revenues: 0, spendings: 0, net: 0, revPct: 0 }; });
  return { jars, totalRevenues: 0, split: { NEC: 55, FFA: 10, LTSS: 10, PLAY: 10, EDUC: 10, GIFT: 5 } };
}

// ── Tags ───────────────────────────────────────────────────────────────────────

export async function fetchTagsFromSheet(): Promise<import("./tagsUtils").Tag[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("tags")
    .select("tag_id, name, emoji, color, categorie, favori")
    .eq("user_id", user.id)
    .order("name");

  if (error || !data) return [];

  return data.map(r => ({
    id:        r.tag_id,
    name:      r.name,
    emoji:     r.emoji,
    color:     r.color,
    categorie: r.categorie ?? undefined,
    favori:    r.favori,
  }));
}

export async function saveTags(tags: import("./tagsUtils").Tag[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Upsert complet : on remet tout
  const rows = tags.map(t => ({
    user_id:   user.id,
    tag_id:    t.id,
    name:      t.name,
    emoji:     t.emoji,
    color:     t.color,
    categorie: t.categorie ?? null,
    favori:    t.favori,
  }));

  await supabase.from("tags").upsert(rows, { onConflict: "user_id,tag_id" });
}

// ── Comptes ────────────────────────────────────────────────────────────────────

export async function getAccounts(): Promise<Account[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("accounts")
    .select("account_id, name, icon, color")
    .eq("user_id", user.id)
    .order("name");

  if (error || !data) return [];
  return data.map(r => ({ id: r.account_id, name: r.name, icon: r.icon ?? undefined, color: r.color ?? undefined }));
}

export async function setAccounts(accounts: Account[]): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non connecté" };

  const rows = accounts.map(a => ({
    user_id:    user.id,
    account_id: a.id,
    name:       a.name,
    icon:       a.icon ?? null,
    color:      a.color ?? null,
  }));

  const { error } = await supabase.from("accounts").upsert(rows, { onConflict: "user_id,account_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getRevenueAccounts(): Promise<RevenueAccount[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("revenue_accounts")
    .select("account_id, name, type, icon, color")
    .eq("user_id", user.id)
    .order("name");

  if (error || !data) return [];
  return data.map(r => ({ id: r.account_id, name: r.name, type: r.type ?? undefined, icon: r.icon ?? undefined, color: r.color ?? undefined }));
}

export async function setRevenueAccounts(accounts: RevenueAccount[]): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non connecté" };

  const rows = accounts.map(a => ({
    user_id:    user.id,
    account_id: a.id,
    name:       a.name,
    type:       a.type ?? null,
    icon:       a.icon ?? null,
    color:      a.color ?? null,
  }));

  const { error } = await supabase.from("revenue_accounts").upsert(rows, { onConflict: "user_id,account_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Analytics ──────────────────────────────────────────────────────────────────

export interface AnalyticsResponse {
  monthlyData: Array<{ month: string; revenues: number; spendings: number }>;
  sourcesData: Array<{ name: string; value: number }>;
  jarEvolution: Array<{ month: string; NEC?: number; FFA?: number; LTSS?: number; PLAY?: number; EDUC?: number; GIFT?: number }>;
  trends: {
    currentMonth: string;
    previousMonth: string;
    revenues: { current: number; previous: number };
    spendings: { current: number; previous: number };
  };
}

export async function fetchAnalytics(forceRefresh = false): Promise<AnalyticsResponse> {
  const CACHE_KEY = "mjars:cache:analytics";
  if (!forceRefresh) {
    const cached = getCached<AnalyticsResponse>(CACHE_KEY);
    if (cached) return cached;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return emptyAnalytics();

  // 12 derniers mois
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const fromDate = twelveMonthsAgo.toISOString().split("T")[0];

  const [{ data: spData }, { data: revData }] = await Promise.all([
    supabase.from("transactions_spending")
      .select("date, jar, amount")
      .eq("user_id", user.id)
      .gte("date", fromDate),
    supabase.from("transactions_revenue")
      .select("date, source, amount, crypto_quantity, rate")
      .eq("user_id", user.id)
      .gte("date", fromDate),
  ]);

  // Group par mois YYYY-MM
  const monthMap: Record<string, { revenues: number; spendings: number; jars: Record<string, number> }> = {};

  (revData ?? []).forEach(r => {
    const month = r.date.slice(0, 7);
    if (!monthMap[month]) monthMap[month] = { revenues: 0, spendings: 0, jars: {} };
    const amount = r.amount != null ? Number(r.amount) : (Number(r.crypto_quantity ?? 0) * Number(r.rate ?? 0));
    monthMap[month].revenues += amount;
  });

  (spData ?? []).forEach(r => {
    const month = r.date.slice(0, 7);
    if (!monthMap[month]) monthMap[month] = { revenues: 0, spendings: 0, jars: {} };
    monthMap[month].spendings += Number(r.amount);
    monthMap[month].jars[r.jar] = (monthMap[month].jars[r.jar] ?? 0) + Number(r.amount);
  });

  const sortedMonths = Object.keys(monthMap).sort();

  const monthlyData = sortedMonths.map(m => ({
    month: m,
    revenues: monthMap[m].revenues,
    spendings: monthMap[m].spendings,
  }));

  const jarEvolution = sortedMonths.map(m => ({
    month: m,
    ...monthMap[m].jars,
  }));

  // Sources (revenus groupés par source, 12 derniers mois)
  const sourceTotals: Record<string, number> = {};
  (revData ?? []).forEach(r => {
    const amount = r.amount != null ? Number(r.amount) : (Number(r.crypto_quantity ?? 0) * Number(r.rate ?? 0));
    sourceTotals[r.source] = (sourceTotals[r.source] ?? 0) + amount;
  });
  const sourcesData = Object.entries(sourceTotals).map(([name, value]) => ({ name, value }));

  // Trends : mois courant vs précédent
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

  const result: AnalyticsResponse = {
    monthlyData,
    sourcesData,
    jarEvolution,
    trends: {
      currentMonth:  currentMonthKey,
      previousMonth: previousMonthKey,
      revenues: {
        current:  monthMap[currentMonthKey]?.revenues ?? 0,
        previous: monthMap[previousMonthKey]?.revenues ?? 0,
      },
      spendings: {
        current:  monthMap[currentMonthKey]?.spendings ?? 0,
        previous: monthMap[previousMonthKey]?.spendings ?? 0,
      },
    },
  };

  setCache(CACHE_KEY, result);
  return result;
}

function emptyAnalytics(): AnalyticsResponse {
  const now = new Date();
  const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const pm = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;
  return {
    monthlyData: [],
    sourcesData: [],
    jarEvolution: [],
    trends: { currentMonth: cm, previousMonth: pm, revenues: { current: 0, previous: 0 }, spendings: { current: 0, previous: 0 } },
  };
}

// ── Net Worth (non géré en Supabase pour l'instant — retourne 0) ──────────────

export interface NetWorthResponse { value: number; currency: string }

export async function fetchNetWorth(_forceRefresh = false): Promise<NetWorthResponse> {
  return { value: 0, currency: "EUR" };
}

// ── Column mappings ────────────────────────────────────────────────────────────

const COLMAPPING_CACHE_KEY = "mjars:colmappings:all";
const COLMAPPING_CACHE_TTL = 60 * 60 * 1000; // 1h

export async function fetchColumnMappings(): Promise<Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(COLMAPPING_CACHE_KEY);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as { data: Record<string, unknown>; ts: number };
      if (Date.now() - ts < COLMAPPING_CACHE_TTL) return data;
    }
  } catch {}

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const { data, error } = await supabase
    .from("column_mappings")
    .select("mapping_key, mapping")
    .eq("user_id", user.id);

  if (error || !data) return {};

  const mappings: Record<string, unknown> = {};
  data.forEach(r => { mappings[r.mapping_key] = r.mapping; });

  try { localStorage.setItem(COLMAPPING_CACHE_KEY, JSON.stringify({ data: mappings, ts: Date.now() })); } catch {}
  return mappings;
}

export async function saveColumnMappingToSheet(mappingKey: string, mapping: unknown): Promise<void> {
  // Mettre à jour le cache local immédiatement
  try {
    const raw = localStorage.getItem(COLMAPPING_CACHE_KEY);
    const existing = raw ? (JSON.parse(raw) as { data: Record<string, unknown>; ts: number }) : { data: {}, ts: 0 };
    existing.data[mappingKey] = mapping;
    existing.ts = Date.now();
    localStorage.setItem(COLMAPPING_CACHE_KEY, JSON.stringify(existing));
  } catch {}

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  supabase.from("column_mappings").upsert(
    { user_id: user.id, mapping_key: mappingKey, mapping, updated_at: new Date().toISOString() },
    { onConflict: "user_id,mapping_key" }
  ).then(({ error }) => {
    if (error) console.warn("saveColumnMapping: erreur Supabase", error.message);
  });
}

// ── Auto-tag rules ─────────────────────────────────────────────────────────────

export async function fetchAutoTagRules(): Promise<AutoTagRule[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return loadCachedRules();

  const { data, error } = await supabase
    .from("auto_tag_rules")
    .select("pattern, jar, tags")
    .eq("user_id", user.id);

  if (error || !data) return loadCachedRules();

  const rules: AutoTagRule[] = data.map(r => ({
    originalKey:          r.pattern,
    correctedDescription: r.pattern,
    tags:                 r.tags ? r.tags.split(",") : [],
    jar:                  r.jar ?? undefined,
    useCount:             1,
    updatedAt:            new Date().toISOString(),
  }));

  saveCachedRules(rules);
  return rules;
}

export async function saveAutoTagRulesToSheet(rules: AutoTagRule[]): Promise<void> {
  saveCachedRules(rules);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Remplacement complet : supprimer puis réinsérer
  await supabase.from("auto_tag_rules").delete().eq("user_id", user.id);

  if (rules.length === 0) return;

  const rows = rules.map(r => ({
    user_id: user.id,
    pattern: r.originalKey,
    jar:     r.jar ?? null,
    tags:    r.tags.join(","),
  }));

  const { error } = await supabase.from("auto_tag_rules").insert(rows);
  if (error) console.warn("saveAutoTagRules: erreur Supabase", error.message);
}
