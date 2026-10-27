// ── COLLECTEUR ASHBY (crawl direct de l'ATS) ─────────────────────────────────
// Le quatrième collecteur de cette famille, après Greenhouse, Lever et
// Teamtailor. Ashby publie pour chaque board un endpoint JSON sans clé ni
// quota : `api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true`.
//
// POURQUOI ASHBY, ET CE N'EST PAS UNE INTUITION. Les trois relevés précédents
// ont convergé sur huit scale-ups françaises qu'aucun ATS crawlé n'avait. Le
// sondage de clôture du relevé Teamtailor les a cherchées ailleurs et en a
// trouvé quatre ici. Le relevé complet le confirme : Pennylane 153 offres
// françaises, Alan 69, Back Market 29, Ledger 13 — 264 offres d'employeurs
// qu'emploia ne servait pas, sur 603 au total.
//
// C'EST LE PLUS RICHE DES QUATRE EN DONNÉES, et donc celui qui porte le plus
// de pièges. Il a fallu en désamorcer trois, tous mesurés :
//
//   1. `isRemote` CONTREDIT `workplaceType`. Relevé : 3 590 offres portent
//      `isRemote: true`, dont 2 253 dont le `workplaceType` n'est PAS
//      « Remote » — des postes hybrides à Paris ou Madrid. Et dans
//      `api/jobs.js`, une offre `remote: true` matche TOUS les filtres de
//      lieu : ces 2 253 remonteraient sur chaque page ville, exactement le
//      « bloc fixe sur toute la surface indexée » que `filtrerPertinence` a
//      été écrit pour retirer. On lit donc `workplaceType`, jamais `isRemote`.
//
//   2. La rémunération est derrière un DRAPEAU DE CONSENTEMENT, et elle
//      mélange salaire, bonus, commission et equity. Voir `salaireAshby`
//      dans `_lib/contrat.js`.
//
//   3. Le pays et le texte du lieu se contredisent DANS LES DEUX SENS — une
//      première dans cette famille. Voir `paysAshby` ci-dessous.
import {
  contratAshby, tempsAshby, salaireAshby, normaliserValeur,
} from './contrat.js';

export const ASHBY_BASE = 'https://api.ashbyhq.com/posting-api/job-board';

// Ashby ne documente pas de quota. La retenue est de la prudence, pas une
// limite connue — et les réponses sont LOURDES : 2,2 Mo pour les 126 offres
// d'`alan`, soit ~18 ko par offre, la description étant servie deux fois
// (HTML et texte).
export const CONCURRENCE = 6;
export const TIMEOUT_MS = 30000;

// ── LIEUX ────────────────────────────────────────────────────────────────────
// Deux champs, et c'est le premier ATS de la famille où AUCUN des deux ne
// suffit seul. Mesuré sur les 33 boards du catalogue :
//
//   · 87 offres portent `addressCountry: "France"` sur un texte de lieu qui ne
//     nomme pas la France — « Aix-en-Provence », « Brest », « Annecy »,
//     « Saint-Etienne », « Nîmes », « Chambéry », « Bourg en Bresse ». De
//     vraies villes françaises, que seule la liste ne rattraperait pas.
//   · 41 offres font l'inverse : le texte dit « Paris, France; Bordeaux,
//     France; Lyon, France » et le pays vaut « European Union » ou RIEN.
//
// Chez Lever et Teamtailor, le code pays rattrapait le texte et passait donc
// devant. Ici il se trompe aussi, et dans l'autre sens. La règle est donc
// l'UNION des deux signaux : une offre est française si le texte le dit OU si
// le pays le dit. Ce n'est pas un relâchement — c'est que deux champs
// partiellement faux dans des directions opposées se complètent, là où un seul
// perdrait des offres réelles.
//
// « European Union » mérite sa ligne : ce n'est pas un pays, c'est une région,
// et Ashby l'écrit dans le champ pays. Il vaut EU et JAMAIS FR — sans quoi
// toute offre européenne deviendrait française.
const PAYS_FR = /^(france|france, metropolitan|guadeloupe|martinique|mayotte|reunion|french guiana)$/;

const NOMS_UE = new Set([
  'european union', 'germany', 'spain', 'italy', 'portugal', 'netherlands',
  'belgium', 'austria', 'poland', 'sweden', 'denmark', 'finland', 'ireland',
  'greece', 'czechia', 'czech republic', 'romania', 'hungary', 'bulgaria',
  'croatia', 'slovakia', 'slovenia', 'lithuania', 'latvia', 'estonia',
  'luxembourg', 'cyprus', 'malta',
]);

const VILLES_FR = new Set([
  'paris', 'lyon', 'marseille', 'toulouse', 'nice', 'nantes', 'montpellier',
  'strasbourg', 'bordeaux', 'lille', 'rennes', 'reims', 'toulon', 'grenoble',
  'dijon', 'angers', 'nimes', 'villeurbanne', 'clermont ferrand', 'le mans',
  'aix en provence', 'brest', 'tours', 'amiens', 'limoges', 'annecy',
  'perpignan', 'boulogne billancourt', 'metz', 'besancon', 'orleans', 'rouen',
  'saint denis', 'montreuil', 'caen', 'nancy', 'argenteuil', 'roubaix',
  'tourcoing', 'nanterre', 'avignon', 'poitiers', 'versailles', 'creteil',
  'pau', 'la rochelle', 'calais', 'niort', 'antibes', 'cannes', 'colmar',
  'valence', 'bourges', 'quimper', 'sophia antipolis', 'issy les moulineaux',
  'levallois perret', 'saint ouen', 'la defense', 'massy', 'cergy', 'evry',
  'meudon', 'courbevoie', 'puteaux', 'lannion', 'vannes', 'chambery',
  'biarritz', 'bayonne', 'mulhouse', 'saint etienne', 'le havre',
  'bourg en bresse', 'clichy', 'neuilly sur seine',
]);

const AUTRES_PAYS = /\b(usa|united states|canada|uk|united kingdom|india|brazil|japan|china|australia|singapore|israel|mexico|switzerland|norway|serbia|turkey|ukraine|morocco|tunisia|egypt|senegal|ivory coast|armenia|saudi arabia|south africa|argentina|chile|colombia|new zealand|korea|taiwan|vietnam|thailand|indonesia|philippines|malaysia|uae|emirates)\b/;

const MOTS_DISTANCIEL = /\b(remote|telework|teletravail|anywhere|distanciel)\b/;

// Le lieu principal et les lieux secondaires, dans une seule liste. Mesuré :
// une seule offre du relevé a la France UNIQUEMENT en secondaire — un poste
// « Anywhere in Belgium » ouvert aussi « Anywhere in France ». Le champ nomme
// de vrais lieux supplémentaires où le poste s'exerce, pas une liste de
// bureaux comme l'`allLocations` de Lever : on le compte donc.
export function lieuxDeLOffre(j) {
  return [
    { location: j?.location, address: j?.address },
    ...(Array.isArray(j?.secondaryLocations) ? j.secondaryLocations : []),
  ].filter(l => l?.location || l?.address);
}

const paysDe = (l) => normaliserValeur(l?.address?.postalAddress?.addressCountry);

// Le texte du lieu est MULTI-VILLES, séparé par des POINTS-VIRGULES — « Paris,
// France; Bordeaux, France; Marseille, France » — comme chez Greenhouse. Le
// découpage se fait donc sur le texte brut, avant normalisation : celle-ci
// remplace la ponctuation par des espaces et ne laisserait rien à découper.
export function segmentsDeLieu(texte) {
  return String(texte ?? '').split(';').map(s => s.trim()).filter(Boolean);
}

// Un segment est français s'il NOMME la France, ou s'il se réduit à une ville
// reconnue SANS nommer un autre pays.
//
// La seconde condition ne peut pas reprendre la règle de Greenhouse, qui
// rejetait tout segment nommant un pays de l'Union : Ashby écrit « Anywhere in
// France, Belgium, Spain », qui nomme la France ET deux autres pays et désigne
// bel et bien un poste faisable en France. La règle est donc : la France
// nommée gagne toujours ; une ville française seule ne gagne que si aucun
// autre pays n'est nommé.
function segmentEstFrancais(segment) {
  const t = normaliserValeur(segment);
  if (/\bfrance\b/.test(t)) return true;
  if (AUTRES_PAYS.test(t)) return false;
  if ([...NOMS_UE].some(p => t.includes(p))) return false;
  return t.split(/\s*,\s*/).some(part => VILLES_FR.has(part.trim()));
}

// `workplaceType` est le SEUL signal de distanciel digne de confiance : trois
// valeurs constatées, « Remote », « Hybrid », « OnSite ». `isRemote` ne dit pas
// « distanciel », il dit « pas strictement sur site » — 2 253 offres hybrides
// le portent à `true`. Les confondre inonderait toutes les pages ville.
export function estDistanciel(j) {
  if (j?.workplaceType) return j.workplaceType === 'Remote';
  // Sans `workplaceType`, le texte du lieu est tout ce qui reste — et
  // `isRemote` n'est toujours pas consulté.
  return MOTS_DISTANCIEL.test(normaliserValeur(lieuxDeLOffre(j).map(l => l?.location).join(' ')));
}

export function paysAshby(j) {
  const lieux = lieuxDeLOffre(j);

  // 1. Le TEXTE, segment par segment, sur le lieu principal comme sur les
  //    secondaires. Il rattrape les 41 offres dont le pays dit « European
  //    Union » ou rien.
  for (const l of lieux) {
    if (segmentsDeLieu(l?.location).some(segmentEstFrancais)) return 'FR';
  }

  // 2. Le PAYS déclaré. Il rattrape les 87 offres dont le texte ne nomme
  //    qu'une ville hors liste.
  const pays = lieux.map(paysDe).filter(Boolean);
  if (pays.some(p => PAYS_FR.test(p))) return 'FR';

  // 3. Ce que le pays dit d'autre. « European Union » est dans NOMS_UE : ce
  //    n'est pas un pays, et il ne doit surtout pas devenir « FR ».
  if (pays.some(p => NOMS_UE.has(p))) return 'EU';
  if (pays.some(p => AUTRES_PAYS.test(p))) return 'INTL';

  // 4. Puis le texte, pour ce que le pays ne dit pas.
  const texte = normaliserValeur(lieux.map(l => l?.location).join(' ; '));
  if (texte) {
    if ([...NOMS_UE].some(p => texte.includes(p))) return 'EU';
    if (AUTRES_PAYS.test(texte)) return 'INTL';
  }

  if (estDistanciel(j)) return 'REMOTE';
  // Un lieu non reconnu laisse `country` à `null` : il tombe en fin de tri, au
  // lieu d'être baptisé « INTL » ou, pire, « FR » parce que l'entreprise est
  // française.
  return null;
}

// Le lieu affiché : le texte de l'employeur, principal et secondaires réunis,
// borné pour ne pas servir une liste de quinze villes dans une carte d'offre.
export function lieuAffiche(j) {
  const textes = [...new Set(lieuxDeLOffre(j).map(l => String(l?.location ?? '').trim()).filter(Boolean))];
  return textes.length ? textes.join(' ; ').slice(0, 120) : 'Non précisé';
}

// ── DESCRIPTION ──────────────────────────────────────────────────────────────
// `descriptionPlain` est servi à côté de `descriptionHtml` : du texte déjà
// dépouillé, pas du HTML doublement encodé comme chez Greenhouse.
export function texteDeContenu(j, longueur = 300) {
  const plat = String(j?.descriptionPlain ?? '').trim();
  const brut = plat || String(j?.descriptionHtml ?? '').replace(/<[^>]*>/g, ' ');
  return brut.replace(/\s+/g, ' ').trim().slice(0, longueur);
}

// ── NORMALISATION ────────────────────────────────────────────────────────────
export function normaliserOffre(j, entree) {
  return {
    id: `ab_${entree.board}_${j?.id}`,
    title: String(j?.title ?? '').trim(),
    company: entree.company || 'Confidentiel',
    location: lieuAffiche(j),
    type: contratAshby(j),
    workTime: tempsAshby(j),
    // Seulement si l'employeur a consenti à l'afficher, que c'est un SALAIRE
    // et pas de l'equity, en euros et annuel. Tout le reste vaut null.
    salary: salaireAshby(j),
    description: texteDeContenu(j),
    // La page de candidature chez l'ATS de l'employeur. Contrairement à
    // Teamtailor, Ashby ne sert pas le domaine propre de l'entreprise.
    url: String(j?.jobUrl ?? j?.applyUrl ?? ''),
    date: j?.publishedAt || null,
    remote: estDistanciel(j),
    source: 'Ashby',
    logo: null,
    country: paysAshby(j),
  };
}

// `isListed: false` est une offre que l'employeur a retirée de son site
// carrière. La servir serait publier ce qu'il a dépublié.
export function offrePubliee(j) {
  return j?.isListed !== false;
}

export function offreExploitable(o) {
  return Boolean(o.title && o.url && o.id);
}

// ── COLLECTE ─────────────────────────────────────────────────────────────────
// Un board qui tombe ne fait pas tomber la collecte : chaque board est isolé,
// et son échec part au journal avec une cause du vocabulaire fermé d'
// `api/jobs.js`. Même garantie que les trois collecteurs précédents.
export async function collecterBoard(entree, options = {}) {
  const { journal, fetchImpl = fetch, timeout = TIMEOUT_MS } = options;
  const url = `${ASHBY_BASE}/${encodeURIComponent(entree.board)}?includeCompensation=true`;
  const echec = (cause) => {
    journal?.push({ source: `Ashby/${entree.board}`, raison: cause, cause });
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
  // Un 200 sans tableau `jobs` est illisible, pas vide. Les confondre ferait
  // lire « cette entreprise ne recrute pas » là où il faut lire « on n'a pas
  // su lire » — et c'est précisément la distinction qu'Ashby rend possible, en
  // répondant 200 avec `{"jobs":[]}` pour un board réel mais vide.
  if (!Array.isArray(data?.jobs)) return echec('reponse_illisible');

  return data.jobs
    .filter(offrePubliee)
    .map(j => normaliserOffre(j, entree))
    .filter(offreExploitable);
}

export async function collecterAshby(catalogue, options = {}) {
  const { concurrence = CONCURRENCE } = options;
  const entrees = Array.isArray(catalogue) ? catalogue : [];
  const offres = [];
  for (let i = 0; i < entrees.length; i += concurrence) {
    const lot = entrees.slice(i, i + concurrence);
    const resultats = await Promise.allSettled(lot.map(e => collecterBoard(e, options)));
    for (const [k, r] of resultats.entries()) {
      if (r.status === 'fulfilled') offres.push(...r.value);
      else options.journal?.push({ source: `Ashby/${lot[k].board}`, raison: String(r.reason), cause: 'inconnue' });
    }
  }
  return offres;
}
