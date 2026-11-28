export const config = { runtime: 'edge', regions: ['fra1'] };
// ROMEO v2 (France Travail) — rattache un intitulé libre (« chargé de com
// digitale », une ligne d'expérience d'un CV) à une appellation du ROME 4.0.
//
//   POST /api/ft-rome  { "intitules": ["chargé de com digitale"], "contexte": "agence de publicité" }
//
// Limite ROMEO : 20 intitulés par appel. Le résultat sert à préciser les
// recherches (code ROME) et le vocabulaire des CV ; il n'est pas conservé.
import { checkRateLimit, kvGet, kvSet, getAllowedOrigin, sanitizeString } from './_lib/auth.js';
import { appelerApiFT } from './_lib/france-travail.js';

export const MAX_INTITULES = 20;

export function construirePrediction(body) {
  const bruts = Array.isArray(body?.intitules) ? body.intitules : [body?.intitule];
  const intitules = bruts
    .filter(t => typeof t === 'string' && t.trim())
    .map(t => sanitizeString(t.trim(), 200))
    .slice(0, MAX_INTITULES);
  if (!intitules.length) return { erreur: 'Champ « intitules » requis' };
  const contexte = typeof body?.contexte === 'string' && body.contexte.trim() ? sanitizeString(body.contexte.trim(), 300) : null;
  const nb = Math.min(Math.max(parseInt(body?.nbResultats, 10) || 3, 1), 25);
  return {
    payload: {
      appellations: intitules.map((intitule, i) => ({ intitule, identifiant: String(i + 1), ...(contexte ? { contexte } : {}) })),
      options: { nomAppelant: 'emploia', nbResultats: nb },
    },
  };
}

export function normaliserPredictions(donnees) {
  return (Array.isArray(donnees) ? donnees : []).map(p => ({
    intitule: p.intitule,
    metiers: (Array.isArray(p.metiersRome) ? p.metiersRome : []).map(m => ({
      appellation: m.libelleAppellation,
      codeAppellation: m.codeAppellation,
      metier: m.libelleRome,
      codeRome: m.codeRome,
      score: m.scorePrediction,
    })),
  }));
}

export default async function handler(req) {
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'ft-rome', 30, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const texte = await req.text();
  if (texte.length > 10000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(texte); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const { payload, erreur } = construirePrediction(body);
  if (erreur) return new Response(JSON.stringify({ error: erreur }), { status: 400, headers: H });

  const { donnees, cause, diagnostic } = await appelerApiFT('romeo', '/romeo/v2/predictionMetiers', {
    clientId: process.env.FRANCE_TRAVAIL_CLIENT_ID,
    clientSecret: process.env.FRANCE_TRAVAIL_CLIENT_SECRET,
    kvGet, kvSet,
    init: { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) },
  });

  if (cause) {
    console.warn(`[ft-rome] ROMEO indisponible : ${cause}${diagnostic ? ' — ' + diagnostic : ''}`);
    return new Response(JSON.stringify({ error: 'Source indisponible', cause, resultats: [] }), { status: 502, headers: H });
  }
  return new Response(JSON.stringify({ resultats: normaliserPredictions(donnees), source: 'ROMEO – France Travail' }), { status: 200, headers: H });
}
