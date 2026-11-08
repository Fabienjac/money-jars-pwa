// src/i18n/index.ts — internationalisation légère (sans dépendance) : fr / en
import { useEffect, useState } from "react";
import { fetchColumnMappings, saveColumnMappingToSheet } from "../api";
import fr from "./fr";
import en from "./en";

export type Lang = "fr" | "en";
export type TKey = keyof typeof fr;

export const LANGS: { code: Lang; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
];

const dicts: Record<Lang, Record<TKey, string>> = { fr, en };
const LANG_KEY = "mjars:lang";
const LANG_MAPPING_KEY = "user_lang_prefs";

function detectLang(): Lang {
  try {
    const nav = (navigator.language || "en").toLowerCase();
    return nav.startsWith("fr") ? "fr" : "en";
  } catch {
    return "en";
  }
}

export function getLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "fr" || v === "en") return v;
  } catch { /* ignore */ }
  return detectLang();
}

function applyHtmlLang(l: Lang) {
  try { document.documentElement.lang = l; } catch { /* ignore */ }
}

/** Sauvegarde locale + cloud (best effort) + notification des écrans ouverts. */
export function setLang(l: Lang): void {
  try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  saveColumnMappingToSheet(LANG_MAPPING_KEY, { lang: l }).catch(() => {});
  applyHtmlLang(l);
  window.dispatchEvent(new CustomEvent("langUpdated"));
}

export async function fetchLangFromCloud(): Promise<Lang | null> {
  try {
    const m = await fetchColumnMappings();
    const l = (m[LANG_MAPPING_KEY] as { lang?: string } | undefined)?.lang;
    if (l === "fr" || l === "en") {
      try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
      return l;
    }
  } catch { /* ignore */ }
  return null;
}

/** Traduit une clé ; `{nom}` est remplacé par vars.nom. Retombe sur le français puis sur la clé. */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  const lang = getLang();
  let s = dicts[lang][key] ?? fr[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/** Langue courante, à jour quand elle change dans Réglages. */
export function useLang(): Lang {
  const [lang, setL] = useState<Lang>(getLang);
  useEffect(() => {
    applyHtmlLang(getLang());
    const reload = () => setL(getLang());
    window.addEventListener("langUpdated", reload);
    fetchLangFromCloud().then((l) => { if (l) { setL(l); applyHtmlLang(l); } });
    return () => window.removeEventListener("langUpdated", reload);
  }, []);
  return lang;
}

/** Hook : renvoie `t` et re-rend le composant quand la langue change. */
export function useT(): typeof t {
  useLang();
  return t;
}

/** Locale BCP 47 pour Intl (dates, nombres, devises). */
export function localeTag(): string {
  return getLang() === "fr" ? "fr-FR" : "en-US";
}

const currencyNameCache = new Map<string, string>();

/** Nom de devise dans la langue courante (« Dollar américain » / « US Dollar »), repli sur le code. */
export function currencyName(code: string): string {
  const key = `${localeTag()}|${code}`;
  const cached = currencyNameCache.get(key);
  if (cached) return cached;
  let name = code;
  try {
    const n = new Intl.DisplayNames([localeTag()], { type: "currency" }).of(code);
    if (n) name = n.charAt(0).toUpperCase() + n.slice(1);
  } catch { /* garde le code */ }
  currencyNameCache.set(key, name);
  return name;
}

/** Nom court du mois (0-11) dans la langue courante : « Jan » / « janv. ». */
export function monthShort(i: number): string {
  const n = new Intl.DateTimeFormat(localeTag(), { month: "short" }).format(new Date(2024, i, 1)).replace(/\.$/, "");
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Nom complet du mois (0-11) dans la langue courante. */
export function monthLong(i: number): string {
  const n = new Intl.DateTimeFormat(localeTag(), { month: "long" }).format(new Date(2024, i, 1));
  return n.charAt(0).toUpperCase() + n.slice(1);
}

type JarKeyLocal = "NEC" | "FFA" | "LTSS" | "PLAY" | "EDUC" | "GIFT";
const JAR_KEYS_LOCAL: JarKeyLocal[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];

/** Noms des jarres dans la langue courante : JAR_LABELS.NEC, JAR_LABELS[key]… */
export const JAR_LABELS = {} as Record<JarKeyLocal, string>;
/** Phrases d'encouragement des jarres vides. */
export const JAR_EMPTY_COPY = {} as Record<JarKeyLocal, string>;
for (const k of JAR_KEYS_LOCAL) {
  Object.defineProperty(JAR_LABELS, k, { get: () => t(`jar.${k}` as TKey), enumerable: true });
  Object.defineProperty(JAR_EMPTY_COPY, k, { get: () => t(`jar.empty.${k}` as TKey), enumerable: true });
}
