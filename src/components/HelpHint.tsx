// Petit « ? » à côté d'un champ qui peut prêter à confusion : touche-le pour lire l'explication en deux phrases.
// `more` ajoute « En savoir plus » qui ouvre l'écran Aide sur ce sujet ; à éviter dans un formulaire en cours de saisie
// (ouvrir l'Aide ferme le formulaire).
import React, { useState } from "react";
import { useT, type TKey } from "../i18n";
import { OPEN_HELP_EVENT, type HelpTopicId } from "../helpTopics";

interface Props {
  topic: HelpTopicId;
  more?: boolean;
}

const HelpHint: React.FC<Props> = ({ topic, more = false }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="help-hint-btn"
        aria-expanded={open}
        aria-label={t("help.hintAria")}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
      >
        ?
      </button>
      {open && (
        <span className="help-hint-bubble" role="note">
          {t(`help.${topic}.short` as TKey)}
          {more && (
            <button
              type="button"
              className="help-hint-more"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent(OPEN_HELP_EVENT, { detail: { topic } }));
              }}
            >
              {t("help.more")}
            </button>
          )}
        </span>
      )}
    </>
  );
};

export default HelpHint;
