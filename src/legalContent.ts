// Textes des pages légales (FR / EN). Projets rédigés d'après ce que fait réellement l'application ; à faire relire par un
// juriste avant ouverture au public. Module pur, testé dans tests/legalContent.test.mjs.
import type { LegalConfig } from "./legalConfig";

export type LegalDocId = "cgv" | "confidentialite" | "mentions-legales";
export const LEGAL_IDS: LegalDocId[] = ["mentions-legales", "confidentialite", "cgv"];

export interface LegalSection {
  h: string;
  p: string[];
}
export interface LegalDoc {
  id: LegalDocId;
  title: string;
  sections: LegalSection[];
}

type Lang = "fr" | "en";

/** Lignes d'identité : celles dont la valeur est vide ne sont pas affichées. */
function identityLines(lang: Lang, c: LegalConfig): string[] {
  const L = lang === "fr"
    ? { publisher: "Éditeur", form: "Forme juridique", address: "Adresse", reg: "Immatriculation", dir: "Directeur de la publication", mail: "Contact" }
    : { publisher: "Publisher", form: "Legal form", address: "Address", reg: "Registration", dir: "Publication director", mail: "Contact" };
  const rows: Array<[string, string]> = [
    [L.publisher, c.publisherName], [L.form, c.legalForm], [L.address, c.address],
    [L.reg, c.registration], [L.dir, c.director], [L.mail, c.contactEmail],
  ];
  return rows.filter(([, v]) => v.trim()).map(([k, v]) => `${k} : ${v}`);
}

const contact = (lang: Lang, c: LegalConfig) =>
  c.contactEmail.trim()
    ? (lang === "fr" ? `Contact : ${c.contactEmail}.` : `Contact: ${c.contactEmail}.`)
    : (lang === "fr" ? "Contact : via le formulaire « Une idée, un bug ? » de l'application (écran Plus)." : "Contact: through the “An idea, a bug?” form in the app (More screen).");

export function legalDoc(id: LegalDocId, lang: Lang, c: LegalConfig): LegalDoc {
  return lang === "fr" ? frDoc(id, c) : enDoc(id, c);
}

function frDoc(id: LegalDocId, c: LegalConfig): LegalDoc {
  const mail = contact("fr", c);
  const vat = c.vatNote.trim() ? ` ${c.vatNote.trim()}` : "";
  if (id === "mentions-legales") {
    return {
      id, title: "Mentions légales",
      sections: [
        { h: "Éditeur du service", p: identityLines("fr", c) },
        { h: "Hébergement", p: [
          "Application et fonctions serveur : Netlify, Inc. (États-Unis).",
          "Base de données et authentification : Supabase Inc.",
          "Paiement des abonnements : Stripe (Stripe Payments Europe, Ltd., Irlande, pour les clients de l'Union européenne).",
        ] },
        { h: "Propriété intellectuelle", p: [
          "Le nom, l'interface et le code de Money Jars appartiennent à l'éditeur. La méthode des 6 jarres est une création de T. Harv Eker, auteur de « Secrets of the Millionaire Mind » ; Money Jars est un outil indépendant qui s'en inspire.",
        ] },
        { h: "Nature du service", p: [
          "Money Jars est un outil d'organisation du budget personnel. Il ne fournit aucun conseil financier, fiscal, juridique ni en investissement.",
        ] },
        { h: "Contact", p: [mail] },
      ],
    };
  }
  if (id === "confidentialite") {
    return {
      id, title: "Politique de confidentialité",
      sections: [
        { h: "Responsable du traitement", p: [...identityLines("fr", c), mail] },
        { h: "Les données que nous traitons", p: [
          "Votre compte : adresse e-mail et mot de passe (conservé uniquement sous forme chiffrée par le service d'authentification).",
          "Les données que vous saisissez ou importez : dépenses, revenus, virements entre comptes, transferts entre jarres, étiquettes, comptes, règles et réglages.",
          "Votre abonnement : statut, dates et identifiant client Stripe. Nous ne voyons ni ne stockons jamais votre numéro de carte, qui reste chez Stripe.",
          "Vos messages envoyés via le formulaire de suggestions.",
          "Si vous activez les alertes : l'identifiant de notification de votre appareil.",
          "Sur votre appareil : votre session et vos préférences (langue, thème, filtres) sont mémorisées localement. Ce sont des données strictement nécessaires au fonctionnement ; aucun traceur publicitaire ni outil de mesure d'audience n'est utilisé, donc aucun bandeau de consentement n'est nécessaire.",
        ] },
        { h: "Pourquoi et sur quelle base", p: [
          "Fournir le service que vous avez demandé (exécution du contrat) : tenir vos comptes, calculer vos analyses, gérer votre abonnement et votre facturation.",
          "Sécuriser le service et répondre à vos messages (intérêt légitime).",
          "Respecter nos obligations légales, notamment comptables et fiscales pour la facturation.",
        ] },
        { h: "Qui reçoit vos données", p: [
          "Supabase : base de données et authentification. Netlify : hébergement de l'application et des fonctions serveur. Stripe : paiement des abonnements. Resend : envoi à l'éditeur d'un e-mail contenant le texte de chacune de vos suggestions.",
          "Saisie vocale (facultative) : la reconnaissance de la voix est faite par votre navigateur ou votre système (Apple, Google, selon votre appareil), selon leurs propres règles. Le texte dicté est ensuite envoyé au service d'intelligence artificielle Gemini de Google pour être transformé en dépense. Si vous ne voulez pas cela, n'utilisez pas la saisie vocale.",
          "Taux de change et cours des cryptos : des services publics (Frankfurter, CoinGecko) reçoivent la devise et la date demandées, et l'adresse IP de la requête, jamais vos données financières.",
          "L'import de relevés (PDF, CSV, Excel, OFX, QIF) est effectué par l'application ; il n'utilise aucun service d'intelligence artificielle et ne se connecte pas à votre banque.",
          "Nous ne vendons pas vos données et ne les utilisons pas pour de la publicité.",
        ] },
        { h: "Transferts hors de l'Union européenne", p: [
          "Certains de ces prestataires sont établis aux États-Unis ou y traitent des données. Ces transferts reposent sur les garanties prévues par le RGPD (décision d'adéquation ou clauses contractuelles types) proposées par ces prestataires.",
        ] },
        { h: "Combien de temps", p: [
          "Vos données sont conservées tant que votre compte existe. La suppression du compte (Réglages > Compte) efface définitivement toutes vos données financières, vos réglages et votre accès.",
          "Vos suggestions peuvent être conservées sans lien avec votre identité. Stripe conserve les données de facturation pendant la durée imposée par la loi.",
        ] },
        { h: "Vos droits", p: [
          "Vous pouvez accéder à vos données, les rectifier, les effacer, les récupérer dans un format structuré, vous opposer à un traitement ou en demander la limitation.",
          "Directement dans l'application : Réglages > Compte permet de télécharger toutes vos données (JSON, CSV) et de supprimer votre compte.",
          `Pour toute autre demande : ${mail.replace(/^Contact : /, "")} Vous pouvez aussi saisir la CNIL (cnil.fr) en cas de difficulté.`,
        ] },
        { h: "Sécurité", p: [
          "Les échanges sont chiffrés (HTTPS). Chaque utilisateur n'accède qu'à ses propres données : cette règle est appliquée au niveau de la base de données, pas seulement dans l'application.",
        ] },
        { h: "Mises à jour", p: [`Dernière mise à jour : ${c.updated}. Nous indiquerons ici toute modification importante.`] },
      ],
    };
  }
  return {
    id, title: "Conditions générales d'utilisation et de vente",
    sections: [
      { h: "1. Objet", p: [
        "Money Jars est une application web (installable sur téléphone) d'organisation du budget personnel selon la méthode des 6 jarres. Ces conditions encadrent son utilisation et la vente de l'abonnement qui y donne accès.",
      ] },
      { h: "2. Compte et essai gratuit", p: [
        "Pour utiliser le service, vous créez un compte avec une adresse e-mail valide. Vous bénéficiez de 14 jours d'essai gratuit, sans carte bancaire. À l'issue de l'essai, l'accès à l'application est soumis à la souscription d'un abonnement.",
      ] },
      { h: "3. Prix et paiement", p: [
        `L'abonnement coûte 7,90 € par mois ou 69 € par an${vat}. Le paiement est traité par Stripe ; nous ne conservons pas vos données de carte.`,
        "L'abonnement est reconduit automatiquement à chaque période (mensuelle ou annuelle) jusqu'à sa résiliation. Tout changement de prix s'applique à la période suivante, après information préalable.",
      ] },
      { h: "4. Résiliation", p: [
        "Vous pouvez résilier à tout moment depuis l'application : Réglages > Compte > Gérer mon abonnement (portail sécurisé de Stripe). La résiliation prend effet à la fin de la période déjà payée, que vous pouvez utiliser jusqu'au bout.",
        "Si vous supprimez votre compte alors que votre abonnement est actif, vous pouvez demander sa résiliation immédiate au même moment : il prend alors fin tout de suite, sans remboursement de la période en cours.",
      ] },
      { h: "5. Droit de rétractation", p: [
        "Si vous agissez en tant que consommateur, vous disposez de 14 jours à compter de la souscription pour vous rétracter, sans motif, en nous écrivant (voir Contact).",
        "Si vous avez demandé que le service commence pendant ce délai, vous devrez payer la part correspondant à l'utilisation déjà faite jusqu'à votre demande de rétractation.",
      ] },
      { h: "6. Vos engagements", p: [
        "Vous restez responsable des informations que vous saisissez ou importez, et de la confidentialité de votre mot de passe. Vous vous engagez à ne pas perturber le service ni chercher à accéder aux données d'autres utilisateurs.",
      ] },
      { h: "7. Responsabilité", p: [
        "Money Jars est un outil d'organisation. Ses calculs (soldes, projections, autonomie, détection d'abonnements…) sont indicatifs et dépendent des données que vous fournissez. Ils ne constituent pas un conseil financier, fiscal ou en investissement.",
        "Nous mettons tout en œuvre pour que le service soit disponible et fiable, sans pouvoir garantir l'absence d'interruption ou d'erreur. Nous vous recommandons de télécharger régulièrement vos données (Réglages > Compte). Notre responsabilité ne couvre que les dommages directs, dans les limites permises par la loi, et ne limite pas les droits que la loi vous reconnaît en tant que consommateur.",
      ] },
      { h: "8. Données personnelles", p: ["Le traitement de vos données est décrit dans la politique de confidentialité."] },
      { h: "9. Évolution des conditions", p: [
        "Nous pouvons modifier ces conditions. Les changements importants vous seront annoncés avant leur application ; en cas de désaccord, vous pouvez résilier.",
      ] },
      { h: "10. Droit applicable et litiges", p: [
        "Ces conditions sont soumises au droit français. En cas de litige, vous pouvez d'abord nous contacter pour trouver une solution amiable.",
        c.mediator.trim()
          ? `Si vous êtes consommateur, vous pouvez recourir gratuitement au médiateur de la consommation : ${c.mediator.trim()}.`
          : "Si vous êtes consommateur, vous pouvez recourir gratuitement à un médiateur de la consommation.",
      ] },
      { h: "Contact", p: [mail, `Dernière mise à jour : ${c.updated}.`] },
    ],
  };
}

function enDoc(id: LegalDocId, c: LegalConfig): LegalDoc {
  const mail = contact("en", c);
  const vat = c.vatNote.trim() ? ` ${c.vatNote.trim()}` : "";
  if (id === "mentions-legales") {
    return {
      id, title: "Legal notice",
      sections: [
        { h: "Publisher", p: identityLines("en", c) },
        { h: "Hosting", p: [
          "Application and server functions: Netlify, Inc. (United States).",
          "Database and authentication: Supabase Inc.",
          "Subscription payments: Stripe (Stripe Payments Europe, Ltd., Ireland, for customers in the European Union).",
        ] },
        { h: "Intellectual property", p: [
          "The name, interface and code of Money Jars belong to the publisher. The 6-jar method is a creation of T. Harv Eker, author of “Secrets of the Millionaire Mind”; Money Jars is an independent tool inspired by it.",
        ] },
        { h: "Nature of the service", p: [
          "Money Jars is a personal budgeting tool. It does not provide financial, tax, legal or investment advice.",
        ] },
        { h: "Contact", p: [mail] },
      ],
    };
  }
  if (id === "confidentialite") {
    return {
      id, title: "Privacy policy",
      sections: [
        { h: "Data controller", p: [...identityLines("en", c), mail] },
        { h: "Data we process", p: [
          "Your account: email address and password (stored only in encrypted form by the authentication service).",
          "What you enter or import: expenses, income, transfers between accounts and between jars, tags, accounts, rules and settings.",
          "Your subscription: status, dates and Stripe customer identifier. We never see or store your card number, which stays with Stripe.",
          "Messages you send through the suggestions form.",
          "If you turn on alerts: your device's notification identifier.",
          "On your device: your session and preferences (language, theme, filters) are stored locally. They are strictly necessary for the service to work; no advertising tracker or audience-measurement tool is used, so no consent banner is needed.",
        ] },
        { h: "Why and on what basis", p: [
          "To provide the service you asked for (performance of the contract): keeping your accounts, computing your analyses, managing your subscription and billing.",
          "To secure the service and answer your messages (legitimate interest).",
          "To meet our legal obligations, notably accounting and tax rules for invoicing.",
        ] },
        { h: "Who receives your data", p: [
          "Supabase: database and authentication. Netlify: hosting of the application and server functions. Stripe: subscription payments. Resend: sending the publisher an email containing the text of each suggestion you submit.",
          "Voice entry (optional): speech recognition is done by your browser or operating system (Apple, Google, depending on your device) under their own rules. The dictated text is then sent to Google's Gemini AI service to be turned into an expense. If you do not want this, do not use voice entry.",
          "Exchange rates and crypto prices: public services (Frankfurter, CoinGecko) receive the currency and date requested, and the IP address of the request, never your financial data.",
          "Statement import (PDF, CSV, Excel, OFX, QIF) is performed by the application; it uses no AI service and does not connect to your bank.",
          "We do not sell your data or use it for advertising.",
        ] },
        { h: "Transfers outside the European Union", p: [
          "Some of these providers are based in, or process data in, the United States. These transfers rely on the safeguards provided by the GDPR (adequacy decision or standard contractual clauses) offered by those providers.",
        ] },
        { h: "How long", p: [
          "Your data is kept as long as your account exists. Deleting your account (Settings > Account) permanently erases all your financial data, settings and access.",
          "Your suggestions may be kept without any link to your identity. Stripe keeps billing records for the period required by law.",
        ] },
        { h: "Your rights", p: [
          "You may access, correct, erase and export your data in a structured format, object to a processing or ask for it to be restricted.",
          "Directly in the app: Settings > Account lets you download all your data (JSON, CSV) and delete your account.",
          `For any other request: ${mail.replace(/^Contact: /, "")} You may also complain to your data-protection authority (in France, the CNIL, cnil.fr).`,
        ] },
        { h: "Security", p: [
          "Communications are encrypted (HTTPS). Each user can only access their own data: this rule is enforced at the database level, not only in the application.",
        ] },
        { h: "Updates", p: [`Last updated: ${c.updated}. Any important change will be announced here.`] },
      ],
    };
  }
  return {
    id, title: "Terms of use and sale",
    sections: [
      { h: "1. Purpose", p: [
        "Money Jars is a web application (installable on a phone) for personal budgeting using the 6-jar method. These terms govern its use and the sale of the subscription that gives access to it.",
      ] },
      { h: "2. Account and free trial", p: [
        "To use the service you create an account with a valid email address. You get a 14-day free trial, with no bank card. After the trial, access to the application requires a subscription.",
      ] },
      { h: "3. Price and payment", p: [
        `The subscription costs €7.90 per month or €69 per year${vat}. Payment is processed by Stripe; we do not keep your card details.`,
        "The subscription renews automatically each period (monthly or yearly) until cancelled. Any price change applies to the next period, after prior notice.",
      ] },
      { h: "4. Cancellation", p: [
        "You can cancel at any time from the app: Settings > Account > Manage my subscription (Stripe's secure portal). Cancellation takes effect at the end of the period already paid, which you can use to the end.",
        "If you delete your account while your subscription is active, you can ask for it to be cancelled immediately at the same time: it then ends right away, with no refund for the current period.",
      ] },
      { h: "5. Right of withdrawal", p: [
        "If you act as a consumer, you have 14 days from subscribing to withdraw without giving a reason, by writing to us (see Contact).",
        "If you asked for the service to start during this period, you will pay the share corresponding to the use already made until your withdrawal request.",
      ] },
      { h: "6. Your commitments", p: [
        "You remain responsible for the information you enter or import and for the confidentiality of your password. You agree not to disrupt the service or try to access other users' data.",
      ] },
      { h: "7. Liability", p: [
        "Money Jars is an organising tool. Its calculations (balances, projections, runway, subscription detection…) are indicative and depend on the data you provide. They are not financial, tax or investment advice.",
        "We do our best to keep the service available and reliable, without being able to guarantee the absence of interruptions or errors. We recommend downloading your data regularly (Settings > Account). Our liability covers direct damages only, within the limits permitted by law, and does not limit your statutory consumer rights.",
      ] },
      { h: "8. Personal data", p: ["How your data is processed is described in the privacy policy."] },
      { h: "9. Changes to these terms", p: [
        "We may change these terms. Important changes will be announced before they apply; if you disagree, you may cancel.",
      ] },
      { h: "10. Governing law and disputes", p: [
        "These terms are governed by French law. In case of a dispute, please contact us first to find an amicable solution.",
        c.mediator.trim()
          ? `If you are a consumer, you may use a consumer mediator free of charge: ${c.mediator.trim()}.`
          : "If you are a consumer, you may use a consumer mediator free of charge.",
      ] },
      { h: "Contact", p: [mail, `Last updated: ${c.updated}.`] },
    ],
  };
}
