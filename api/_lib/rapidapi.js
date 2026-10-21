// ── LES DEUX SOURCES RAPIDAPI, COLLECTÉES HORS DU CHEMIN DE LA REQUÊTE ───────
//
// Pourquoi ce fichier existe. JSearch et French Job Market étaient appelées en
// ligne dans `api/jobs.js`, une fois par requête utilisateur et par source.
// Les deux rendaient `http_429` en production. La mesure du 2026-10-21 écarte
// les deux explications qu'on aurait pu supposer :
//
//   • Ce n'est PAS une clé invalide déguisée en 429. La passerelle RapidAPI
//     vérifie la clé AVANT de router : un appel sans clé sur les trois hôtes
//     rend 401 « Invalid API key ». Un 429 prouve donc que la clé est valide
//     ET que l'abonnement existe (un abonnement absent rendrait 403).
//   • Ce n'est PAS un throttle par seconde. Deux requêtes isolées espacées de
//     100 s, avec UN SEUL appel par API chacune, ont toutes deux été refusées,
//     et les deux grilles publient un débit de 1000 requêtes/heure — hors
//     d'atteinte pour le trafic d'emploia.
//
// Reste le plafond MENSUEL, relevé sur les grilles publiques le 2026-10-21 :
//
//   JSearch            BASIC  200 requêtes/mois  « Hard Limit »  (Pro 25 $ → 10 000)
//   French job market  BASIC   30 requêtes/mois  « Hard Limit »  (Pro 10 $ → 300)
//
// Et c'est le chiffre qui condamne l'appel en ligne, par arithmétique et non
// par opinion. emploia sert 86 pages SEO plus le trafic utilisateur ; chaque
// requête non mise en cache coûte un appel à chaque source. Un seul passage de
// crawler sur les 86 pages consomme 86 requêtes : 2,9 fois le quota mensuel
// ENTIER de French Job Market, et 43 % de celui de JSearch. Aucun TTL de cache
// par requête ne rattrape ça — la clé de cache porte `q` et `location`, donc
// 86 pages font 86 entrées, donc 86 appels par fenêtre de TTL.
//
// La seule forme qui tient dans le quota est un RÉSERVOIR indépendant de la
// requête, rempli par un cron et lu en KV : le schéma que la PR #99 a introduit
// pour Greenhouse. Le nombre d'appels devient fonction du calendrier, pas du
// trafic — donc borné à l'avance.
//
// Contrainte qui fixe les fréquences : le plan Vercel est Hobby, où un cron ne
// peut tourner qu'une fois par jour au plus (`0 */6 * * *` a fait ÉCHOUER le
// déploiement de la PR #99 avant le build). D'où :
//
//   JSearch            quotidien   6 requêtes/collecte → 186/mois sur 31 jours ≤ 200
//   French job market  hebdomadaire 5 requêtes/collecte →  25/mois sur 5 lundis ≤  30
//
// French Job Market ne peut PAS être collectée quotidiennement : 30 requêtes
// pour 31 jours, le mois déborde avant de finir. L'hebdomadaire est le seul
// rythme que son plan gratuit autorise, et il coûte une fraîcheur de sept jours.
// C'est une décision d'abonnement, pas un défaut de code : 10 $/mois portent le
// plafond à 300 et rendent le quotidien possible.
import {
  contratJSearch, tempsJSearch, contratFrenchMarket,
} from './contrat.js';

export const CLE_KV = 'rapidapi_jobs';

// Budgets, en un seul endroit, pour que l'arithmétique ci-dessus soit
// VÉRIFIABLE par un test plutôt que relue dans un commentaire.
// `scripts/smoke/rapidapi.test.mjs` recalcule la consommation mensuelle pire
// cas depuis ces nombres et refuse qu'elle dépasse le plafond mesuré. Monter
// `pagesParCollecte` sans monter le plan fait donc rougir la CI, au lieu de
// faire rougir la production trois semaines plus tard.
export const BUDGETS = {
  jsearch: {
    plafondMensuel: 200,
    pagesParCollecte: 6,
    // 31 : le pire cas, pas la moyenne. Un budget juste sur 30 jours déborde
    // sept mois par an.
    collectesParMois: 31,
  },
  frenchmarket: {
    plafondMensuel: 30,
    pagesParCollecte: 5,
    // 5 : le nombre maximal de lundis dans un mois.
    collectesParMois: 5,
  },
};

// 72 h, comme Greenhouse, et pour la même raison : trois exécutions ratées du
// cron QUOTIDIEN avant que la clé disparaisse et que les deux sources basculent
// en `collecte_absente`. Le cron réécrit la clé chaque jour, donc ce TTL ne
// mesure qu'une chose — le cron tourne-t-il encore.
export const TTL_SECONDES = 72 * 3600;

// Âge au-delà duquel les offres d'une source sont ÉCARTÉES à la lecture, et la
// source déclarée en échec.
//
// C'est le piège que ces deux nombres viennent fermer, et il n'existait pas
// pour Greenhouse : la clé porte DEUX sources et le cron la réécrit chaque
// jour, donc son TTL serait neuf même si French Job Market était refusée depuis
// six semaines. Le réservoir servirait des offres périmées sans jamais le dire
// — exactement le silence que `causesEnEchec` est venu retirer. La fraîcheur
// se vérifie donc PAR SOURCE, à la lecture, sur son propre `collecteLe`.
//
//   jsearch       72 h  — trois cycles quotidiens, identique à Greenhouse.
//   frenchmarket  16 j  — deux lundis manqués plus deux jours de marge. Son
//                         plan gratuit (30 requêtes/mois) n'autorise pas mieux
//                         que l'hebdomadaire, donc la tolérance doit couvrir
//                         deux cycles de sept jours. Le coût est réel : une
//                         offre APEC peut être servie seize jours après sa
//                         collecte. Chaque offre porte sa propre date et la
//                         liste est triée dessus, donc l'âge reste VISIBLE
//                         plutôt que masqué — mais il est là, et passer la
//                         source en Pro (10 $/mois, 300 requêtes) ramènerait
//                         la tolérance à 72 h comme les autres.
export const AGE_MAX_SECONDES = {
  jsearch: 72 * 3600,
  frenchmarket: 16 * 86400,
};

// Six familles de métiers plutôt que six pages d'une même requête. Le réservoir
// est filtré à la lecture par la requête de l'utilisateur : ce qui compte est
// donc la LARGEUR du catalogue, pas la profondeur dans un seul classement.
// emploia publie 37 pages /metier — tech, santé, commerce, industrie, gestion,
// logistique sont les six axes qui les recouvrent le moins mal. Six requêtes
// page 1 touchent six familles ; six pages de « emploi » n'en touchent qu'une.
//
// La limite est réelle et doit être dite : un candidat qui cherche « coiffeur »
// ne trouvera rien venant de ces deux sources, parce que le réservoir ne
// contient pas sa famille. Avec 200 requêtes/mois il n'y a pas de version de ce
// choix qui couvre 37 métiers.
export const FAMILLES = ['développeur', 'commercial', 'infirmier', 'technicien', 'comptable', 'logistique'];

// Borne de taille, pour la même raison que `MAX_OFFRES` côté Greenhouse : la
// valeur part dans UN enregistrement Upstash. Six requêtes ne peuvent pas en
// ramener 400, mais la borne ne dépend pas de ce que le fournisseur promet, et
// une troncature JOURNALISÉE vaut mieux qu'une écriture qui échoue.
export const MAX_OFFRES_PAR_SOURCE = 200;

const DELAI = 8000;

// Les appels d'une même source partent par lots, comme les 28 boards de
// `collecterGreenhouse`, et pour une raison de MINUTE : `vercel.json` borne
// toute fonction à `maxDuration: 60`, et onze appels séquentiels à 8 s de
// borne atteindraient 88 s — le cron serait tué avant d'écrire sa clé. Par
// lots de trois, le pire cas tombe à quatre lots, soit 32 s.
//
// L'arrêt reste possible ENTRE les lots, pas à l'intérieur : c'est le
// compromis. Au premier refus de quota on cesse d'en demander, parce que les
// appels suivants seraient refusés comme celui-là. On ne prétend pas pour
// autant qu'un appel refusé est décompté du quota — la grille ne le dit pas, et
// ce fichier n'affirme pas ce qu'il n'a pas mesuré ; cesser d'appeler est
// simplement la seule action utile quand le plan refuse.
const CONCURRENCE = 3;

// Un lot d'appels, dont on ne garde que ce qui a abouti. Rend aussi le drapeau
// de quota, qui est ce qui décide de continuer ou non.
async function parLots(entrees, faire) {
  const aboutis = [];
  let quota = false;
  let appels = 0;
  for (let i = 0; i < entrees.length; i += CONCURRENCE) {
    const lot = entrees.slice(i, i + CONCURRENCE);
    appels += lot.length;
    const resultats = await Promise.allSettled(lot.map(faire));
    for (const r of resultats) {
      if (r.status !== 'fulfilled') continue;
      if (r.value.etat === 'quota') { quota = true; continue; }
      if (r.value.etat === 'ok') aboutis.push(r.value.donnees);
    }
    if (quota) break;
  }
  return { aboutis, quota, appels };
}

// Un `fetch` injectable, parce que ces collecteurs doivent être testables hors
// ligne — c'est la convention des scripts de `scripts/`. Le défaut est le
// `fetch` global du runtime Edge.
async function appeler(fetchImpl, url, options, journal, source) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI);
  try {
    const res = await fetchImpl(url, { ...options, signal: ctrl.signal });
    // 429 est traité à part des autres refus, et c'est tout l'objet de ce
    // fichier : il dit « le plan est épuisé », ce qui n'est ni une panne
    // réseau ni une erreur de code, et ce qui n'appelle pas la même action.
    if (res.status === 429) return { etat: 'quota', donnees: null };
    if (!res.ok) {
      journal?.push({ source, cause: `http_${res.status}` });
      return { etat: 'erreur', donnees: null };
    }
    return { etat: 'ok', donnees: await res.json() };
  } catch (e) {
    journal?.push({ source, cause: e.name === 'AbortError' ? 'timeout' : 'erreur_reseau' });
    return { etat: 'erreur', donnees: null };
  } finally {
    clearTimeout(minuteur);
  }
}

// Le mapping est IDENTIQUE à celui que `api/jobs.js` appliquait en ligne, et il
// reste dans `_lib/contrat.js`. Déplacer la collecte ne doit pas changer ce
// qu'une offre dit d'elle-même : un contrat qu'on ne sait pas lire vaut `null`,
// ici comme avant.
function normaliserJSearch(j) {
  return {
    id: 'js_' + j.job_id,
    title: j.job_title,
    company: j.employer_name || 'Confidentiel',
    location: [j.job_city, j.job_country].filter(Boolean).join(', ') || 'France',
    type: contratJSearch(j),
    workTime: tempsJSearch(j),
    salary: j.job_min_salary
      ? `${Math.round(j.job_min_salary)}–${Math.round(j.job_max_salary || j.job_min_salary)} ${j.job_salary_currency || '€'}`
      : null,
    description: (j.job_description || '').slice(0, 300),
    url: j.job_apply_link || j.job_google_link || '',
    date: j.job_posted_at_datetime_utc || new Date().toISOString(),
    remote: j.job_is_remote || false,
    source: j.job_publisher || 'Indeed',
    logo: j.employer_logo || null,
    country: 'FR',
  };
}

const DOM_TOM = ['martinique', 'guadeloupe', 'guyane', 'réunion', 'reunion', 'mayotte', 'lamentin', 'cayenne', 'saint-denis - 97'];

function normaliserFrenchMarket(j) {
  return {
    id: 'fm_' + j.job_id,
    title: j.title,
    company: j.company || 'Confidentiel',
    location: j.location || 'France',
    type: contratFrenchMarket(j),
    salary: null,
    description: (j.short_description || '').slice(0, 300),
    url: j.source_url || '',
    date: j.posted_at || new Date().toISOString(),
    remote: j.remote === true || (j.remote || '').includes('full'),
    source: j.source_platform || 'APEC',
    logo: null,
    country: 'FR',
  };
}

// ── JSEARCH ─────────────────────────────────────────────────────────────────
export async function collecterJSearch({ cle, fetchImpl = fetch, journal, familles = FAMILLES } = {}) {
  if (!cle) return { etat: 'cle_absente', offres: [], appels: 0 };

  const aInterroger = familles.slice(0, BUDGETS.jsearch.pagesParCollecte);
  const { aboutis, quota, appels } = await parLots(aInterroger, (famille) => {
    const params = new URLSearchParams({
      query: `${famille} France`,
      num_pages: '1',
      page: '1',
      country: 'fr',
      date_posted: 'week',
    });
    return appeler(
      fetchImpl,
      `https://jsearch.p.rapidapi.com/search?${params}`,
      { headers: { 'x-rapidapi-host': 'jsearch.p.rapidapi.com', 'x-rapidapi-key': cle } },
      journal, 'JSearch',
    );
  });

  const offres = [];
  for (const donnees of aboutis) {
    for (const j of (donnees?.data || [])) offres.push(normaliserJSearch(j));
  }
  return { etat: quota ? 'quota' : 'ok', offres, appels };
}

// ── FRENCH JOB MARKET (APEC + HelloWork + Free-Work) ────────────────────────
export async function collecterFrenchMarket({ cle, fetchImpl = fetch, journal, familles = FAMILLES } = {}) {
  if (!cle) return { etat: 'cle_absente', offres: [], appels: 0 };

  const aInterroger = familles.slice(0, BUDGETS.frenchmarket.pagesParCollecte);
  const { aboutis, quota, appels } = await parLots(aInterroger, (famille) => appeler(
    fetchImpl,
    'https://french-job-market.p.rapidapi.com/v1/jobs/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': 'french-job-market.p.rapidapi.com',
        'x-rapidapi-key': cle,
      },
      body: JSON.stringify({ query: famille, location: 'France', num_pages: 1, page: 1 }),
    },
    journal, 'French Job Market',
  ));

  const offres = [];
  for (const donnees of aboutis) {
    // Le filtre DOM-TOM est conservé tel quel : il était dans le collecteur en
    // ligne et il relève du périmètre éditorial, pas du transport.
    for (const j of (donnees?.data || [])) {
      const loc = (j.location || '').toLowerCase();
      if (DOM_TOM.some(d => loc.includes(d))) continue;
      offres.push(normaliserFrenchMarket(j));
    }
  }
  return { etat: quota ? 'quota' : 'ok', offres, appels };
}
