// ── COLLECTEUR GREENHOUSE (crawl direct de l'ATS) ────────────────────────────
// Les huit collecteurs d'`api/jobs.js` sont tous des API tierces : elles
// republient des offres qu'elles ont elles-mêmes agrégées, avec une clé, un
// quota et un coût — et les mêmes offres repostées que tout le monde ramasse.
//
// Celui-ci est d'une autre nature : il lit l'ATS de l'employeur à la source.
// Greenhouse publie, pour chaque board, un endpoint JSON SANS CLÉ ni quota
// documenté, et l'`absolute_url` qu'il rend pointe la page carrière de
// l'entreprise — pas un agrégateur. L'offre est celle que l'employeur a
// écrite, à l'endroit où il la publie.
//
// Ce que ce module N'INVENTE PAS, et c'est l'essentiel. Greenhouse ne publie
// ni contrat, ni salaire, ni pays normalisé. Donc : le salaire vaut `null`
// (l'API n'en porte aucun), le contrat passe par `_lib/contrat.js` et vaut
// `null` quatre fois sur cinq, et le pays n'est posé que là où un champ le
// DIT ou une ville est RECONNUE. Un lieu non reconnu laisse `country` à
// `null` : il tombe alors en fin de tri, au lieu d'être baptisé « INTL » ou,
// pire, « FR » parce que l'entreprise est française.
import {
  contratGreenhouse, tempsGreenhouse, champMetadata, normaliserValeur,
} from './contrat.js';

export const GREENHOUSE_BASE = 'https://boards-api.greenhouse.io/v1/boards';

// Combien de boards sont interrogés en même temps. Greenhouse ne documente pas
// de quota ; la retenue est donc de la prudence, pas une limite connue.
export const CONCURRENCE = 6;
export const TIMEOUT_MS = 10000;

// ── LIEUX ────────────────────────────────────────────────────────────────────
// `location.name` est du texte libre saisi par l'employeur, et il prend trois
// formes mesurées sur le board doctolib : le lieu complet (« Paris, Paris,
// France »), la ville nue (« Metz », « Annecy »), et plusieurs lieux séparés
// par un point-virgule (« Berlin, Berlin, Germany; Paris, Paris, France »).
// Une offre est donc en France dès qu'UN de ses segments l'est.
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
  'lannion', 'vannes', 'chambery', 'la rochelle', 'biarritz', 'bayonne',
]);

// Les pays de l'Union, pour distinguer « EU » d'« INTL ». La France n'y est
// pas : elle a son propre rang, et c'est tout l'intérêt du champ.
const PAYS_UE = new Set([
  'germany', 'deutschland', 'spain', 'espana', 'italy', 'italia', 'portugal',
  'netherlands', 'nederland', 'belgium', 'belgique', 'austria', 'poland',
  'polska', 'sweden', 'denmark', 'finland', 'ireland', 'greece', 'czechia',
  'czech republic', 'romania', 'hungary', 'bulgaria', 'croatia', 'slovakia',
  'slovenia', 'lithuania', 'latvia', 'estonia', 'luxembourg', 'cyprus', 'malta',
]);

const MOTS_DISTANCIEL = /\b(remote|telework|teletravail|anywhere|distanciel)\b/;

export function segmentsDeLieu(texte) {
  return String(texte ?? '').split(';').map(s => s.trim()).filter(Boolean);
}

// Un segment est français s'il NOMME la France, ou s'il se réduit à une ville
// reconnue. La seconde condition exige que le segment ne nomme aucun autre
// pays : « Paris, Texas, United States » nomme les États-Unis et n'est pas
// français, même s'il commence par « Paris ».
function segmentEstFrancais(segment) {
  const t = normaliserValeur(segment);
  if (/\bfrance\b/.test(t)) return true;
  if ([...PAYS_UE].some(p => t.includes(p))) return false;
  if (/\b(usa|united states|canada|uk|united kingdom|india|brazil|japan|china|australia|singapore|israel|mexico)\b/.test(t)) return false;
  return t.split(/\s*,\s*/).some(part => VILLES_FR.has(part.trim()));
}

// Le pays tel qu'on peut l'ÉTABLIR, et `null` quand on ne le peut pas.
//
// L'ORDRE EST CELUI-CI, et il a été corrigé par la mesure. On aurait cru le
// champ déclaré par l'employeur plus sûr que la chaîne de lieu : il est
// structuré, il est typé, il vient d'une liste. Le relevé dit autre chose.
// L'offre Doctolib « Engineering Manager - Observability » porte
// `Job Posting Country = France` et `location = "Berlin, Berlin, Germany"`.
// Ce champ nomme l'entité qui PUBLIE l'offre, pas le lieu où l'on travaille ;
// le prendre pour le second envoyait un poste berlinois à un candidat qui
// cherche à Paris.
//
// Le lieu prime donc, parce que `country` sert à ranger des offres pour
// quelqu'un qui cherche PAR LIEU. Le champ déclaré ne décide que là où le
// lieu ne permet de rien conclure.
//
// `offices` n'entre pas dans ce calcul du tout, et la même offre dit pourquoi :
// elle liste Aix-en-Provence, Nantes et Paris pour un poste à Berlin. C'est la
// liste des bureaux que l'entreprise rattache au poste, pas l'endroit où il
// s'exerce. S'en servir pour établir « France » rendrait française toute offre
// d'une entreprise ayant un bureau en France — exactement la devinette que
// `_lib/contrat.js` interdit pour le contrat.
export function paysGreenhouse(j) {
  const segments = segmentsDeLieu(j?.location?.name);
  if (segments.some(segmentEstFrancais)) return 'FR';

  const texte = normaliserValeur(segments.join(' '));
  if (segments.length) {
    if ([...PAYS_UE].some(p => texte.includes(p))) return 'EU';
    if (/\b(usa|united states|canada|uk|united kingdom|india|brazil|japan|china|australia|singapore|israel|mexico)\b/.test(texte)) return 'INTL';
    if (MOTS_DISTANCIEL.test(texte)) return 'REMOTE';
    return null;                              // un lieu, mais pas reconnaissable
  }

  // Aucun lieu : le champ déclaré est alors tout ce qu'on a.
  const declare = champMetadata(j, 'job posting country');
  if (!declare) return null;
  const d = normaliserValeur(declare);
  if (/\bfrance\b/.test(d)) return 'FR';
  if (PAYS_UE.has(d)) return 'EU';
  return 'INTL';
}

export function estDistanciel(j) {
  return MOTS_DISTANCIEL.test(normaliserValeur(j?.location?.name));
}

// ── DESCRIPTION ──────────────────────────────────────────────────────────────
// `content` arrive en HTML DOUBLEMENT encodé : la balise `<p>` y est écrite
// `&lt;p&gt;`. Un `strip` appliqué avant le décodage ne retire donc rien du
// tout, et la description publiée serait du balisage. On décode, puis on
// retire les balises, puis on décode une seconde fois les entités de texte
// (`&nbsp;`, `&amp;`) que le premier passage a fait apparaître.
const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };

function decoderEntites(s) {
  return String(s ?? '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (brut, code) => {
    if (ENTITES[code] !== undefined) return ENTITES[code];
    if (/^#x/i.test(code)) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (/^#/.test(code)) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return brut;
  });
}

export function texteDeContenu(contenu, longueur = 300) {
  const decode = decoderEntites(contenu);
  const sansBalise = decode.replace(/<[^>]*>/g, ' ');
  return decoderEntites(sansBalise).replace(/\s+/g, ' ').trim().slice(0, longueur);
}

// ── NORMALISATION ────────────────────────────────────────────────────────────
// La forme de sortie est celle des huit autres collecteurs, au champ près :
// même clés, même vocabulaire de contrat, même `country`. C'est ce qui permet
// à `deduplicate()` et aux deux filtres d'`api/jobs.js` de s'appliquer à ces
// offres sans les connaître.
export function normaliserOffre(j, entree) {
  const lieu = String(j?.location?.name ?? '').trim();
  return {
    id: `gh_${entree.board}_${j?.id}`,
    title: String(j?.title ?? '').trim(),
    company: entree.company || j?.company_name || 'Confidentiel',
    location: lieu || 'Non précisé',
    type: contratGreenhouse(j),
    workTime: tempsGreenhouse(j),
    // L'API des boards ne porte aucun champ de salaire. `null` n'est pas un
    // trou à combler : c'est ce que la source dit.
    salary: null,
    description: texteDeContenu(j?.content),
    // L'URL de l'employeur, pas celle d'un agrégateur — c'est la raison d'être
    // de ce collecteur.
    url: String(j?.absolute_url ?? ''),
    // `first_published` est la date de PARUTION ; `updated_at` ne dit que la
    // dernière retouche, et la prendre pour une parution rajeunirait une offre
    // à chaque correction de typo.
    date: j?.first_published || j?.updated_at || null,
    remote: estDistanciel(j),
    source: 'Greenhouse',
    logo: null,
    country: paysGreenhouse(j),
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
// `api/jobs.js` (`http_404`, `timeout`, `reponse_illisible`, `erreur_reseau`).
// C'est la règle que `muet()` applique aux huit autres sources, appliquée ici
// board par board — sans quoi un seul slug retiré par son employeur ferait
// disparaître les vingt-sept autres entreprises du catalogue.
export async function collecterBoard(entree, options = {}) {
  const { journal, fetchImpl = fetch, timeout = TIMEOUT_MS } = options;
  const url = `${GREENHOUSE_BASE}/${encodeURIComponent(entree.board)}/jobs?content=true`;
  const echec = (cause) => {
    journal?.push({ source: `Greenhouse/${entree.board}`, raison: cause, cause });
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
  // Un board qui répond 200 avec autre chose qu'un tableau `jobs` est
  // illisible, pas vide. Les confondre ferait lire « cette entreprise ne
  // recrute pas » là où il faut lire « on n'a pas su lire ».
  if (!Array.isArray(data?.jobs)) return echec('reponse_illisible');

  return data.jobs
    .map(j => normaliserOffre(j, entree))
    .filter(offreExploitable);
}

// Les boards par lots, pour ne pas ouvrir vingt-huit connexions d'un coup.
export async function collecterGreenhouse(catalogue, options = {}) {
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
      else options.journal?.push({ source: `Greenhouse/${lot[k].board}`, raison: String(r.reason), cause: 'inconnue' });
    }
  }
  return offres;
}
