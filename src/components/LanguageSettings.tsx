import React from "react";
import { LANGS, setLang, useLang, useT } from "../i18n";

const LanguageSettings: React.FC = () => {
  const lang = useLang();
  const t = useT();
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{t("settings.lang.title")}</h3>
      <p className="settings-section-desc">{t("settings.lang.desc")}</p>
      <div className="rsf-accounts" role="radiogroup" aria-label={t("settings.lang.label")}>
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={lang === l.code}
            className={`rsf-account${lang === l.code ? " active" : ""}`}
            onClick={() => setLang(l.code)}
          >
            {l.label}
          </button>
        ))}
      </div>
    </section>
  );
};

export default LanguageSettings;
