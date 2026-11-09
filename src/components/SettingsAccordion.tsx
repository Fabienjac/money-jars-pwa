// Bloc repliable de l'écran Réglages : un titre (avec une ligne de résumé de l'état) et le contenu en dessous.
// Le contenu reste monté même replié (attribut hidden) : les formulaires et les lectures en cours ne repartent pas de zéro.
// Les sections enveloppées gardent leur propre titre dans le code ; il est masqué en CSS (.acc-body) car le titre du bloc le remplace.
import React, { useId } from "react";

interface Props {
  id: string;
  title: string;
  /** Une ligne sous le titre : l'état en un coup d'œil (« 55 / 10 / 10… », « 3 comptes »). */
  summary?: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}

const SettingsAccordion: React.FC<Props> = ({ id, title, summary, open, onToggle, children }) => {
  const bodyId = useId();
  return (
    <div className={`acc${open ? " is-open" : ""}`} data-acc={id}>
      <h3 className="acc-h">
        <button type="button" className="acc-head" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(id)}>
          <span className="acc-text">
            <span className="acc-title">{title}</span>
            {summary ? <span className="acc-sum">{summary}</span> : null}
          </span>
          <span className="acc-chev" aria-hidden="true">›</span>
        </button>
      </h3>
      <div className="acc-body" id={bodyId} hidden={!open}>{children}</div>
    </div>
  );
};

export default SettingsAccordion;
