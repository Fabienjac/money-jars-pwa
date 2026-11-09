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

/** « NEC · Carte bancaire · alimentaire » : résumé d'une règle pour l'écran. */
export function describeRule(rule: EntryRule, tagName: (id: string) => string = (id) => id): string {
  const parts: string[] = [];
  if (rule.jar) parts.push(rule.jar);
  if (rule.account) parts.push(rule.account);
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
}

/**
 * Anciennes règles de DÉPENSE → règles écrites à la main. Elles l'emportent sur une règle apprise de même mot-clé
 * (la personne les a voulues) mais ne touchent pas une règle déjà écrite à la main dans le cloud.
 * Les règles de revenu ne sont pas reprises ici : elles gardent leur circuit actuel.
 */
export function legacyToRules(legacy: LegacyRule[], existing: EntryRule[]): EntryRule[] {
  const out: EntryRule[] = [];
  const seen = new Set<string>();
  for (const l of legacy) {
    if (l.mode !== "spending") continue;
    const keyword = normalizeKeyword(l.keyword);
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    const current = existing.find((e) => e.mode === "spending" && e.keyword === keyword);
    if (current && current.origin === "manual") continue;
    out.push({
      keyword,
      mode: "spending",
      jar: l.jar || undefined,
      account: (l.account ?? "").trim() || undefined,
      tags: current?.tags ?? [],
      origin: "manual",
    });
  }
  return out;
}
