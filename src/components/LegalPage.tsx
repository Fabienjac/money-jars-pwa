// Pages légales : mentions légales, confidentialité, conditions générales. Atteintes par l'adresse #mentions-legales,
// #confidentialite ou #cgv, avant comme après la connexion (lien dans le pied de la page de vente et dans « Plus »).
// Textes : src/legalContent.ts ; identité de l'éditeur : src/legalConfig.ts.
import React, { useEffect } from "react";
import { LEGAL } from "../legalConfig";
import { LEGAL_IDS, legalDoc, type LegalDocId } from "../legalContent";
import { t, useLang } from "../i18n";

/** Page légale demandée par l'adresse (#cgv…), null sinon. */
export function readLegalHash(): LegalDocId | null {
  try {
    const h = window.location.hash.replace(/^#/, "");
    return (LEGAL_IDS as string[]).includes(h) ? (h as LegalDocId) : null;
  } catch {
    return null;
  }
}

export function legalLabel(id: LegalDocId): string {
  return id === "cgv" ? t("lp.legalTerms") : id === "confidentialite" ? t("lp.legalPrivacy") : t("lp.legalNotices");
}

interface Props {
  id: LegalDocId;
}

const LegalPage: React.FC<Props> = ({ id }) => {
  const lang = useLang();
  const doc = legalDoc(id, lang, LEGAL);

  useEffect(() => {
    window.scrollTo(0, 0);
    const prev = document.title;
    document.title = `${doc.title} · Money Jars`;
    return () => { document.title = prev; };
  }, [id, doc.title]);

  const back = () => {
    // On quitte la page légale : on retire l'ancre sans recharger l'application
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  return (
    <main className="legal-page">
      <div className="legal-inner">
        <button type="button" className="legal-back" onClick={back}>← {t("legal.back")}</button>
        <h1>{doc.title}</h1>
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((para, i) => <p key={i}>{para}</p>)}
          </section>
        ))}
        <nav className="legal-others" aria-label={t("legal.others")}>
          {LEGAL_IDS.filter((x) => x !== id).map((x) => (
            <a key={x} href={`#${x}`}>{legalLabel(x)}</a>
          ))}
        </nav>
      </div>
    </main>
  );
};

export default LegalPage;
