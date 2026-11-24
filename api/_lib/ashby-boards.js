// ── CATALOGUE ASHBY ──────────────────────────────────────────────────────────
// Quelle entreprise sur quel board. Un slug Ashby est choisi par l'employeur :
// il ne se déduit pas du nom de l'entreprise, il se constate.
//
// LE CRITÈRE D'INSCRIPTION EST LE CONTENU, PAS LE CODE HTTP. C'est la règle
// que le relevé Teamtailor a ramenée : SmartRecruiters répond HTTP 200 à tout,
// y compris au slug `zzz-entreprise-inexistante-xyz`, et un sondage sur le
// code y aurait inscrit huit entreprises fantômes. Ashby se comporte bien —
// 404 pour un slug inconnu, 200 avec `{"jobs":[]}` pour un board réel mais
// vide — mais le classement se fait quand même sur ce que le board PORTE.
//
// Les 428 candidats sondés par `scripts/ashby/verifier-boards.mjs` ont donné :
//   · 130 lisibles, dont 116 portant au moins une offre
//   ·  14 RÉELS MAIS VIDES — spendesk, comet, alma, nickel, deel, stytch,
//     launchdarkly, axiom, langfuse, figma, vercel, mercury, raycast, bolt.
//     Ils existent et ne recrutent pas aujourd'hui. Non inscrits : le critère
//     est de porter une offre française, pas d'exister.
//   · 298 en HTTP 404, et AUCUN timeout ni erreur réseau — donc pas de faux
//     négatif qu'un second passage rattraperait.
//   ·  33 portant au moins une offre française : les seuls inscrits ici.
//
// CE QUE CE RELEVÉ DIT D'ASHBY. 603 offres françaises, plus que chacun des
// trois ATS précédents pris séparément (336 Greenhouse, 331 Lever, 228
// Teamtailor) — et surtout, il porte QUATRE des huit scale-ups qu'aucun des
// trois n'avait : Pennylane (153 offres FR), Alan (69), Back Market (29),
// Ledger (13). À elles quatre, 264 offres françaises d'employeurs qu'emploia
// ne servait pas.
//
// Leboncoin, Mistral et OVHcloud répondent 404 ici comme ailleurs : elles ne
// sont sur aucun des six ATS sondés. Spendesk a un board Ashby, vivant et
// vide.
//
// `offresFR` est un RELEVÉ, pas une promesse : le nombre constaté le jour du
// sondage. Il sert à voir un board se vider, pas à garantir ce qu'il rendra.
export const RELEVE = '2026-10-26';

export const BOARDS = [
  { board: 'pennylane',   company: 'Pennylane',    offresFR: 153 },
  { board: 'voodoo',      company: 'Voodoo',       offresFR: 80 },
  { board: 'alan',        company: 'Alan',         offresFR: 69 },
  { board: 'doctolib',    company: 'Doctolib',     offresFR: 66 },
  { board: 'joko',        company: 'Joko',         offresFR: 42 },
  { board: 'backmarket',  company: 'Back Market',  offresFR: 29 },
  { board: 'qonto',       company: 'Qonto',        offresFR: 26 },
  { board: 'cohere',      company: 'Cohere',       offresFR: 16 },
  { board: 'elevenlabs',  company: 'ElevenLabs',   offresFR: 14 },
  { board: 'ledger',      company: 'Ledger',       offresFR: 13 },
  { board: 'seyna',       company: 'Seyna',        offresFR: 13 },
  { board: 'photoroom',   company: 'PhotoRoom',    offresFR: 10 },
  { board: 'openai',      company: 'OpenAI',       offresFR: 9 },
  { board: 'ashby',       company: 'Ashby',        offresFR: 8 },
  { board: 'notion',      company: 'Notion',       offresFR: 7 },
  { board: 'lifen',       company: 'Lifen',        offresFR: 6 },
  { board: 'finary',      company: 'Finary',       offresFR: 6 },
  { board: 'morpho',      company: 'Morpho',       offresFR: 5 },
  { board: 'owkin',       company: 'Owkin',        offresFR: 4 },
  { board: 'harvey',      company: 'Harvey',       offresFR: 4 },
  { board: 'gorgias',     company: 'Gorgias',      offresFR: 3 },
  { board: 'sierra',      company: 'Sierra',       offresFR: 3 },
  { board: 'synthesia',   company: 'Synthesia',    offresFR: 3 },
  { board: 'sorare',      company: 'Sorare',       offresFR: 2 },
  { board: 'nabla',       company: 'Nabla',        offresFR: 2 },
  { board: 'bitstack',    company: 'Bitstack',     offresFR: 2 },
  { board: 'temporal',    company: 'Temporal',     offresFR: 2 },
  { board: 'ankorstore',  company: 'Ankorstore',   offresFR: 1 },
  { board: 'upflow',      company: 'Upflow',       offresFR: 1 },
  { board: 'choco',       company: 'Choco',        offresFR: 1 },
  { board: 'akur8',       company: 'Akur8',        offresFR: 1 },
  { board: 'decagon',     company: 'Decagon',      offresFR: 1 },
  { board: 'mollie',      company: 'Mollie',       offresFR: 1 },
];
