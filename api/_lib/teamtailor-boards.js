// ── CATALOGUE TEAMTAILOR ─────────────────────────────────────────────────────
// Quelle entreprise sur quel board. Un board Teamtailor est un SOUS-DOMAINE
// que l'employeur choisit : il ne se déduit pas du nom de l'entreprise, il se
// constate. Les 383 candidats plausibles sondés par
// `scripts/teamtailor/verifier-boards.mjs` ont rendu 40 boards vivants, dont
// 19 portaient au moins une offre localisée en France — les seuls inscrits.
//
// `offresFR` est un RELEVÉ, pas une promesse : le nombre d'offres françaises
// constatées le jour du sondage. Il sert à voir un board se vider, pas à
// garantir ce qu'il rendra.
//
// Les 343 autres candidats n'ont rien rendu : 342 en HTTP 404 et un seul en
// échec réseau — `intercom`, dont le sous-domaine ne RÉSOUT PAS en DNS,
// vérifié séparément. Ce n'est donc pas un faux négatif qu'un second passage
// rattraperait : c'est un board qui n'existe pas. Les 343 restent dans
// `candidats.mjs` à dessein — ce fichier est la trace de ce qui a été essayé.
//
// CE QUE CE RELEVÉ DIT DE TEAMTAILOR. La densité française est la plus forte
// des trois ATS, et de loin : 228 offres FR sur 602, soit 37,9 %, contre
// 17,4 % chez Lever et 5,2 % chez Greenhouse. Les entreprises sont plus
// petites — 602 offres pour 40 boards, là où Greenhouse en portait 6 484 pour
// 63 — mais ce sont des employeurs français que les deux ATS américains
// n'avaient pas : Skello, Hublo, Foodles, Spiko, Ornikar, Innovorder, Memo
// Bank, Leocare.
//
// Et une seule des neuf scale-ups que ni Greenhouse ni Lever n'avaient y
// figure : PayFit. Alan, Pennylane, Spendesk, Ledger, Back Market, Leboncoin,
// Mistral et OVHcloud répondent 404 sur les trois ATS. Elles sont ailleurs —
// Welcome to the Jungle, Workday, ou un site carrière maison.
export const RELEVE = '2026-10-23';

export const BOARDS = [
  { board: 'skello',            company: 'Skello',                offresFR: 31 },
  { board: 'hublo',             company: 'Hublo',                 offresFR: 27 },
  { board: 'sunday',            company: 'sunday',                offresFR: 25 },
  { board: 'deezer',            company: 'Deezer',                offresFR: 24 },
  { board: 'foodles',           company: 'Foodles',               offresFR: 20 },
  { board: 'spiko',             company: 'Spiko',                 offresFR: 18 },
  { board: 'ornikar',           company: 'Ornikar',               offresFR: 16 },
  { board: 'shine',             company: 'Shine',                 offresFR: 15 },
  { board: 'prophesee',         company: 'Prophesee',             offresFR: 11 },
  { board: 'innovorder',        company: 'Innovorder',            offresFR: 10 },
  { board: 'meilisearch',       company: 'MeiliSearch',           offresFR: 9 },
  { board: 'seedtag',           company: 'Seedtag',               offresFR: 7 },
  { board: 'payfit',            company: 'PayFit',                offresFR: 3 },
  { board: 'sweep',             company: 'SWEEP',                 offresFR: 3 },
  { board: 'memobank',          company: 'Memo Bank',             offresFR: 3 },
  { board: 'akeneo',            company: 'Akeneo',                offresFR: 2 },
  { board: 'leocare',           company: 'Leocare',               offresFR: 2 },
  { board: 'welcometothejungle',company: 'Welcome to the Jungle', offresFR: 1 },
  { board: 'batch',             company: 'Batch',                 offresFR: 1 },
];
