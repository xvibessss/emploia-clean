// ── CATALOGUE SMARTRECRUITERS ────────────────────────────────────────────────
// Quelle entreprise sous quel identifiant. Les 402 candidats plausibles sondés
// par `scripts/smartrecruiters/verifier-boards.mjs` ont rendu 32 entreprises
// qui servent des offres, dont 25 en France — les seules inscrites.
//
// `offresFR` est un RELEVÉ, pas une promesse : le nombre d'offres françaises
// constatées le jour du sondage, filtre serveur `country=fr` recompté offre
// par offre (0 désaccord sur 3 407). Il sert à voir une entreprise se vider.
//
// Les 370 autres candidats rendent `totalFound: 0`, et c'est le piège propre à
// cet ATS : un identifiant INCONNU répond HTTP 200, pas 404. « N'existe pas »
// et « ne recrute pas » y sont indiscernables par le statut. Une entreprise
// n'entre donc ici que si elle a SERVI au moins une offre française, sous le
// nom attendu dans `company.name`.
//
// Sept entreprises servent des offres mais aucune en France — Domino's
// (24 737), Securitas, Equinox, Sodexo, Colliers, Thales, Vinci Construction.
// Elles ne sont pas inscrites : le collecteur ne garde que la France, et un
// board qui ne rend rien de servable coûterait une requête par nuit pour rien.
//
// CE QUE CE RELEVÉ DIT DE SMARTRECRUITERS. C'est le premier ATS de la famille
// à porter des MÉTIERS que les trois précédents n'avaient pas : réceptionniste,
// chef de partie, chef de rang, barman, valet de chambre (Accor, Barrière),
// vendeur, conseiller de vente, préparateur de commandes (Kiabi, Conforama,
// Boulanger, Primark). C'est l'hypothèse qui motivait ce relevé — « d'autres
// métiers », après « d'autres employeurs » pour Teamtailor.
//
// UN PIÈGE DE NOM, à connaître : « Boulanger » est une enseigne
// d'électroménager. Ses 144 offres sont des postes de vente et de logistique,
// pas de boulangerie. Le filtre de pertinence de `api/jobs.js` lit aussi le
// nom de l'entreprise, donc une recherche « boulanger » remontera ces offres.
export const RELEVE = '2026-11-04';

export const BOARDS = [
  { board: 'alten',              company: 'Alten',               offresFR: 762 },
  { board: 'assystem',           company: 'Assystem',            offresFR: 408 },
  { board: 'devoteam',           company: 'Devoteam',            offresFR: 327 },
  { board: 'talan',              company: 'Talan',               offresFR: 295 },
  { board: 'barriere',           company: 'Groupe Barrière',     offresFR: 277 },
  { board: 'mazars',             company: 'Forvis Mazars',       offresFR: 211 },
  { board: 'accor',              company: 'Accor',               offresFR: 199 },
  { board: 'meritis',            company: 'Meritis',             offresFR: 147 },
  { board: 'boulanger',          company: 'Boulanger',           offresFR: 144 },
  { board: 'sia',                company: 'Sia',                 offresFR: 139 },
  { board: 'conforama',          company: 'Conforama',           offresFR: 131 },
  { board: 'kiabi',              company: 'Kiabi',               offresFR: 126 },
  { board: 'ubisoft2',           company: 'Ubisoft',             offresFR: 110 },
  { board: 'primark',            company: 'Primark',             offresFR: 35 },
  { board: 'nexity',             company: 'Nexity',              offresFR: 29 },
  { board: 'boschgroup',         company: 'Bosch',               offresFR: 25 },
  { board: 'galerieslafayette',  company: 'Galeries Lafayette',  offresFR: 9 },
  { board: 'saintgobain',        company: 'Saint-Gobain',        offresFR: 9 },
  { board: 'continental',        company: 'Continental',         offresFR: 7 },
  { board: 'sixt',               company: 'Sixt',                offresFR: 5 },
  { board: 'gameloft',           company: 'Gameloft',            offresFR: 5 },
  { board: 'lvmh',               company: 'LVMH',                offresFR: 4 },
  { board: 'intermarche',        company: 'Intermarché',         offresFR: 1 },
  { board: 'darty',              company: 'Darty',               offresFR: 1 },
  { board: 'segulatechnologies', company: 'Segula Technologies', offresFR: 1 },
];
