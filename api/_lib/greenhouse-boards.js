// ── CATALOGUE GREENHOUSE ─────────────────────────────────────────────────────
// Quelle entreprise sur quel board. Un board id Greenhouse est un slug que
// l'employeur choisit : il ne se déduit pas du nom de l'entreprise, il se
// constate. Les 319 candidats plausibles sondés par
// `scripts/greenhouse/verifier-boards.mjs` ont rendu 63 boards vivants, dont
// 28 portaient au moins une offre localisée en France — les seuls inscrits
// ici.
//
// `offresFR` est un RELEVÉ, pas une promesse : le nombre d'offres françaises
// constatées le jour du sondage. Il sert à voir un board se vider, pas à
// garantir ce qu'il rendra. Même règle que partout ailleurs dans ce dépôt :
// ce qu'on mesure, on l'écrit ; ce qu'on ne mesure pas n'est pas inventé.
//
// Les 256 candidats restants ont répondu 404. Ils ne sont pas inscrits, et
// c'est le point : un slug deviné qui renvoie 404 inscrirait au catalogue une
// entreprise qu'on ne collectera jamais, et le silence de sa collecte se
// lirait comme « cette entreprise ne recrute pas ».
export const RELEVE = '2026-10-19';

export const BOARDS = [
  { board: 'doctolib',      company: 'Doctolib',          offresFR: 76 },
  { board: 'datadog',       company: 'Datadog',           offresFR: 50 },
  { board: 'sumup',         company: 'SumUp',             offresFR: 37 },
  { board: 'mirakl',        company: 'Mirakl',            offresFR: 27 },
  { board: 'databricks',    company: 'Databricks',        offresFR: 19 },
  { board: 'algolia',       company: 'Algolia',           offresFR: 19 },
  { board: 'deliveroo',     company: 'Deliveroo',         offresFR: 14 },
  { board: 'ivalua',        company: 'Ivalua',            offresFR: 12 },
  { board: 'shifttechnology',company: 'Shift Technology',  offresFR: 11 },
  { board: 'mongodb',       company: 'MongoDB',           offresFR: 10 },
  { board: 'gitlab',        company: 'GitLab',            offresFR: 7 },
  { board: 'braze',         company: 'Braze',             offresFR: 7 },
  { board: 'anthropic',     company: 'Anthropic',         offresFR: 5 },
  { board: 'platformsh',    company: 'Platform.sh',       offresFR: 5 },
  { board: 'stripe',        company: 'Stripe',            offresFR: 4 },
  { board: 'airbnb',        company: 'Airbnb',            offresFR: 4 },
  { board: 'figma',         company: 'Figma',             offresFR: 4 },
  { board: 'dataiku',       company: 'Dataiku',           offresFR: 4 },
  { board: 'adyen',         company: 'Adyen',             offresFR: 4 },
  { board: 'n26',           company: 'N26',               offresFR: 3 },
  { board: 'zscaler',       company: 'Zscaler',           offresFR: 2 },
  { board: 'getyourguide',  company: 'GetYourGuide',      offresFR: 2 },
  { board: 'okta',          company: 'Okta',              offresFR: 2 },
  { board: 'klaxoon',       company: 'Klaxoon',           offresFR: 2 },
  { board: 'elastic',       company: 'Elastic',           offresFR: 1 },
  { board: 'onetrust',      company: 'OneTrust',          offresFR: 1 },
  { board: 'fastly',        company: 'Fastly',            offresFR: 1 },
  { board: 'flowdesk',      company: 'Flowdesk',          offresFR: 1 },
];
