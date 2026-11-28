export const config = { runtime: 'edge', regions: ['iad1'] };
// La Bonne Boite v2 (France Travail) — entreprises à fort potentiel d'embauche
// dans les 6 prochains mois, pour les candidatures spontanées.
//
//   GET /api/ft-entreprises?job=développeur web&city=Bordeaux&postcode=33000
//   GET /api/ft-entreprises?rome=M1805&latitude=44.84&longitude=-0.58&distance=20
//
// Licence Etalab : la source est citée dans chaque réponse.
import { checkRateLimit, kvGet, kvSet, getAllowedOrigin } from './_lib/auth.js';
import { appelerApiFT } from './_lib/france-travail.js';

const PARAMS_AUTORISES = [
  'job', 'rome', 'naf', 'city', 'citycode', 'postcode', 'department', 'department_number',
  'region', 'latitude', 'longitude', 'distance', 'sort_by', 'sort_direction', 'page', 'page_size',
];
const PARAMS_LIEU = ['city', 'citycode', 'postcode', 'department', 'department_number', 'region', 'latitude'];
const CACHE_SECONDES = 900;

export function construireRecherche(searchParams) {
  const params = new URLSearchParams();
  for (const k of PARAMS_AUTORISES) {
    const v = (searchParams.get(k) || '').trim().slice(0, 120);
    if (v) params.set(k, v);
  }
  if (!params.get('job') && !params.get('rome')) return { erreur: 'Paramètre « job » (métier) ou « rome » requis' };
  if (!PARAMS_LIEU.some(k => params.get(k))) return { erreur: 'Un lieu est requis (city, postcode, department ou latitude/longitude)' };
  const taille = Math.min(Math.max(parseInt(params.get('page_size'), 10) || 20, 1), 50);
  params.set('page_size', String(taille));
  return { params };
}

export function normaliserEntreprise(e) {
  return {
    siret: e.siret || null,
    nom: e.office_name || e.company_name || null,
    raisonSociale: e.company_name || null,
    ville: e.city || null,
    codePostal: e.postcode || null,
    departement: e.department || null,
    secteur: e.naf_label || null,
    effectif: e.headcount_min != null ? `${e.headcount_min}${e.headcount_max != null ? '–' + e.headcount_max : '+'}` : null,
    potentielEmbauche: e.hiring_potential ?? null,
    fortPotentiel: !!e.is_high_potential,
    rome: e.rome || null,
  };
}

export default async function handler(req) {
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Vary': 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'ft-entreprises', 60, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const { params, erreur } = construireRecherche(new URL(req.url).searchParams);
  if (erreur) return new Response(JSON.stringify({ error: erreur }), { status: 400, headers: H });

  params.sort();
  const cleCache = `ft:lbb:${params}`;
  const enCache = await kvGet(cleCache).catch(() => null);
  if (enCache) return new Response(JSON.stringify(enCache), { status: 200, headers: { ...H, 'Cache-Control': 'public, s-maxage=900' } });

  const { donnees, cause, diagnostic } = await appelerApiFT('labonneboite', `/labonneboite/v2/recherche?${params}`, {
    clientId: process.env.FRANCE_TRAVAIL_CLIENT_ID,
    clientSecret: process.env.FRANCE_TRAVAIL_CLIENT_SECRET,
    kvGet, kvSet,
  });

  if (cause) {
    console.warn(`[ft-entreprises] La Bonne Boite indisponible : ${cause}${diagnostic ? ' — ' + diagnostic : ''}`);
    return new Response(JSON.stringify({ error: 'Source indisponible', cause, entreprises: [] }), { status: 502, headers: { ...H, 'Cache-Control': 'no-store' } });
  }

  const items = Array.isArray(donnees?.items) ? donnees.items : [];
  const corps = {
    total: Number.isFinite(donnees?.hits) ? donnees.hits : items.length,
    entreprises: items.map(normaliserEntreprise),
    source: 'La Bonne Boite – France Travail (licence Etalab)',
  };
  kvSet(cleCache, corps, CACHE_SECONDES).catch(() => {});
  return new Response(JSON.stringify(corps), { status: 200, headers: { ...H, 'Cache-Control': 'public, s-maxage=900' } });
}
