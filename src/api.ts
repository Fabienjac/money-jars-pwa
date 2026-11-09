// src/api.ts — backend Supabase
import { supabase } from "./lib/supabase";
import { EXPORT_TABLES, type ExportTables } from "./dataExport";
import { cacheVersion, invalidateHistoryCache, readHistoryCache, writeHistoryCache, type HistoryKind } from "./historyCache";
import { t } from "./i18n";
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
import { fetchAllPages } from "./paginate";
import { getDefaultTags, setCachedTags, type Tag } from "./tagsUtils";
import { EXCEPTIONAL_TAG_ID, planExceptionalSeed } from "./lifestyleSeed";
import { addTagTo } from "./exceptional";
import type { AccountTransfer } from "./accountTransfers";
import { adjustmentTotals, isJarKey, round2, transferDeltas, type JarAdjustment, type JarTransfer } from "./jarTransfers";

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

// Lectures en cours, partagées : plusieurs écrans demandent les mêmes totaux au démarrage ; avec la lecture
// paginée, chaque doublon coûterait plusieurs requêtes. Une écriture (clearCache) invalide la lecture en cours.
const inflight = new Map<string, Promise<unknown>>();

function shared<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p: Promise<T> = run().finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

function clearCache(...keys: string[]) {
  keys.forEach(k => { localStorage.removeItem(k); inflight.delete(k); });
}

// ── Dépenses ───────────────────────────────────────────────────────────────────

export async function appendSpending(row: SpendingRow): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };

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
  invalidateHistoryCache(); // l'écran Historique relira les données
  return { ok: true };
}

export async function updateSpending(rowIndex: number, row: SpendingRow): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };
  const { error } = await supabase.from("transactions_spending").update({
    date:         toISO(row.date),
    jar:          row.jar,
    account:      row.account,
    amount:       row.amount,
    description:  row.description,
    tags:         row.tags ?? "",
    subscription: row.subscription ?? "",
  }).eq("id", rowIndex).eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals", "mjars:cache:analytics", "mjars:cache:spendings");
  invalidateHistoryCache(); // l'écran Historique relira les données
  return { ok: true };
}

export async function deleteSpending(rowIndex: number): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };
  const { error } = await supabase.from("transactions_spending").delete().eq("id", rowIndex).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals", "mjars:cache:analytics", "mjars:cache:spendings");
  invalidateHistoryCache(); // l'écran Historique relira les données
  return { ok: true };
}

/** Renomme un compte de dépense dans TOUTES les transactions existantes */
export async function bulkRenameSpendingAccount(
  oldName: string,
  newName: string
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, count: 0, error: t("err.notLoggedIn") };
  const { data, error } = await supabase
    .from("transactions_spending")
    .update({ account: newName })
    .eq("user_id", user.id)
    .eq("account", oldName)
    .select("id");
  if (error) return { ok: false, count: 0, error: error.message };
  // Les virements entre comptes désignent les comptes par leur nom : ils suivent le renommage (table absente = rien à faire)
  for (const col of ["from_account", "to_account"] as const) {
    await supabase.from("account_transfers").update({ [col]: newName }).eq("user_id", user.id).eq(col, oldName);
  }
  clearCache("mjars:cache:totals", "mjars:cache:analytics", "mjars:cache:spendings");
  invalidateHistoryCache(); // l'écran Historique relira les données
  return { ok: true, count: data?.length ?? 0 };
}

type SpendingDbRow = { id: number; date: string; jar: string; account: string; amount: number | string; description: string; tags: string | null; subscription: string | null };

function mapSpendingRow(r: SpendingDbRow): SearchSpendingResult {
  return {
    rowIndex:     r.id,
    date:         toDDMMYYYY(r.date),
    jar:          r.jar as JarKey,
    account:      r.account,
    amount:       Number(r.amount),
    description:  r.description,
    tags:         r.tags ?? undefined,
    subscription: r.subscription ?? undefined,
  };
}

/**
 * Toutes les dépenses (filtrées par libellé si `q`), lues page par page : Supabase tronque en silence à 1000 lignes
 * par requête. Du plus récent au plus ancien ; l'ordre sur `id` rend les pages stables.
 */
export async function fetchAllSpendings(q = ""): Promise<SearchSpendingResult[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const rows = await fetchAllPages((from, to) => {
    let query = supabase
      .from("transactions_spending")
      .select("id, date, jar, account, amount, description, tags, subscription")
      .eq("user_id", user.id);
    if (q.trim()) query = query.ilike("description", `%${q.trim()}%`);
    return query
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
  });
  return rows.map((r) => mapSpendingRow(r as SpendingDbRow));
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
  if (!user) return { ok: false, error: t("err.notLoggedIn") };

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
  invalidateHistoryCache(); // l'écran Historique relira les données
  return { ok: true };
}

export async function updateRevenue(rowIndex: number, row: RevenueRow): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };
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
  }).eq("id", rowIndex).eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals", "mjars:cache:analytics");
  invalidateHistoryCache(); // l'écran Historique relira les données
  return { ok: true };
}

export async function deleteRevenue(rowIndex: number): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };
  const { error } = await supabase.from("transactions_revenue").delete().eq("id", rowIndex).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals", "mjars:cache:analytics");
  invalidateHistoryCache(); // l'écran Historique relira les données
  return { ok: true };
}

/** Renomme une source de revenu dans TOUTES les transactions existantes */
export async function bulkRenameRevenueSource(
  oldName: string,
  newName: string
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, count: 0, error: t("err.notLoggedIn") };
  const { data, error } = await supabase
    .from("transactions_revenue")
    .update({ source: newName })
    .eq("user_id", user.id)
    .eq("source", oldName)
    .select("id");
  if (error) return { ok: false, count: 0, error: error.message };
  clearCache("mjars:cache:totals", "mjars:cache:analytics");
  invalidateHistoryCache(); // l'écran Historique relira les données
  return { ok: true, count: data?.length ?? 0 };
}

type RevenueDbRow = {
  id: number; date: string; source: string; amount: number | string | null; value: string | null;
  crypto_quantity: number | string | null; method: string | null; rate: number | string | null;
  crypto_address: string | null; destination: string | null; income_type: string | null; tags: string | null;
};

function mapRevenueRow(r: RevenueDbRow): SearchRevenueResult {
  return {
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
    tags:         r.tags ?? undefined,
  };
}

/** Tous les revenus (filtrés par source si `q`), lus page par page (voir fetchAllSpendings). */
export async function fetchAllRevenues(q = ""): Promise<SearchRevenueResult[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const rows = await fetchAllPages((from, to) => {
    let query = supabase
      .from("transactions_revenue")
      .select("id, date, source, amount, value, crypto_quantity, method, rate, crypto_address, destination, income_type, tags")
      .eq("user_id", user.id);
    if (q.trim()) query = query.ilike("source", `%${q.trim()}%`);
    return query
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
  });
  return rows.map((r) => mapRevenueRow(r as RevenueDbRow));
}

/**
 * Lectures complètes avec le cache en mémoire de l'écran Historique (voir historyCache.ts) : l'écran Analyses réutilise
 * ce que l'Historique vient de lire, et inversement. Toute écriture de données vide ce cache.
 */
async function readAllCached<T>(kind: HistoryKind, fetcher: () => Promise<T[]>): Promise<T[]> {
  const { data } = await supabase.auth.getSession(); // lecture locale, sans réseau
  const uid = data.session?.user.id ?? null;
  const cached = uid ? readHistoryCache<T>(uid, kind) : null;
  if (cached && cached.fresh) return cached.rows;
  const startedAt = cacheVersion();
  const rows = await fetcher();
  if (uid) writeHistoryCache<T>(uid, kind, rows, startedAt);
  return rows;
}

export function fetchAllSpendingsCached(): Promise<SearchSpendingResult[]> {
  return readAllCached<SearchSpendingResult>("spending", () => fetchAllSpendings());
}

export function fetchAllRevenuesCached(): Promise<SearchRevenueResult[]> {
  return readAllCached<SearchRevenueResult>("revenue", () => fetchAllRevenues());
}

/**
 * Toutes les données de l'utilisateur pour l'export (une lecture complète, page par page, de chaque table).
 * Une table qui n'existe pas encore (SQL pas exécuté) compte pour vide : l'export reste possible.
 */
export async function fetchExportTables(): Promise<{ email: string | null; tables: ExportTables }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error(t("err.notLoggedIn"));
  const tables: ExportTables = {};
  for (const name of EXPORT_TABLES) {
    try {
      tables[name] = (await fetchAllPages((from, to) =>
        supabase.from(name).select("*").eq("user_id", user.id).order("id", { ascending: true }).range(from, to)
      )) as Array<Record<string, unknown>>;
    } catch (e) {
      if (e instanceof Error && /does not exist|schema cache|could not find the table/i.test(e.message)) tables[name] = [];
      else throw e;
    }
  }
  return { email: user.email ?? null, tables };
}

/**
 * Supprime définitivement le compte connecté et toutes ses données (fonction serveur : le client n'a pas le droit de
 * supprimer un utilisateur). `code` : "active_subscription" (abonnement payant à résilier d'abord) ou "confirm_mismatch".
 */
export async function deleteMyAccount(confirmEmail: string, cancelSubscription = false): Promise<{ ok: boolean; code?: string; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: t("err.notLoggedIn") };
  try {
    const res = await fetch("/.netlify/functions/deleteAccount", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ confirmEmail, ...(cancelSubscription ? { cancelSubscription: true } : {}) }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) {
      invalidateHistoryCache();
      return { ok: true };
    }
    const code = typeof body.error === "string" ? body.error : undefined;
    return { ok: false, code, error: code ?? "HTTP " + res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Adresse du portail client Stripe (résilier, changer de formule, factures). `code` : "no_customer" (aucun paiement Stripe
 * pour ce compte), "not_configured" (clé Stripe absente côté serveur), "stripe_error" / "stripe_unreachable".
 */
export async function openBillingPortal(): Promise<{ ok: true; url: string } | { ok: false; code?: string; error: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: t("err.notLoggedIn") };
  try {
    const res = await fetch("/.netlify/functions/manageSubscription", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
      body: "{}",
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && typeof body.url === "string") return { ok: true, url: body.url };
    const code = typeof body.error === "string" ? body.error : undefined;
    return { ok: false, code, error: code ?? "HTTP " + res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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

export function fetchTotals(forceRefresh = false): Promise<TotalsResponse> {
  return shared("mjars:cache:totals", () => fetchTotalsImpl(forceRefresh));
}

async function fetchTotalsImpl(forceRefresh: boolean): Promise<TotalsResponse> {
  const CACHE_KEY = "mjars:cache:totals";
  if (!forceRefresh) {
    const cached = getCached<TotalsResponse>(CACHE_KEY);
    if (cached) return cached;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return emptyTotals();

  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Récupérer les paramètres des jarres
  const { data: jarRows } = await supabase
    .from("jar_settings")
    .select("jar_key, percent, initial_balance")
    .eq("user_id", user.id);

  // Dépenses depuis le début (pour le net global) — on group par jar côté JS.
  // Lecture paginée : Supabase tronque à 1000 lignes par requête, sans erreur.
  const spendings = await fetchAllPages((from, to) =>
    supabase
      .from("transactions_spending")
      .select("jar, amount")
      .eq("user_id", user.id)
      .order("id", { ascending: true })
      .range(from, to)
  );

  // Revenus depuis le début
  const revenues = await fetchAllPages((from, to) =>
    supabase
      .from("transactions_revenue")
      .select("amount, rate, crypto_quantity")
      .eq("user_id", user.id)
      .order("id", { ascending: true })
      .range(from, to)
  );

  // Transferts entre jarres : ils déplacent du solde d'une jarre à l'autre (ni revenu ni dépense)
  const transferDelta = transferDeltas(await readTransferRows(user.id));
  // Déficits effacés (« repartir de zéro ») : ajoutés au solde, comptés comme dépense pardonnée pour les alertes
  const settledByJar = adjustmentTotals(await readAdjustmentRows(user.id));

  const JAR_KEYS: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];
  const DEFAULT_PCT: Record<JarKey, number> = { NEC: 55, FFA: 10, LTSS: 10, PLAY: 10, EDUC: 10, GIFT: 5 };

  // Calcul du total des revenus
  const totalRevenues = (revenues ?? []).reduce((sum, r) => {
    const amount = r.amount != null ? Number(r.amount) : (Number(r.crypto_quantity ?? 0) * Number(r.rate ?? 0));
    return sum + amount;
  }, 0);

  // Paramètres jarres
  const jarPcts: Record<JarKey, number> = { ...DEFAULT_PCT };
  const jarInitial: Record<JarKey, number> = { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 };
  (jarRows ?? []).forEach(r => {
    if (JAR_KEYS.includes(r.jar_key as JarKey)) {
      jarPcts[r.jar_key as JarKey] = Number(r.percent);
      jarInitial[r.jar_key as JarKey] = Number(r.initial_balance);
    }
  });

  // Totaux dépenses par jarre
  const spendingByJar: Record<JarKey, number> = { NEC: 0, FFA: 0, LTSS: 0, PLAY: 0, EDUC: 0, GIFT: 0 };
  (spendings ?? []).forEach(s => {
    if (JAR_KEYS.includes(s.jar as JarKey)) {
      spendingByJar[s.jar as JarKey] += Number(s.amount);
    }
  });

  const split = { ...jarPcts };
  const jarsResult = {} as TotalsResponse["jars"];
  JAR_KEYS.forEach(key => {
    const jarRevenues = totalRevenues * (jarPcts[key] / 100) + jarInitial[key] + transferDelta[key] + settledByJar[key];
    const jarSpendings = spendingByJar[key];
    jarsResult[key] = {
      revenues:  jarRevenues,
      spendings: jarSpendings,
      net:       jarRevenues - jarSpendings,
      revPct:    jarRevenues > 0 ? (jarSpendings / jarRevenues) * 100 : 0,
      transferOut: Math.max(0, -transferDelta[key]),
      settled: settledByJar[key],
    };
  });

  const result: TotalsResponse = { jars: jarsResult, totalRevenues, split };
  setCache(CACHE_KEY, result);
  return result;
}

// ── Transferts entre jarres ────────────────────────────────────────────────────

const TABLE_MISSING = /does not exist|schema cache|could not find the table/i;

async function readTransferRows(userId: string): Promise<Array<{ from_jar: string; to_jar: string; amount: number | string }>> {
  try {
    return await fetchAllPages((from, to) =>
      supabase
        .from("jar_transfers")
        .select("from_jar, to_jar, amount")
        .eq("user_id", userId)
        .order("id", { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    // Table pas encore créée (SQL non exécuté) : aucun transfert, l'app fonctionne comme avant
    if (e instanceof Error && TABLE_MISSING.test(e.message)) return [];
    throw e;
  }
}

async function readAdjustmentRows(userId: string): Promise<Array<{ jar: string; amount: number | string }>> {
  try {
    return await fetchAllPages((from, to) =>
      supabase
        .from("jar_adjustments")
        .select("jar, amount")
        .eq("user_id", userId)
        .order("id", { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    if (e instanceof Error && TABLE_MISSING.test(e.message)) return [];
    throw e;
  }
}

/** Déficits effacés, du plus récent au plus ancien. null = table absente (SQL à exécuter). */
export async function fetchJarAdjustments(): Promise<JarAdjustment[] | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("jar_adjustments")
    .select("id, jar, amount, note, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (TABLE_MISSING.test(error.message)) return null;
    throw new Error(error.message);
  }
  return (data ?? [])
    .filter((r) => isJarKey(r.jar))
    .map((r) => ({
      id: String(r.id),
      jar: r.jar as JarKey,
      amount: Number(r.amount),
      date: String(r.created_at ?? "").slice(0, 10),
      note: String(r.note ?? ""),
    }));
}

/** Efface le déficit d'une jarre : ajoute `amount` à son solde (l'historique des dépenses n'est pas touché). */
export async function addJarAdjustment(input: { jar: JarKey; amount: number; note?: string }): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };
  const { error } = await supabase.from("jar_adjustments").insert({
    user_id: user.id,
    jar: input.jar,
    amount: round2(input.amount),
    note: (input.note ?? "").trim().slice(0, 200),
  });
  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals");
  return { ok: true };
}

export async function deleteJarAdjustment(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };
  const { error } = await supabase.from("jar_adjustments").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals");
  return { ok: true };
}

/** Transferts de l'utilisateur, du plus récent au plus ancien. null = table absente (SQL à exécuter). */
export async function fetchJarTransfers(): Promise<JarTransfer[] | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("jar_transfers")
    .select("id, from_jar, to_jar, amount, transfer_date, note, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (TABLE_MISSING.test(error.message)) return null;
    throw new Error(error.message);
  }
  return (data ?? [])
    .filter((r) => isJarKey(r.from_jar) && isJarKey(r.to_jar))
    .map((r) => ({
      id: String(r.id),
      fromJar: r.from_jar as JarKey,
      toJar: r.to_jar as JarKey,
      amount: Number(r.amount),
      date: String(r.transfer_date ?? ""),
      note: String(r.note ?? ""),
    }));
}

export async function addJarTransfer(input: { from: JarKey; to: JarKey; amount: number; note?: string }): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };
  const { error } = await supabase.from("jar_transfers").insert({
    user_id: user.id,
    from_jar: input.from,
    to_jar: input.to,
    amount: round2(input.amount),
    note: (input.note ?? "").trim().slice(0, 200),
  });
  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals");
  return { ok: true };
}

export async function deleteJarTransfer(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };
  const { error } = await supabase.from("jar_transfers").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  clearCache("mjars:cache:totals");
  return { ok: true };
}

// ── Virements entre comptes ────────────────────────────────────────────────────

/** Virements de l'utilisateur, du plus récent au plus ancien. null = table absente (SQL à exécuter). */
export async function fetchAccountTransfers(): Promise<AccountTransfer[] | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  try {
    const data = await fetchAllPages((from, to) =>
      supabase
        .from("account_transfers")
        .select("id, from_account, to_account, amount, transfer_date, note")
        .eq("user_id", user.id)
        .order("id", { ascending: true })
        .range(from, to)
    );
    return data
      .map((r) => ({
        id: String(r.id),
        from: String(r.from_account ?? ""),
        to: String(r.to_account ?? ""),
        amount: Number(r.amount),
        date: String(r.transfer_date ?? ""),
        note: String(r.note ?? ""),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  } catch (e) {
    if (e instanceof Error && TABLE_MISSING.test(e.message)) return null;
    throw e;
  }
}

export async function addAccountTransfer(input: { from: string; to: string; amount: number; date?: string; note?: string }): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };
  const { error } = await supabase.from("account_transfers").insert({
    user_id: user.id,
    from_account: input.from.trim().replace(/\s+/g, " "),
    to_account: input.to.trim().replace(/\s+/g, " "),
    amount: round2(input.amount),
    ...(input.date ? { transfer_date: input.date } : {}),
    note: (input.note ?? "").trim().slice(0, 200),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAccountTransfer(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };
  const { error } = await supabase.from("account_transfers").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
  if (!user) return { ok: false, error: t("err.notLoggedIn") };

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
  if (!user) return { ok: false, error: t("err.notLoggedIn") };

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

// ── Paramètres des jarres ──────────────────────────────────────────────────────

export async function fetchJarSettings(): Promise<Array<{key: JarKey; percent: number; initialBalance: number}> | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("jar_settings")
    .select("jar_key, percent, initial_balance")
    .eq("user_id", user.id);
  if (error || !data || data.length === 0) return null;
  return data.map(r => ({
    key: r.jar_key as JarKey,
    percent: Number(r.percent),
    initialBalance: Number(r.initial_balance),
  }));
}

export async function saveJarSettings(
  settings: Array<{key: JarKey; percent: number; initialBalance: number}>
): Promise<{ok: boolean; error?: string}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };
  const rows = settings.map(s => ({
    user_id:         user.id,
    jar_key:         s.key,
    percent:         s.percent,
    initial_balance: s.initialBalance,
  }));
  const { error } = await supabase
    .from("jar_settings")
    .upsert(rows, { onConflict: "user_id,jar_key" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Préférences budget (mensuel + par tag) ─────────────────────────────────────
// Stockées dans column_mappings (JSONB) sous la clé "user_budget_prefs"

const BUDGET_PREFS_MAPPING_KEY = "user_budget_prefs";

export async function fetchUserBudgetPrefs(): Promise<{monthlyBudget?: number; tagBudgets?: Record<string, number>}> {
  try {
    const mappings = await fetchColumnMappings();
    const prefs = mappings[BUDGET_PREFS_MAPPING_KEY] as {monthlyBudget?: number; tagBudgets?: Record<string, number>} | undefined;
    return prefs ?? {};
  } catch { return {}; }
}

export async function saveUserBudgetPrefs(
  prefs: {monthlyBudget?: number; tagBudgets?: Record<string, number>}
): Promise<void> {
  await saveColumnMappingToSheet(BUDGET_PREFS_MAPPING_KEY, prefs);
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

export function fetchAnalytics(forceRefresh = false): Promise<AnalyticsResponse> {
  return shared("mjars:cache:analytics", () => fetchAnalyticsImpl(forceRefresh));
}

async function fetchAnalyticsImpl(forceRefresh: boolean): Promise<AnalyticsResponse> {
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

  // Lectures paginées (Supabase tronque à 1000 lignes par requête, sans erreur)
  const [spData, revData] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase.from("transactions_spending")
        .select("date, jar, amount")
        .eq("user_id", user.id)
        .gte("date", fromDate)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase.from("transactions_revenue")
        .select("date, source, amount, crypto_quantity, rate")
        .eq("user_id", user.id)
        .gte("date", fromDate)
        .order("id", { ascending: true })
        .range(from, to)
    ),
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
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
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
  // Mettre à jour le cache local immédiatement. Seulement s'il existe déjà : en créer un à partir d'une seule
  // clé le ferait passer pour complet et masquerait les autres réglages pendant une heure.
  try {
    const raw = localStorage.getItem(COLMAPPING_CACHE_KEY);
    if (raw) {
      const existing = JSON.parse(raw) as { data: Record<string, unknown>; ts: number };
      existing.data[mappingKey] = mapping;
      localStorage.setItem(COLMAPPING_CACHE_KEY, JSON.stringify(existing));
    }
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

  // Upsert d'abord (les anciennes règles restent intactes si ça échoue),
  // puis suppression des patterns obsolètes.
  if (rules.length > 0) {
    const rows = rules.map(r => ({
      user_id: user.id,
      pattern: r.originalKey,
      jar:     r.jar ?? null,
      tags:    r.tags.join(","),
    }));
    const { error } = await supabase
      .from("auto_tag_rules")
      .upsert(rows, { onConflict: "user_id,pattern" });
    if (error) {
      console.warn("saveAutoTagRules: erreur upsert", error.message);
      return;
    }
  }

  // Supprimer les règles qui n'existent plus dans le nouveau jeu
  const activePatterns = rules.map(r => r.originalKey);
  if (activePatterns.length > 0) {
    await supabase
      .from("auto_tag_rules")
      .delete()
      .eq("user_id", user.id)
      .not("pattern", "in", `(${activePatterns.map(p => `"${p.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`);
  } else {
    await supabase.from("auto_tag_rules").delete().eq("user_id", user.id);
  }
}

// ── Suggestions des utilisateurs ───────────────────────────────────────────────

export type FeedbackCategory = "bug" | "idea" | "ux";

export async function sendFeedback(input: {
  category: FeedbackCategory;
  message: string;
  email?: string;
  lang?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("err.notLoggedIn") };

  const { error } = await supabase.from("feedback").insert({
    user_id:  user.id,
    category: input.category,
    message:  input.message.slice(0, 2000),
    email:    input.email || null,
    lang:     input.lang ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Train de vie (dépenses hors extraordinaires) ───────────────────────────────

/**
 * Dépenses (date ISO, montant, étiquettes) depuis une date. Lues par pages de 1000 :
 * Supabase plafonne chaque requête, et la moyenne annuelle doit porter sur toutes les lignes.
 */
/** Dépense lue pour le train de vie : assez de champs pour pouvoir la modifier (ex. la marquer « Exceptionnel »). */
export interface SpendingLite {
  id: number;
  date: string; // AAAA-MM-JJ
  amount: number;
  tags: string;
  description: string;
  jar: string;
  account: string;
  subscription: string;
}

export async function fetchSpendingsSince(fromISO: string): Promise<SpendingLite[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const data = await fetchAllPages((rangeFrom, rangeTo) =>
    supabase
      .from("transactions_spending")
      .select("id, date, amount, tags, description, jar, account, subscription")
      .eq("user_id", user.id)
      .gte("date", fromISO)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(rangeFrom, rangeTo)
  );
  return data.map((r) => ({
    id: r.id,
    date: String(r.date),
    amount: Number(r.amount),
    tags: r.tags ?? "",
    description: r.description ?? "",
    jar: r.jar ?? "",
    account: r.account ?? "",
    subscription: r.subscription ?? "",
  }));
}

/** Dépenses complètes (mêmes champs que searchSpendings) depuis une date, lues en entier par pages. */
export async function fetchSpendingRowsSince(fromISO: string): Promise<SearchSpendingResult[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const data = await fetchAllPages((from, to) =>
    supabase
      .from("transactions_spending")
      .select("id, date, jar, account, amount, description, tags, subscription")
      .eq("user_id", user.id)
      .gte("date", fromISO)
      .order("date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)
  );
  return data.map((r) => ({
    rowIndex:     r.id,
    date:         toDDMMYYYY(r.date),
    jar:          r.jar as JarKey,
    account:      r.account,
    amount:       Number(r.amount),
    description:  r.description,
    tags:         r.tags,
    subscription: r.subscription,
  }));
}

/** Horodatages de saisie des dépenses depuis une date (pour le calcul du streak). */
export async function fetchEntryTimestamps(sinceISO: string): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from("transactions_spending")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
  return rows.map((r) => String(r.created_at));
}

// Étiquettes que l'utilisateur considère « extraordinaires », stockées dans column_mappings
// sous une clé à part (n'interfère pas avec user_budget_prefs).
const LIFESTYLE_PREFS_KEY = "lifestyle_prefs";

export async function fetchLifestylePrefs(): Promise<{ extraordinaryTags: string[] }> {
  try {
    const mappings = await fetchColumnMappings();
    const prefs = mappings[LIFESTYLE_PREFS_KEY] as { extraordinaryTags?: unknown } | undefined;
    const tags = Array.isArray(prefs?.extraordinaryTags) ? prefs!.extraordinaryTags.filter((x): x is string => typeof x === "string") : [];
    return { extraordinaryTags: tags };
  } catch {
    return { extraordinaryTags: [] };
  }
}

export async function saveLifestylePrefs(prefs: { extraordinaryTags: string[] }): Promise<void> {
  await saveColumnMappingToSheet(LIFESTYLE_PREFS_KEY, prefs);
}

// ── Étiquette « Exceptionnel » : mise en place unique ─────────────────────────
const LIFESTYLE_SEEDED_KEY = "lifestyle_seeded";

/**
 * Ajoute l'étiquette « Exceptionnel » aux étiquettes de l'utilisateur et la présélectionne pour le train de vie,
 * une seule fois. Lecture stricte du cloud (sans cache ni valeur par défaut) : en cas d'erreur on ne touche à rien,
 * pour ne jamais écraser un choix existant. Renvoie la nouvelle liste d'étiquettes si elle a changé.
 */
let seedInFlight: Promise<Tag[] | null> | null = null;

export function seedExceptionalTagIfNeeded(tags: Tag[]): Promise<Tag[] | null> {
  // Une seule mise en place à la fois (l'effet de démarrage peut se déclencher plusieurs fois)
  if (!seedInFlight) {
    seedInFlight = seedExceptionalTag(tags).finally(() => { seedInFlight = null; });
  }
  return seedInFlight;
}

async function seedExceptionalTag(tags: Tag[]): Promise<Tag[] | null> {
  if (tags.length === 0) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("column_mappings")
    .select("mapping_key, mapping")
    .eq("user_id", user.id)
    .in("mapping_key", [LIFESTYLE_PREFS_KEY, LIFESTYLE_SEEDED_KEY]);
  if (error || !data) return null;

  const prefs = data.find((r) => r.mapping_key === LIFESTYLE_PREFS_KEY)?.mapping as { extraordinaryTags?: unknown } | undefined;
  const chosen = Array.isArray(prefs?.extraordinaryTags) ? prefs!.extraordinaryTags.filter((x): x is string => typeof x === "string") : [];
  const seeded = data.some((r) => r.mapping_key === LIFESTYLE_SEEDED_KEY);

  const plan = planExceptionalSeed(tags, chosen, seeded);
  if (!plan.markDone) return null;

  let nextTags: Tag[] | null = null;
  if (plan.addTag) {
    const def = getDefaultTags().find((t) => t.id === EXCEPTIONAL_TAG_ID);
    if (def) {
      nextTags = [...tags, def];
      await saveTags([def]); // upsert d'une seule ligne : les autres étiquettes ne sont pas réécrites
      setCachedTags(nextTags);
    }
  }
  if (plan.selectTag) {
    await saveLifestylePrefs({ extraordinaryTags: [EXCEPTIONAL_TAG_ID] });
    // La carte « train de vie » est peut-être déjà affichée : on lui donne le choix sans attendre le cloud
    window.dispatchEvent(new CustomEvent("mjars:lifestylePrefsChanged", { detail: { extraordinaryTags: [EXCEPTIONAL_TAG_ID] } }));
  }
  await saveColumnMappingToSheet(LIFESTYLE_SEEDED_KEY, { done: true });
  return nextTags;
}

// ── Grosses dépenses proposées en « Exceptionnel » ────────────────────────────
const EXCEPTIONAL_DISMISSED_KEY = "exceptional_dismissed";
const EXCEPTIONAL_DISMISSED_MAX = 300;

/** Dépenses que l'utilisateur a écartées (« non, c'est normal »). */
export async function fetchExceptionalDismissed(): Promise<string[]> {
  try {
    const mappings = await fetchColumnMappings();
    const v = mappings[EXCEPTIONAL_DISMISSED_KEY] as { ids?: unknown } | undefined;
    return Array.isArray(v?.ids) ? v!.ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function saveExceptionalDismissed(ids: string[]): Promise<void> {
  await saveColumnMappingToSheet(EXCEPTIONAL_DISMISSED_KEY, { ids: ids.slice(-EXCEPTIONAL_DISMISSED_MAX) });
}

/**
 * Marque une dépense « Exceptionnel » : ajoute l'étiquette à la dépense, la crée si l'utilisateur l'a supprimée, et la
 * coche pour le train de vie si elle ne l'est plus. `currentExtraordinary` = étiquettes déjà cochées (lues dans le
 * cloud par l'appelant : on n'écrase jamais un choix sur une lecture ratée). Renvoie la liste cochée si elle a changé.
 */
export async function markSpendingExceptional(
  row: SpendingLite,
  currentExtraordinary: string[]
): Promise<{ ok: boolean; error?: string; extraordinary?: string[] }> {
  const res = await updateSpending(row.id, {
    date: row.date,
    jar: row.jar,
    account: row.account,
    amount: row.amount,
    description: row.description,
    tags: addTagTo(row.tags, EXCEPTIONAL_TAG_ID),
    subscription: row.subscription,
  });
  if (!res.ok) return res;

  try {
    const known = await fetchTagsFromSheet();
    if (known.length > 0 && !known.some((tg) => tg.id === EXCEPTIONAL_TAG_ID)) {
      const def = getDefaultTags().find((tg) => tg.id === EXCEPTIONAL_TAG_ID);
      if (def) {
        await saveTags([def]);
        setCachedTags([...known, def]);
      }
    }
  } catch { /* la dépense est marquée ; l'étiquette se recrée à la prochaine occasion */ }

  if (currentExtraordinary.includes(EXCEPTIONAL_TAG_ID)) return { ok: true };
  const next = [...currentExtraordinary, EXCEPTIONAL_TAG_ID];
  try {
    await saveLifestylePrefs({ extraordinaryTags: next });
    window.dispatchEvent(new CustomEvent("mjars:lifestylePrefsChanged", { detail: { extraordinaryTags: next } }));
    return { ok: true, extraordinary: next };
  } catch {
    return { ok: true };
  }
}

// ── Abonnements que l'utilisateur a écartés (« ce n'est pas un abonnement ») ──
const DISMISSED_SUBS_KEY = "subscriptions_dismissed";

export async function fetchDismissedSubscriptions(): Promise<string[]> {
  try {
    const mappings = await fetchColumnMappings();
    const v = mappings[DISMISSED_SUBS_KEY] as { keys?: unknown } | undefined;
    return Array.isArray(v?.keys) ? v!.keys.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function saveDismissedSubscriptions(keys: string[]): Promise<void> {
  await saveColumnMappingToSheet(DISMISSED_SUBS_KEY, { keys });
}
