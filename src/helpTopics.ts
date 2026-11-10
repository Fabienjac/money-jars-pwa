// Fiches d'aide de l'application : liste des sujets et clés de traduction. Module pur, testé dans tests/helpTopics.test.mjs
// (chaque clé doit exister en français et en anglais).

/** Événement qui ouvre l'écran Aide sur un sujet (détail : { topic }). */
export const OPEN_HELP_EVENT = "mjars:openHelp";

export type HelpTopicId = "accounts" | "transfer" | "jars" | "rules" | "tags";

export interface HelpTopic {
  id: HelpTopicId;
  icon: string;
  /** Nombre de paragraphes (clés help.<id>.p1 … pN). */
  paragraphs: number;
}

export const HELP_TOPICS: HelpTopic[] = [
  { id: "accounts", icon: "🏦", paragraphs: 4 },
  { id: "transfer", icon: "🔁", paragraphs: 3 },
  { id: "jars", icon: "🏺", paragraphs: 2 },
  { id: "rules", icon: "⚡", paragraphs: 4 },
  { id: "tags", icon: "🏷️", paragraphs: 3 },
];

export function isHelpTopic(x: unknown): x is HelpTopicId {
  return HELP_TOPICS.some((t) => t.id === x);
}

/** Toutes les clés de traduction d'un sujet : titre, phrase d'aide rapide (« ? ») et paragraphes. */
export function helpKeys(topic: HelpTopic): string[] {
  const keys = [`help.${topic.id}.title`, `help.${topic.id}.short`];
  for (let i = 1; i <= topic.paragraphs; i++) keys.push(`help.${topic.id}.p${i}`);
  return keys;
}
