// Export complet des données de l'utilisateur. Module pur, testé dans tests/dataExport.test.mjs.
import { csvNumber, toCsv } from "./historyFilters";

/** Tables exportées, dans l'ordre du fichier. Les appareils de notification push et les identifiants de paiement n'y figurent pas. */
export const EXPORT_TABLES = [
  "transactions_spending",
  "transactions_revenue",
  "jar_transfers",
  "jar_adjustments",
  "account_transfers",
  "jar_settings",
  "tags",
  "accounts",
  "revenue_accounts",
  "auto_tag_rules",
  "column_mappings",
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number];
export type ExportTables = Partial<Record<ExportTable, Array<Record<string, unknown>>>>;

export interface ExportFile {
  app: "Money Jars";
  format: 1;
  exportedAt: string;
  account: { email: string | null };
  counts: Record<string, number>;
  tables: Record<string, Array<Record<string, unknown>>>;
}

/** Colonnes qui ne sont pas des données de l'utilisateur (identifiant de compte) : retirées du fichier. */
const DROP_COLUMNS = new Set(["user_id"]);

const clean = (row: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!DROP_COLUMNS.has(k)) out[k] = v;
  return out;
};

export function buildExport(tables: ExportTables, meta: { email?: string | null; now: Date }): ExportFile {
  const outTables: Record<string, Array<Record<string, unknown>>> = {};
  const counts: Record<string, number> = {};
  for (const name of EXPORT_TABLES) {
    const rows = (tables[name] ?? []).map(clean);
    outTables[name] = rows;
    counts[name] = rows.length;
  }
  return { app: "Money Jars", format: 1, exportedAt: meta.now.toISOString(), account: { email: meta.email ?? null }, counts, tables: outTables };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function exportFileName(kind: "all" | "spendings" | "revenues", now: Date): string {
  const base = kind === "all" ? "money-jars-donnees" : kind === "spendings" ? "money-jars-depenses" : "money-jars-revenus";
  return `${base}-${stamp(now)}.${kind === "all" ? "json" : "csv"}`;
}

const str = (v: unknown): string => (v == null ? "" : String(v));
const isoDate = (v: unknown): string => str(v).slice(0, 10);
const num = (v: unknown, decimalComma: boolean): string => (v == null || v === "" ? "" : csvNumber(Number(v), decimalComma));

/** CSV des dépenses (dates AAAA-MM-JJ). `headers` : en-têtes déjà traduits, dans l'ordre des colonnes. */
export function spendingsCsv(rows: Array<Record<string, unknown>>, decimalComma: boolean, headers: string[]): string {
  return toCsv(
    [headers, ...rows.map((r) => [isoDate(r.date), str(r.description), num(r.amount, decimalComma), str(r.jar), str(r.account), str(r.tags), str(r.subscription)])],
    decimalComma ? ";" : ","
  );
}

export function revenuesCsv(rows: Array<Record<string, unknown>>, decimalComma: boolean, headers: string[]): string {
  return toCsv(
    [headers, ...rows.map((r) => [
      isoDate(r.date), str(r.source), num(r.amount, decimalComma), str(r.value), str(r.crypto_quantity), str(r.method),
      str(r.rate), str(r.destination), str(r.income_type), str(r.tags),
    ])],
    decimalComma ? ";" : ","
  );
}
