// Identité de l'éditeur, utilisée dans les pages légales (mentions légales, confidentialité, conditions).
// À COMPLÉTER par l'éditeur : une ligne laissée vide n'est tout simplement pas affichée.
// Les textes (src/legalContent.ts) sont des PROJETS à faire relire par un juriste avant d'ouvrir le service au public.

export interface LegalConfig {
  /** Nom de l'éditeur (personne morale ou physique). */
  publisherName: string;
  /** Forme juridique, ex. « association loi 1901 », « SAS ». */
  legalForm: string;
  /** Adresse postale du siège. */
  address: string;
  /** Numéro d'identification : SIREN/SIRET, RNA… */
  registration: string;
  /** Directeur de la publication. */
  director: string;
  /** Adresse e-mail de contact (questions, exercice des droits, rétractation). */
  contactEmail: string;
  /** Précision sur la TVA, ex. « TTC » ou « TVA non applicable ». Ajoutée après les prix. */
  vatNote: string;
  /** Médiateur de la consommation (nom et adresse du site), obligatoire pour vendre à des consommateurs. */
  mediator: string;
  /** Date de dernière mise à jour des textes, AAAA-MM-JJ. */
  updated: string;
}

export const LEGAL: LegalConfig = {
  publisherName: "Effivital",
  legalForm: "",
  address: "",
  registration: "",
  director: "",
  contactEmail: "",
  vatNote: "",
  mediator: "",
  updated: "2026-11-09",
};
