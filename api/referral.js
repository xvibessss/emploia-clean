export const config = { runtime: 'edge', regions: ['cdg1'] };
import { getCurrentUser, kvGet, getAllowedOrigin, checkRateLimit } from './_lib/auth.js';
import { createReferralCode } from './_lib/referral.js';
import { trackEvent } from './_lib/track.js';

// GET /api/referral — code de parrainage de l'utilisateur connecté (créé au
// besoin) et ses compteurs.
//
// Il n'y a plus de POST. Le crédit d'un parrainage n'arrive qu'au moment où un
// compte est créé, côté serveur (`_lib/referral.js`, appelé par register.js et
// par le callback Google) : un endpoint public qui crédite sur la foi d'une
// adresse e-mail permettait de s'offrir des mois de Pro sans parrainer
// personne.
//
// KV :
//   ref:{code}        → { userId, email, signups: [email,...], monthsEarned, createdAt }
//   refcode:{userId}  → code
//   referred:{email}  → code qui a parrainé ce compte (verrou « une fois »)

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
  });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: { ...H, Allow: 'GET, OPTIONS' } });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'referral', 30, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

  let code = await kvGet(`refcode:${user.id}`);
  if (!code) {
    code = await createReferralCode(user);
    if (!code) return new Response(JSON.stringify({ error: 'Service momentanément indisponible' }), { status: 503, headers: H });
    trackEvent('referral_code_created').catch(() => {});
  }

  const refData = await kvGet(`ref:${code}`) || {};
  return new Response(JSON.stringify({
    code,
    link: `https://emploia.eu/?ref=${code}`,
    signups: (refData.signups || []).length,
    monthsEarned: refData.monthsEarned || 0,
  }), { status: 200, headers: H });
}
