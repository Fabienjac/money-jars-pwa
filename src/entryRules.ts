// Règles automatiques de saisie : un mot-clé → jarre, compte, étiquettes (revenus : destination, type).
// Une seule liste pour les règles écrites à la main (Réglages) et celles apprises à l'import ; stockée dans le cloud
// (table auto_tag_rules, voir supabase/rules_unify.sql). Module pur : testé dans tests/entryRules.test.mjs.
import { accountKey } from "./accountMerge";

export type RuleOrigin = "manual" | "learned";
export type RuleMode = "spending" | "revenue";

export interface EntryRule {
  /** Mot-clé normalisé (minuscules, espaces simples) : c'est la clé de la règle dans la base. */
  keyword: string;
  mode: RuleMode;
  jar?: string;
  /** Nom du compte tel que dans la liste des comptes de l'utilisateur. */
  account?: string;
  tags: string[];
  destination?: string;
  incomeType?: string;
  origin: RuleOrigin;
}

/** Même normalisation que les règles apprises de l'import (autoTagRules.normalizeKey) : minuscules, espaces simples. */
export function normalizeKeyword(s: string): string {
  return String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

/** Forme de comparaison : sans accents, ponctuation remplacée par des espaces (« McDo's » → « mcdo s »). */
export function foldText(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Le mot-clé figure-t-il dans le texte, en mots entiers ? « carrefour » est dans « Carrefour City », pas « bar » dans « barbecue ». */
export function keywordMatches(keyword: string, text: string): boolean {
  const k = foldText(keyword);
  if (!k) return false;
  return (" " + foldText(text) + " ").includes(" " + k + " ");
}

/**
 * La règle qui s'applique à ce texte : parmi celles qui correspondent, la plus précise (mot-clé le plus long) ;
 * à égalité, une règle écrite à la main passe avant une règle apprise, puis l'ordre alphabétique (résultat stable).
 */
export function findBestRule(text: string, rules: EntryRule[], mode: RuleMode = "spending"): EntryRule | null {
  let best: EntryRule | null = null;
  for (const r of rules) {
    if (r.mode !== mode || !keywordMatches(r.keyword, text)) continue;
    if (!best) { best = r; continue; }
    const lr = foldText(r.keyword).length;
    const lb = foldText(best.keyword).length;
    if (lr > lb) best = r;
    else if (lr === lb) {
      if (r.origin === "manual" && best.origin !== "manual") best = r;
      else if (r.origin === best.origin && r.keyword < best.keyword) best = r;
    }
  }
  return best;
}

/** Le nom du compte de la règle, retrouvé dans la liste des comptes sans tenir compte de la casse (null s'il n'existe pas). */
export function resolveAccountName(ruleAccount: string | undefined, accountNames: string[]): string | null {
  if (!ruleAccount) return null;
  const k = accountKey(ruleAccount);
  return accountNames.find((n) => accountKey(n) === k) ?? null;
}

export interface FieldState {
  /** La personne a déjà choisi elle-même ce champ : une règle ne le remplace pas. */
  touched: boolean;
}

export interface SpendingPatch {
  jar?: string;
  account?: string;
  tags?: string[];
}

/** Ce qu'une règle change dans une dépense : seulement les champs que la personne n'a pas choisis elle-même. */
export function spendingPatch(
  rule: EntryRule,
  touched: { jar: boolean; account: boolean; tags: boolean },
  accountNames: string[],
  validJars: string[],
): SpendingPatch {
  const patch: SpendingPatch = {};
  if (!touched.jar && rule.jar && validJars.includes(rule.jar)) patch.jar = rule.jar;
  if (!touched.account) {
    const acc = resolveAccountName(rule.account, accountNames);
    if (acc) patch.account = acc;
  }
  if (!touched.tags && rule.tags.length > 0) patch.tags = [...rule.tags];
  return patch;
}

/**
 * Applique la règle de la personne à un brouillon (saisie vocale : l'IA a deviné jarre, compte et tags, la règle écrite
 * par la personne est plus fiable). Renvoie le brouillon corrigé et ce qui a changé, ou null si la règle ne change rien.
 */
export function applyRuleToDraft<T extends { jar: string; account: string; tags: string[] }>(
  draft: T,
  rule: EntryRule,
  accountNames: string[],
  validJars: string[],
): { draft: T; patch: SpendingPatch } | null {
  const patch = spendingPatch(rule, { jar: false, account: false, tags: false }, accountNames, validJars);
  const changes =
    (patch.jar !== undefined && patch.jar !== draft.jar) ||
    (patch.account !== undefined && patch.account !== draft.account) ||
    (patch.tags !== undefined && patch.tags.join(",") !== draft.tags.join(","));
  if (!changes) return null;
  return { draft: { ...draft, ...patch }, patch };
}

/** « NEC · Carte bancaire · alimentaire » : résumé d'une règle pour l'écran. */
export function describeRule(rule: EntryRule, tagName: (id: string) => string = (id) => id): string {
  const parts: string[] = [];
  if (rule.jar) parts.push(rule.jar);
  if (rule.account) parts.push(rule.account);
  if (rule.destination) parts.push(rule.destination);
  if (rule.incomeType) parts.push(rule.incomeType);
  if (rule.tags.length > 0) parts.push(rule.tags.map(tagName).join(", "));
  return parts.join(" · ");
}

// ── Conversion avec la base ─────────────────────────────────────────────────────

export interface RuleRow {
  pattern: string;
  jar?: string | null;
  tags?: string | null;
  account?: string | null;
  mode?: string | null;
  destination?: string | null;
  income_type?: string | null;
  origin?: string | null;
}

export function rowToRule(r: RuleRow): EntryRule {
  return {
    keyword: normalizeKeyword(r.pattern),
    mode: r.mode === "revenue" ? "revenue" : "spending",
    jar: r.jar || undefined,
    account: r.account || undefined,
    tags: r.tags ? r.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    destination: r.destination || undefined,
    incomeType: r.income_type || undefined,
    origin: r.origin === "manual" ? "manual" : "learned",
  };
}

export function ruleToRow(r: EntryRule): RuleRow {
  return {
    pattern: normalizeKeyword(r.keyword),
    jar: r.jar ?? null,
    tags: r.tags.join(","),
    account: r.account ?? null,
    mode: r.mode,
    destination: r.destination ?? null,
    income_type: r.incomeType ?? null,
    origin: r.origin,
  };
}

// ── Reprise des anciennes règles locales (Réglages, avant le cloud) ────────────

export interface LegacyRule {
  mode: "spending" | "revenue";
  keyword: string;
  jar?: string;
  account?: string;
  destination?: string;
  incomeType?: string;
}

/**
 * Anciennes règles locales d'un mode → règles écrites à la main. Elles l'emportent sur une règle apprise de même
 * mot-clé (la personne les a voulues) mais ne touchent pas une règle déjà écrite à la main dans le cloud.
 */
export function legacyToRules(legacy: LegacyRule[], existing: EntryRule[], mode: RuleMode = "spending"): EntryRule[] {
  const out: EntryRule[] = [];
  const seen = new Set<string>();
  for (const l of legacy) {
    if (l.mode !== mode) continue;
    const keyword = normalizeKeyword(l.keyword);
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    const current = existing.find((e) => e.keyword === keyword);
    if (current && (current.origin === "manual" || current.mode !== mode)) continue; // jamais écraser une règle à soi, ni celle de l'autre mode
    out.push(mode === "spending"
      ? { keyword, mode, jar: l.jar || undefined, account: (l.account ?? "").trim() || undefined, tags: current?.tags ?? [], origin: "manual" }
      : { keyword, mode, destination: (l.destination ?? "").trim() || undefined, incomeType: (l.incomeType ?? "").trim() || undefined, tags: [], origin: "manual" });
  }
  return out;
}

/**
 * Libellés déjà utilisés (types de revenu…), sans doublon de casse : on garde l'écriture la plus fréquente, la plus
 * fréquente d'abord. Sert d'aide à la saisie pour ne pas créer de variante d'orthographe.
 */
export function distinctLabels(values: Array<string | null | undefined>): string[] {
  const groups = new Map<string, Map<string, number>>();
  for (const raw of values) {
    const v = String(raw ?? "").trim().replace(/\s+/g, " ");
    if (!v) continue;
    const key = v.toLowerCase();
    const g = groups.get(key) ?? new Map<string, number>();
    g.set(v, (g.get(v) ?? 0) + 1);
    groups.set(key, g);
  }
  const rows = [...groups.values()].map((g) => {
    // écriture la plus fréquente ; à égalité, celle qui commence par une majuscule (« Salaire »), puis l'ordre alphabétique
    const cap = (x: string) => (x[0] !== x[0].toLowerCase() ? 1 : 0);
    const spellings = [...g.entries()].sort((a, b) => b[1] - a[1] || cap(b[0]) - cap(a[0]) || a[0].localeCompare(b[0]));
    return { label: spellings[0][0], total: [...g.values()].reduce((x, y) => x + y, 0) };
  });
  return rows.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)).map((r) => r.label);
}
