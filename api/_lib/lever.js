// ── COLLECTEUR LEVER (crawl direct de l'ATS) ─────────────────────────────────
// Le second collecteur de cette nature, après Greenhouse. Il lit l'ATS de
// l'employeur à la source : Lever publie pour chaque board un endpoint JSON
// SANS CLÉ ni quota documenté, et le `hostedUrl` qu'il rend pointe la page de
// candidature de l'employeur chez son ATS — pas un agrégateur. L'offre est
// celle que l'employeur a écrite, à l'endroit où il la publie.
//
// POURQUOI LEVER APRÈS GREENHOUSE. Le relevé Greenhouse du 2026-10-19 a laissé
// un trou nommé : 5,2 % seulement de ses 6 484 offres étaient en France, et les
// scale-ups françaises les plus évidentes y répondaient toutes 404 — Qonto,
// Alan, Swile, Payfit, Pennylane, Spendesk, Ledger, BlaBlaCar, Back Market,
// Leboncoin, Malt, Mistral, OVHcloud. Greenhouse est un ATS surtout anglophone.
// Lever est le candidat suivant pour ce gisement précis.
//
// CE QUE LA SOURCE DIT, ET CE QU'ELLE NE DIT PAS. Lever est plus structuré que
// Greenhouse : `categories.commitment` porte un type d'engagement, `country` un
// code ISO-2, `workplaceType` un vocabulaire fermé de trois valeurs. Mais il ne
// publie AUCUN champ de salaire — donc `salary` vaut `null`, et ce n'est pas un
// trou à combler : c'est ce que la source dit. Et `commitment` est du texte
// libre choisi par l'employeur, pas une énumération : il passe par
// `_lib/contrat.js`, qui rend `null` pour tout ce qui n'est pas du vocabulaire
// reconnu.
import {
  contratLever, tempsLever, normaliserValeur,
} from './contrat.js';

export const LEVER_BASE = 'https://api.lever.co/v0/postings';

// Lever ne documente pas de quota. La retenue est de la prudence, pas une
// limite connue — et elle est plus basse que chez Greenhouse parce que les
// réponses sont LOURDES : mesuré 1,2 Mo pour les 45 offres de `qonto`, soit
// ~27 ko par offre, Lever rendant la description complète en HTML dans chaque
// élément du tableau.
export const CONCURRENCE = 5;
export const TIMEOUT_MS = 25000;

// ── LIEUX ────────────────────────────────────────────────────────────────────
// `categories.location` est du texte libre, et sur Lever il prend le plus
// souvent la forme d'une VILLE NUE : « Paris », « Barcelona », « Belgrade »,
// « Milan ». Pas de pays, pas de région — là où Greenhouse écrivait « Paris,
// Paris, France ». Une table de pays appliquée à cette chaîne ne reconnaîtrait
// donc presque rien, et c'est pour cela que le champ `country` compte ici.
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
  'saint etienne', 'le havre', 'nantes metropole', 'lille metropole',
]);

// Les codes ISO-2 de l'Union, pour distinguer « EU » d'« INTL ». `FR` n'y est
// pas : la France a son propre rang, et c'est tout l'intérêt du champ.
const PAYS_UE = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI',
  'ES', 'SE',
]);

// Les noms de pays écrits en clair dans la chaîne de lieu. Rares sur Lever,
// mais quand ils y sont ils sont explicites, et un lieu explicite ne doit pas
// être contredit par un code déclaré ailleurs.
const NOMS_UE = /\b(germany|deutschland|spain|espana|italy|italia|portugal|netherlands|nederland|belgium|belgique|austria|poland|polska|sweden|denmark|finland|ireland|greece|czechia|czech republic|romania|hungary|bulgaria|croatia|slovakia|slovenia|lithuania|latvia|estonia|luxembourg|cyprus|malta)\b/;
const NOMS_INTL = /\b(usa|united states|canada|uk|united kingdom|india|brazil|japan|china|australia|singapore|israel|mexico|switzerland|norway|serbia|turkey|ukraine|morocco|tunisia|egypt|south africa|argentina|chile|colombia|new zealand)\b/;

// `workplaceType` est le SEUL vocabulaire vraiment fermé de cette source :
// trois valeurs, documentées et constatées — `onsite`, `hybrid`, `remote`.
// « hybrid » n'est pas du distanciel : c'est un poste rattaché à un bureau.
export const DISTANCIEL = 'remote';

export function estDistanciel(p) {
  return String(p?.workplaceType ?? '').toLowerCase() === DISTANCIEL;
}

// `categories.location` peut porter PLUSIEURS villes, séparées par des
// virgules — mesuré : « London, Paris, Toronto, New York ». Le découpage se
// fait donc sur le texte BRUT, avant normalisation, et c'est nécessaire :
// `normaliserValeur` remplace tout caractère non alphanumérique par une espace,
// virgules comprises. Découper après elle ne découperait rien, et le test par
// ville ne verrait jamais qu'une seule chaîne de quatre villes collées — un
// filtre qui a l'air d'exister et ne s'exécute jamais.
export function segmentsDeLieu(texte) {
  return String(texte ?? '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
}

// Le pays tel qu'on peut l'ÉTABLIR, et `null` quand on ne le peut pas.
//
// L'ORDRE, et chaque rang est justifié par une mesure :
//
//   1. Le LIEU quand il NOMME la France.
//   2. Le LIEU quand il nomme explicitement un AUTRE pays.
//   3. Le CODE ISO `country`.
//   4. Le LIEU découpé, quand un segment est une ville française reconnue.
//
// Les rangs 1 et 2 d'abord, parce qu'un pays écrit en clair dans le lieu est la
// chose la moins ambiguë de la source — et c'est la leçon que la mesure a
// imposée à Greenhouse : son champ « Job Posting Country = France » portait un
// poste à Berlin, parce qu'il nommait l'entité qui PUBLIE et non le lieu où
// l'on travaille. Un lieu étranger explicite ne doit jamais être contredit par
// un code déclaré ailleurs.
//
// MAIS le code ISO passe AVANT la liste de villes (rang 3 avant rang 4), et
// c'est l'inverse de l'ordre de `paysGreenhouse`. Deux mesures l'imposent :
//
//   · Le code TIENT. 63 offres portent `country: "FR"` sur une commune absente
//     de la liste — Saint-Denis, Le Thillay, Mitry-Mory, Saint Vulbas,
//     Blanc-Mesnil. Ce sont de vraies communes françaises, et le code est le
//     seul champ qui le dise. Une seule offre dit l'inverse, et son `country`
//     y est vide. Le code ne contredit pas le lieu : il RATTRAPE ce que le
//     texte libre ignore.
//   · La liste de villes, elle, se trompe sur les homonymes. « Nice,
//     California » ne nomme aucun pays, et « nice » est une ville française
//     reconnue : la liste seule en ferait une offre française. Le code `US`
//     tranche. C'est le piège « Paris, Texas » de Greenhouse, que seule une
//     table de pays protégeait là-bas — ici un code ISO le fait mieux.
//
// La liste de villes reste donc utile exactement là où le code est ABSENT, ce
// qui est le cas de l'offre multi-villes ci-dessus.
//
// `categories.allLocations` n'entre PAS dans ce calcul, et c'est délibéré.
// Mesuré : 6 offres NON françaises nomment la France dans ce champ — par
// exemple `country: "DE"`, `location: "Berlin"`, `allLocations` valant
// `["Berlin","Barcelona","Milan","Paris","Madrid"]`. S'en servir pour établir
// « France » rendrait française toute offre ouverte à plusieurs bureaux dont
// l'un est à Paris — exactement la devinette que `offices` avait fait éviter
// chez Greenhouse.
export function paysLever(p) {
  const brut = String(p?.categories?.location ?? '');
  const lieu = normaliserValeur(brut);
  if (lieu) {
    if (/\bfrance\b/.test(lieu)) return 'FR';
    if (NOMS_UE.test(lieu)) return 'EU';
    if (NOMS_INTL.test(lieu)) return 'INTL';
  }

  const code = String(p?.country ?? '').trim().toUpperCase();
  if (code === 'FR') return 'FR';
  if (PAYS_UE.has(code)) return 'EU';
  // Un code à deux lettres qu'on ne range pas dans l'Union est un pays hors
  // Union : c'est une information, pas une inconnue. Tout ce qui n'a pas la
  // forme d'un code ISO-2 n'en est pas une.
  if (/^[A-Z]{2}$/.test(code)) return 'INTL';

  // Pas de code : la liste de villes est alors le seul recours, et elle n'a
  // plus d'homonyme étranger à craindre puisque les rangs 2 et 3 l'auraient
  // attrapé.
  if (segmentsDeLieu(brut).some(s => VILLES_FR.has(normaliserValeur(s)))) return 'FR';

  // Ni lieu lisible ni code : le distanciel est alors tout ce qu'on peut dire,
  // et sinon le pays reste inconnu. Un lieu non reconnu laisse `country` à
  // `null` : il tombe en fin de tri, au lieu d'être baptisé « INTL » ou, pire,
  // « FR » parce que l'entreprise est française.
  if (estDistanciel(p)) return 'REMOTE';
  return null;
}

// ── DESCRIPTION ──────────────────────────────────────────────────────────────
// Lever publie `descriptionPlain` À CÔTÉ de `description` : du texte déjà
// dépouillé, pas du HTML doublement encodé comme chez Greenhouse. On le prend
// tel quel, et on ne retombe sur le HTML que s'il manque.
export function texteDeContenu(p, longueur = 300) {
  const plat = String(p?.descriptionPlain ?? '').trim();
  const brut = plat || String(p?.description ?? '').replace(/<[^>]*>/g, ' ');
  return brut.replace(/\s+/g, ' ').trim().slice(0, longueur);
}

// ── DATE ─────────────────────────────────────────────────────────────────────
// `createdAt` est un ENTIER en millisecondes depuis l'épuque, pas une chaîne
// ISO — mesuré : `1791900863876`. Les huit autres collecteurs rendent tous une
// chaîne, et `prioritize()` comme le tri de `api/jobs.js` font `new Date(…)`
// dessus. Laisser passer l'entier marcherait par accident ici et casserait le
// jour où la valeur est sérialisée puis relue depuis le KV. On convertit.
export function dateDeParution(p) {
  const ms = Number(p?.createdAt);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── NORMALISATION ────────────────────────────────────────────────────────────
// La forme de sortie est celle des neuf autres collecteurs, au champ près :
// mêmes clés, même vocabulaire de contrat, même `country`. C'est ce qui permet
// à `deduplicate()` et aux deux filtres d'`api/jobs.js` de s'appliquer à ces
// offres sans les connaître.
export function normaliserOffre(p, entree) {
  const lieu = String(p?.categories?.location ?? '').trim();
  return {
    id: `lv_${entree.board}_${p?.id}`,
    title: String(p?.text ?? '').trim(),
    company: entree.company || 'Confidentiel',
    location: lieu || 'Non précisé',
    type: contratLever(p),
    workTime: tempsLever(p),
    // L'API des postings ne porte aucun champ de salaire — vérifié sur la
    // totalité des clés rendues. `null` est ce que la source dit.
    salary: null,
    description: texteDeContenu(p),
    // La page de candidature chez l'ATS de l'employeur, pas celle d'un
    // agrégateur — c'est la raison d'être de ce collecteur.
    url: String(p?.hostedUrl ?? p?.applyUrl ?? ''),
    date: dateDeParution(p),
    remote: estDistanciel(p),
    source: 'Lever',
    logo: null,
    country: paysLever(p),
  };
}

// Une offre sans titre ni URL n'est pas affichable : elle est écartée plutôt
// que publiée à moitié.
export function offreExploitable(o) {
  return Boolean(o.title && o.url && o.id);
}

// ── COLLECTE ─────────────────────────────────────────────────────────────────
// Un board qui tombe ne fait pas tomber la collecte : chaque board est isolé,
// et son échec part au journal avec une cause du vocabulaire fermé d'
// `api/jobs.js`. Même garantie que le collecteur Greenhouse, pour la même
// raison — sans quoi un seul slug retiré par son employeur ferait disparaître
// toutes les autres entreprises du catalogue.
export async function collecterBoard(entree, options = {}) {
  const { journal, fetchImpl = fetch, timeout = TIMEOUT_MS } = options;
  const url = `${LEVER_BASE}/${encodeURIComponent(entree.board)}?mode=json`;
  const echec = (cause) => {
    journal?.push({ source: `Lever/${entree.board}`, raison: cause, cause });
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
  // Lever rend un TABLEAU à la racine — pas un objet à clé `jobs` comme
  // Greenhouse. Un 200 qui n'est pas un tableau est illisible, pas vide : les
  // confondre ferait lire « cette entreprise ne recrute pas » là où il faut
  // lire « on n'a pas su lire ».
  if (!Array.isArray(data)) return echec('reponse_illisible');

  return data
    .map(p => normaliserOffre(p, entree))
    .filter(offreExploitable);
}

// Les boards par lots, pour ne pas ouvrir tout le catalogue d'un coup.
export async function collecterLever(catalogue, options = {}) {
  const { concurrence = CONCURRENCE } = options;
  const entrees = Array.isArray(catalogue) ? catalogue : [];
  const offres = [];
  for (let i = 0; i < entrees.length; i += concurrence) {
    const lot = entrees.slice(i, i + concurrence);
    const resultats = await Promise.allSettled(lot.map(e => collecterBoard(e, options)));
    for (const [k, r] of resultats.entries()) {
      if (r.status === 'fulfilled') offres.push(...r.value);
      // `allSettled` ne rejette jamais, et `collecterBoard` non plus — cette
      // branche ne devrait pas être atteinte. Elle existe pour que, si elle
      // l'était, l'échec soit journalisé plutôt que silencieux.
      else options.journal?.push({ source: `Lever/${lot[k].board}`, raison: String(r.reason), cause: 'inconnue' });
    }
  }
  return offres;
}
