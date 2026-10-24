// ── COLLECTEUR TEAMTAILOR (crawl direct de l'ATS) ────────────────────────────
// Le troisième collecteur de cette famille, après Greenhouse et Lever. Chaque
// board Teamtailor sert un JSON Feed public à `{board}.teamtailor.com/jobs.json`,
// sans clé ni quota, dont chaque entrée porte un `_jobposting` en
// `schema.org/JobPosting`.
//
// POURQUOI TEAMTAILOR APRÈS LEVER, et le critère a changé. Lever a rendu
// 331 offres françaises mais ZÉRO entreprise qu'emploia ne servait pas déjà :
// il a épaissi la liste sans l'élargir. Teamtailor est nordique et vend en
// Europe continentale, donc ses clients sont rarement ceux des deux ATS
// américains que les agrégateurs republient. L'hypothèse testée n'est pas
// « plus d'offres », c'est « d'autres employeurs ».
//
// CE QUE LA SOURCE DONNE, ET CE QU'ELLE NE DONNE PAS — mesuré sur les 40
// boards vivants, 602 offres :
//   · `datePosted`      : 100 %. Toujours là, déjà en ISO.
//   · `baseSalary`      : 9,3 %. PREMIER salaire de la famille ATS — ni
//     Greenhouse ni Lever n'ont de champ de salaire. Il passe par
//     `salaireSchemaOrg`, qui écarte le mensuel et les devises étrangères.
//   · `employmentType`  : 0 %. Zéro sur 602, alors que le standard le définit.
//     Le contrat retombe sur le titre. Voir `contratTeamtailor`.
//   · `jobLocationType` : 0 %. Aucun signal de distanciel structuré, d'où la
//     lecture par motif ci-dessous — et `false` quand rien ne le dit.
//
// Et l'URL servie est souvent le PROPRE domaine de l'employeur
// (`careers.payfit.com`, `careers.akeneo.com`, `careers.ornikar.com`), pas
// celui de l'ATS : un cran de mieux que Greenhouse et Lever, qui servaient
// toujours `greenhouse.io` et `jobs.lever.co`.
import {
  contratTeamtailor, tempsTeamtailor, salaireSchemaOrg, normaliserValeur,
} from './contrat.js';

export const TEAMTAILOR_HOTE = 'teamtailor.com';

// Teamtailor ne documente pas de quota. La retenue est de la prudence, pas une
// limite connue. Les réponses sont moyennes : ~22 ko par offre, la description
// complète en HTML étant servie deux fois (`content_html` et
// `_jobposting.description` sont identiques, vérifié).
export const CONCURRENCE = 6;
export const TIMEOUT_MS = 20000;

// ── LIEUX ────────────────────────────────────────────────────────────────────
// `_jobposting.jobLocation` est un TABLEAU de `Place`, chacun avec un
// `address.addressCountry` en code ISO-2 et un `address.addressLocality`.
//
// LE TABLEAU N'EST PAS UN PIÈGE ICI, et c'est la différence avec Lever qu'il
// faut énoncer parce qu'elle décide du calcul. Chez Lever, `allLocations`
// doublait un champ `location` PRINCIPAL : une offre disait `location: Berlin`
// et listait Paris à côté, donc le tableau nommait des bureaux et non le lieu
// du poste. Chez Teamtailor il n'y a pas de principal et de secondaire :
// `jobLocation` EST le champ de lieu, et schema.org le définit comme pluriel
// pour les postes réellement ouverts à plusieurs sites. Mesuré : 81 offres sur
// 602 portent plusieurs lieux, dont 24 mêlent la France à un autre pays —
// « FR/Paris + GB/London », « FR/Paris + DK/Copenhagen + DE/Berlin ». Un
// candidat qui cherche à Paris peut postuler à ces postes-là. Une offre est
// donc française dès qu'UN de ses lieux l'est.
const PAYS_UE = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI',
  'ES', 'SE',
]);

// La liste de villes ne sert QUE de recours quand aucun code ISO n'est servi.
// Mesuré : 18 offres portent `FR` sur une commune absente de cette liste —
// Clichy, Marignane, Neuilly-sur-Seine, Wissous, Eaubonne, Gennevilliers,
// Vélizy-Villacoublay, Cesson-Sévigné. Ce sont de vraies communes françaises,
// et le code est le seul champ qui le dise. Zéro offre dans l'autre sens. Le
// code passe donc avant la liste, comme chez Lever et pour la même raison.
const VILLES_FR = new Set([
  'paris', 'lyon', 'marseille', 'toulouse', 'nice', 'nantes', 'montpellier',
  'strasbourg', 'bordeaux', 'lille', 'rennes', 'reims', 'toulon', 'grenoble',
  'dijon', 'angers', 'nimes', 'villeurbanne', 'clermont ferrand', 'le mans',
  'aix en provence', 'brest', 'tours', 'amiens', 'limoges', 'annecy', 'perpignan',
  'boulogne billancourt', 'metz', 'besancon', 'orleans', 'rouen', 'saint denis',
  'montreuil', 'caen', 'nancy', 'argenteuil', 'roubaix', 'tourcoing', 'nanterre',
  'avignon', 'poitiers', 'versailles', 'creteil', 'pau', 'la rochelle', 'calais',
  'niort', 'antibes', 'cannes', 'colmar', 'valence', 'bourges', 'quimper',
  'sophia antipolis', 'issy les moulineaux', 'levallois perret', 'saint ouen',
  'la defense', 'massy', 'cergy', 'evry', 'meudon', 'courbevoie', 'puteaux',
  'lannion', 'vannes', 'chambery', 'biarritz', 'bayonne', 'mulhouse',
  'saint etienne', 'le havre', 'clichy', 'neuilly sur seine', 'gennevilliers',
  'asnieres sur seine', 'velizy villacoublay', 'cesson sevigne', 'marignane',
]);

const MOTS_DISTANCIEL = /\b(remote|telework|teletravail|anywhere|distanciel|full remote)\b/;

export function lieuxDeLOffre(item) {
  const l = item?._jobposting?.jobLocation;
  return (Array.isArray(l) ? l : [l]).filter(Boolean);
}

const codePays = (place) => String(place?.address?.addressCountry ?? '').trim().toUpperCase();
const villeDe = (place) => String(place?.address?.addressLocality ?? '').trim();

// `jobLocationType` vaut `TELECOMMUTE` dans le standard — et il est servi ZÉRO
// fois sur 602 offres. Le seul indice restant est le texte du lieu, lu comme
// `estDistanciel` le fait chez Greenhouse. Quand rien ne le dit, `false` : ce
// n'est pas l'affirmation qu'un poste est sur site, c'est l'absence de preuve
// qu'il ne l'est pas, et c'est la valeur par défaut du champ chez les neuf
// autres collecteurs.
export function estDistanciel(item) {
  const texte = normaliserValeur(
    lieuxDeLOffre(item).map(p => `${villeDe(p)} ${p?.address?.addressRegion ?? ''}`).join(' ')
  );
  return MOTS_DISTANCIEL.test(texte);
}

// Le pays tel qu'on peut l'ÉTABLIR, et `null` quand on ne le peut pas.
//
//   1. Un code ISO `FR` sur N'IMPORTE LEQUEL des lieux → FR.
//   2. Un code de l'Union → EU ; tout autre code à deux lettres → INTL.
//   3. Sans aucun code, une ville française reconnue → FR.
//   4. Sans rien de tout cela, le distanciel s'il est écrit, sinon `null`.
//
// Mesuré : 4 offres sur 602 ne portent aucun lieu. Elles sortent `null` et
// tombent en fin de tri, au lieu d'être baptisées « INTL » ou, pire, « FR »
// parce que l'entreprise est française.
export function paysTeamtailor(item) {
  const lieux = lieuxDeLOffre(item);
  const codes = lieux.map(codePays).filter(Boolean);

  if (codes.includes('FR')) return 'FR';
  if (codes.length) {
    if (codes.some(c => PAYS_UE.has(c))) return 'EU';
    if (codes.some(c => /^[A-Z]{2}$/.test(c))) return 'INTL';
  }

  if (lieux.some(p => VILLES_FR.has(normaliserValeur(villeDe(p))))) return 'FR';
  if (estDistanciel(item)) return 'REMOTE';
  return null;
}

// Le lieu affiché : les villes, telles que l'employeur les écrit, séparées par
// une virgule. Pas le code pays — un candidat lit « Paris », pas « FR ».
export function lieuAffiche(item) {
  const villes = [...new Set(lieuxDeLOffre(item).map(villeDe).filter(Boolean))];
  return villes.length ? villes.join(', ') : 'Non précisé';
}

// ── DESCRIPTION ──────────────────────────────────────────────────────────────
// `content_html` et `_jobposting.description` portent la MÊME chaîne, vérifié
// caractère pour caractère. C'est du HTML simple, pas doublement encodé comme
// chez Greenhouse : on retire les balises et on décode les quelques entités
// qui restent.
const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };

function decoderEntites(s) {
  return String(s ?? '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (brut, code) => {
    if (ENTITES[code] !== undefined) return ENTITES[code];
    if (/^#x/i.test(code)) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (/^#/.test(code)) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return brut;
  });
}

export function texteDeContenu(item, longueur = 300) {
  const brut = item?.content_html ?? item?._jobposting?.description ?? '';
  return decoderEntites(String(brut).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, longueur);
}

// ── NORMALISATION ────────────────────────────────────────────────────────────
// La forme de sortie est celle des dix autres collecteurs, au champ près.
export function normaliserOffre(item, entree) {
  return {
    id: `tt_${entree.board}_${item?.id}`,
    title: String(item?.title ?? '').trim(),
    company: entree.company || 'Confidentiel',
    location: lieuAffiche(item),
    type: contratTeamtailor(item),
    workTime: tempsTeamtailor(item),
    // Le premier salaire de la famille ATS — et seulement quand il est en
    // euros ET annuel. `salaireSchemaOrg` écarte le reste plutôt que de le
    // convertir : un montant mensuel affiché en « k€/an » serait douze fois
    // trop bas.
    salary: salaireSchemaOrg(item?._jobposting?.baseSalary),
    description: texteDeContenu(item),
    // Souvent le propre domaine de l'employeur, pas celui de l'ATS.
    url: String(item?.url ?? ''),
    // `date_published` est déjà une chaîne ISO, servie sur 100 % des offres.
    date: item?.date_published || item?._jobposting?.datePosted || null,
    remote: estDistanciel(item),
    source: 'Teamtailor',
    logo: null,
    country: paysTeamtailor(item),
  };
}

export function offreExploitable(o) {
  return Boolean(o.title && o.url && o.id);
}

// ── COLLECTE ─────────────────────────────────────────────────────────────────
// Un board qui tombe ne fait pas tomber la collecte : chaque board est isolé,
// et son échec part au journal avec une cause du vocabulaire fermé d'
// `api/jobs.js`. Même garantie que les deux collecteurs précédents.
//
// Une précision propre à Teamtailor : chaque board est un SOUS-DOMAINE, donc
// un slug inexistant peut échouer en DNS plutôt qu'en HTTP 404. Les deux
// rendent une liste vide avec une cause nommée — `erreur_reseau` et
// `http_404` — et aucun des deux n'emporte les autres boards.
export async function collecterBoard(entree, options = {}) {
  const { journal, fetchImpl = fetch, timeout = TIMEOUT_MS } = options;
  const url = `https://${encodeURIComponent(entree.board)}.${TEAMTAILOR_HOTE}/jobs.json`;
  const echec = (cause) => {
    journal?.push({ source: `Teamtailor/${entree.board}`, raison: cause, cause });
    return [];
  };
  let res;
  try {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), timeout);
    try {
      res = await fetchImpl(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(minuteur);
    }
  } catch (e) {
    return echec(e?.name === 'AbortError' ? 'timeout' : 'erreur_reseau');
  }
  if (!res?.ok) return echec(`http_${res?.status ?? 0}`);

  let data;
  try {
    data = await res.json();
  } catch {
    return echec('reponse_illisible');
  }
  // Un JSON Feed porte ses entrées dans `items`. Un 200 sans ce tableau est
  // illisible, pas vide : les confondre ferait lire « cette entreprise ne
  // recrute pas » là où il faut lire « on n'a pas su lire ».
  if (!Array.isArray(data?.items)) return echec('reponse_illisible');

  return data.items
    .map(i => normaliserOffre(i, entree))
    .filter(offreExploitable);
}

export async function collecterTeamtailor(catalogue, options = {}) {
  const { concurrence = CONCURRENCE } = options;
  const entrees = Array.isArray(catalogue) ? catalogue : [];
  const offres = [];
  for (let i = 0; i < entrees.length; i += concurrence) {
    const lot = entrees.slice(i, i + concurrence);
    const resultats = await Promise.allSettled(lot.map(e => collecterBoard(e, options)));
    for (const [k, r] of resultats.entries()) {
      if (r.status === 'fulfilled') offres.push(...r.value);
      else options.journal?.push({ source: `Teamtailor/${lot[k].board}`, raison: String(r.reason), cause: 'inconnue' });
    }
  }
  return offres;
}
