// ── COLLECTEUR SMARTRECRUITERS (crawl direct de l'ATS) ───────────────────────
// Le quatrième collecteur de cette famille, après Greenhouse, Lever et
// Teamtailor. L'API publique `api.smartrecruiters.com/v1/companies/{id}/postings`
// est sans clé ni quota documenté, paginée par 100, et elle accepte un filtre
// `country=fr` CÔTÉ SERVEUR — le premier ATS de la famille qui le permette.
//
// POURQUOI SMARTRECRUITERS APRÈS TEAMTAILOR, et le critère a encore changé.
// Teamtailor a apporté d'autres EMPLOYEURS ; il restait des MÉTIERS que la
// famille ne servait pas. La sonde de surface du 2026-11-04 nommait le trou :
// `coiffeur`, `boulanger`, `aide-soignant` sans une offre. SmartRecruiters est
// l'ATS des grands employeurs multi-sites, et le relevé l'a confirmé :
// réceptionniste, chef de partie, chef de rang, barman (Accor, Barrière),
// vendeur et préparateur (Kiabi, Conforama, Primark). Chiffres complets dans
// `PROTO-smartrecruiters-ats-2026-11-04.md`.
//
// CE QUE LA SOURCE DONNE, ET CE QU'ELLE NE DONNE PAS — mesuré sur les
// 3 407 offres françaises des 25 entreprises du catalogue :
//   · `location.country` : 100 %, en ISO-2 MINUSCULE. Le filtre serveur
//     `country=fr` est honnête : 0 offre rendue sous ce filtre ne porte un
//     autre pays. Le pays est quand même relu offre par offre — un filtre
//     qu'on ne vérifie pas est un filtre qu'on croit.
//   · `location.city` : 100 %. Souvent en CAPITALES (« PARIS »).
//   · `releasedDate` : 100 %, en ISO.
//   · `location.remote` : 44 offres ; `hybrid` : 649. Seul `remote` rend
//     `remote: true` — un poste hybride a un lieu de travail.
//   · AUCUNE DESCRIPTION dans la liste. Elle n'existe que dans le détail
//     d'une offre, un appel par offre — 3 407 appels par nuit. On ne les fait
//     pas : `description` vaut la chaîne vide, et on n'y met ni la fonction
//     (« Customer Service ») ni le secteur, qui ne sont pas une description.
//   · AUCUN SALAIRE.
//   · Le CONTRAT : voir `contratSmartRecruiters` — l'id `permanent` couvre
//     124 CDD, il n'est pas lu.
import { contratSmartRecruiters, tempsSmartRecruiters } from './contrat.js';

export const SMARTRECRUITERS_API = 'https://api.smartrecruiters.com/v1/companies';
export const SMARTRECRUITERS_PUBLIC = 'https://jobs.smartrecruiters.com';

// Aucune limite documentée. La retenue est de la prudence : quatre entreprises
// de front, et la collecte complète tient en ~45 pages.
export const CONCURRENCE = 4;
export const TIMEOUT_MS = 20000;
export const PAR_PAGE = 100;   // le maximum que l'API accepte
// Garde contre une pagination qui ne finirait jamais : Alten, la plus grosse,
// rend 762 offres FR, soit 8 pages.
export const PAGES_MAX = 20;

// UNE ENTREPRISE NE DOIT PAS REMPLIR LA CLÉ À ELLE SEULE. Mesuré : Alten
// porte 762 des 3 407 offres françaises (22 %), et les sept cabinets
// d'ingénierie et de conseil du catalogue — Alten, Assystem, Devoteam, Talan,
// Forvis Mazars, Meritis, Sia — en portent 2 289, soit 67 %. Sans borne par
// entreprise, la troncature à `maxOffres` garderait ce que l'ordre de collecte
// met en tête, et les métiers que ce collecteur existe pour apporter —
// hôtellerie, vente — seraient les premiers coupés. Les plus récentes d'abord,
// soixante par entreprise : Accor et Barrière gardent soixante postes chacun,
// et la page « serveur » en a enfin.
export const PAR_ENTREPRISE = 60;

const PAYS_UE = new Set([
  'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'de', 'gr', 'hu',
  'ie', 'it', 'lv', 'lt', 'lu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'si',
  'es', 'se',
]);

// Le pays tel que la source le déclare. Pas de liste de villes en recours :
// le code est servi sur 100 % des offres, et une offre sans code n'est pas
// une offre française qu'on aurait ratée.
export function paysSmartRecruiters(p) {
  const code = String(p?.location?.country ?? '').trim().toLowerCase();
  if (code === 'fr') return 'FR';
  if (PAYS_UE.has(code)) return 'EU';
  if (/^[a-z]{2}$/.test(code)) return 'INTL';
  return p?.location?.remote === true ? 'REMOTE' : null;
}

// « PARIS » devient « Paris », « BOULOGNE-BILLANCOURT » devient
// « Boulogne-Billancourt », « VILLENEUVE-D'ASCQ » devient « Villeneuve-d'Ascq ». Seules les villes ENTIÈREMENT en capitales sont
// touchées : « Saint-Denis » ou « La Défense » restent telles que l'employeur
// les écrit.
export function lieuAffiche(p) {
  const ville = String(p?.location?.city ?? '').trim();
  if (!ville) return 'Non précisé';
  if (ville !== ville.toUpperCase() || !/[A-Z]/.test(ville)) return ville;
  return ville.toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase())
    // « VILLENEUVE-D'ASCQ » → « Villeneuve-d'Ascq », pas « Villeneuve-D'ascq ».
    .replace(/([\s-])([dl])['’](\p{L})/giu, (_, sep, p, l) => `${sep}${p.toLowerCase()}'${l.toUpperCase()}`);
}

export function normaliserOffre(p, entree) {
  const identifiant = p?.company?.identifier || entree.board;
  return {
    id: `sr_${entree.board}_${p?.id}`,
    title: String(p?.name ?? '').trim(),
    company: entree.company || p?.company?.name || 'Confidentiel',
    location: lieuAffiche(p),
    type: contratSmartRecruiters(p),
    workTime: tempsSmartRecruiters(p),
    salary: null,
    description: '',
    // La page publique de l'offre, vérifiée HTTP 200. C'est le domaine de
    // l'ATS et non celui de l'employeur, comme chez Greenhouse et Lever.
    url: p?.id ? `${SMARTRECRUITERS_PUBLIC}/${encodeURIComponent(identifiant)}/${encodeURIComponent(p.id)}` : '',
    date: p?.releasedDate || null,
    remote: p?.location?.remote === true,
    source: 'SmartRecruiters',
    logo: null,
    country: paysSmartRecruiters(p),
  };
}

export function offreExploitable(o) {
  return Boolean(o.title && o.url && o.id);
}

async function lirePage(url, { fetchImpl, timeout }) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetchImpl(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

// ── COLLECTE ─────────────────────────────────────────────────────────────────
// Une entreprise qui tombe ne fait pas tomber la collecte, et une page qui
// tombe au milieu de la pagination non plus : les pages déjà lues sont
// gardées, et l'échec part au journal avec sa cause. Garder des offres vraies
// vaut mieux que de jeter une entreprise entière pour sa huitième page.
export async function collecterBoard(entree, options = {}) {
  const { journal, fetchImpl = fetch, timeout = TIMEOUT_MS, parEntreprise = PAR_ENTREPRISE } = options;
  const base = `${SMARTRECRUITERS_API}/${encodeURIComponent(entree.board)}/postings`;
  const echec = (cause) => journal?.push({ source: `SmartRecruiters/${entree.board}`, raison: cause, cause });
  const brutes = [];

  for (let n = 0; n < PAGES_MAX; n++) {
    let res;
    try {
      res = await lirePage(`${base}?limit=${PAR_PAGE}&offset=${n * PAR_PAGE}&country=fr`, { fetchImpl, timeout });
    } catch (e) {
      echec(e?.name === 'AbortError' ? 'timeout' : 'erreur_reseau');
      break;
    }
    if (!res?.ok) { echec(`http_${res?.status ?? 0}`); break; }
    let data;
    try { data = await res.json(); } catch { echec('reponse_illisible'); break; }
    // Un 200 sans tableau `content` est illisible, pas vide.
    if (!Array.isArray(data?.content)) { echec('reponse_illisible'); break; }
    brutes.push(...data.content);
    if (data.content.length < PAR_PAGE || brutes.length >= Number(data.totalFound)) break;
  }

  return brutes
    .map(p => normaliserOffre(p, entree))
    .filter(offreExploitable)
    .filter(o => o.country === 'FR')
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, parEntreprise);
}

export async function collecterSmartRecruiters(catalogue, options = {}) {
  const { concurrence = CONCURRENCE } = options;
  const entrees = Array.isArray(catalogue) ? catalogue : [];
  const offres = [];
  for (let i = 0; i < entrees.length; i += concurrence) {
    const lot = entrees.slice(i, i + concurrence);
    const resultats = await Promise.allSettled(lot.map(e => collecterBoard(e, options)));
    for (const [k, r] of resultats.entries()) {
      if (r.status === 'fulfilled') offres.push(...r.value);
      else options.journal?.push({ source: `SmartRecruiters/${lot[k].board}`, raison: String(r.reason), cause: 'inconnue' });
    }
  }
  return offres;
}
