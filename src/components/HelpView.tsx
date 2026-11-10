// Écran Aide : les notions de l'app en fiches courtes (comptes et sources, virements, jarres, règles, tags).
import React, { useEffect, useRef, useState } from "react";
import { useT, JAR_LABELS, type TKey } from "../i18n";
import { HELP_TOPICS, type HelpTopicId } from "../helpTopics";
import SettingsAccordion from "./SettingsAccordion";

interface Props {
  /** Sujet à ouvrir d'emblée (lien « En savoir plus » d'un « ? »). */
  topic?: HelpTopicId | null;
}

const JAR_EMOJI: Record<string, string> = { NEC: "🏠", FFA: "💰", LTSS: "🎯", PLAY: "🎉", EDUC: "📚", GIFT: "🎁" };

/** Texte avec des mots en gras écrits **ainsi** : découpé en morceaux, jamais injecté comme HTML. */
function richText(text: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <React.Fragment key={i}>{part}</React.Fragment>));
}

const HelpView: React.FC<Props> = ({ topic = null }) => {
  const t = useT();
  const [open, setOpen] = useState<string | null>(topic);
  const rootRef = useRef<HTMLDivElement>(null);

  // Un « En savoir plus » alors que l'écran est déjà ouvert : on ouvre le bon sujet et on le montre
  useEffect(() => {
    if (!topic) return;
    setOpen(topic);
    requestAnimationFrame(() => {
      rootRef.current?.querySelector(`[data-acc="${topic}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [topic]);

  return (
    <div className="help-view" ref={rootRef}>
      <h2 className="more-title">{t("help.pageTitle")}</h2>
      <p className="acc-intro">{t("help.intro")}</p>
      {HELP_TOPICS.map((tp) => (
        <SettingsAccordion
          key={tp.id}
          id={tp.id}
          title={`${tp.icon} ${t(`help.${tp.id}.title` as TKey)}`}
          open={open === tp.id}
          onToggle={(id) => setOpen((cur) => (cur === id ? null : id))}
        >
          {Array.from({ length: tp.paragraphs }, (_, i) => (
            <p key={i} className="help-p">{richText(t(`help.${tp.id}.p${i + 1}` as TKey))}</p>
          ))}
          {tp.id === "jars" && (
            <ul className="help-jars">
              {Object.keys(JAR_EMOJI).map((k) => (
                <li key={k}>
                  <span aria-hidden="true">{JAR_EMOJI[k]}</span>
                  <span><strong>{JAR_LABELS[k as keyof typeof JAR_LABELS]}</strong> · {t(`onb.desc.${k}` as TKey)}</span>
                </li>
              ))}
            </ul>
          )}
        </SettingsAccordion>
      ))}
      <p className="help-footer">{t("help.footer")}</p>
    </div>
  );
};

export default HelpView;
