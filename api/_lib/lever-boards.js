// ── CATALOGUE LEVER ──────────────────────────────────────────────────────────
// Quelle entreprise sur quel board. Un board id Lever est un slug que
// l'employeur choisit : il ne se déduit pas du nom de l'entreprise, il se
// constate. Les 401 candidats plausibles sondés par
// `scripts/lever/verifier-boards.mjs` ont rendu 31 boards vivants, dont 17
// portaient au moins une offre localisée en France — les seuls inscrits ici.
//
// `offresFR` est un RELEVÉ, pas une promesse : le nombre d'offres françaises
// constatées le jour du sondage. Il sert à voir un board se vider, pas à
// garantir ce qu'il rendra. Même règle que partout ailleurs dans ce dépôt :
// ce qu'on mesure, on l'écrit ; ce qu'on ne mesure pas n'est pas inventé.
//
// Les 370 candidats restants ont répondu 404, et AUCUN n'a expiré ni échoué en
// réseau — le relevé ne porte donc pas de faux négatif qu'un second passage
// viendrait rattraper. Ils ne sont pas inscrits, et c'est le point : un slug
// deviné qui renvoie 404 inscrirait au catalogue une entreprise qu'on ne
// collectera jamais, et le silence de sa collecte se lirait comme « cette
// entreprise ne recrute pas ».
//
// CE QUE CE RELEVÉ DIT DE LEVER FACE À GREENHOUSE. Le taux de boards vivants
// est bien plus faible — 7,7 % des candidats contre 19,7 % chez Greenhouse —
// mais la DENSITÉ française est trois fois supérieure : 358 offres FR sur
// 2 044, soit 17,5 %, là où Greenhouse plafonnait à 5,2 %. Lever porte moins
// d'entreprises et beaucoup plus de France, ce qui est exactement le gisement
// que le relevé Greenhouse avait laissé ouvert.
//
// `mistral` répond 200 avec zéro offre : vivant, mais rien à collecter. Il
// n'est pas inscrit, parce que le critère est de porter au moins une offre
// française au relevé — pas d'exister.
export const RELEVE = '2026-10-21';

export const BOARDS = [
  { board: 'veepee',             company: 'Veepee',               offresFR: 77 },
  { board: 'pigment',            company: 'Pigment',              offresFR: 46 },
  { board: 'verkor',             company: 'Verkor',               offresFR: 44 },
  { board: 'qonto',              company: 'Qonto',                offresFR: 27 },
  { board: 'scaleway',           company: 'Scaleway',             offresFR: 27 },
  { board: 'veeva',              company: 'Veeva Systems',        offresFR: 21 },
  { board: '360learning',        company: '360Learning',          offresFR: 17 },
  { board: 'aircall',            company: 'Aircall',              offresFR: 16 },
  { board: 'swile',              company: 'Swile',                offresFR: 15 },
  { board: 'malt',               company: 'Malt',                 offresFR: 15 },
  { board: 'brevo',              company: 'Brevo',                offresFR: 14 },
  { board: 'vestiairecollective',company: 'Vestiaire Collective', offresFR: 13 },
  { board: 'agicap',             company: 'Agicap',               offresFR: 8 },
  { board: 'blablacar',          company: 'BlaBlaCar',            offresFR: 8 },
  { board: 'younited',           company: 'Younited',             offresFR: 7 },
  { board: 'palantir',           company: 'Palantir',             offresFR: 2 },
  { board: 'spotify',            company: 'Spotify',              offresFR: 1 },
];
