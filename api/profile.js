export const config = { runtime: 'edge' };
import { getCurrentUser, kvGet, kvSet, getAllowedOrigin, checkRateLimit } from './_lib/auth.js';

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H, 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
  });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

  if (req.method === 'GET') {
    const profile = await kvGet(`profile:${user.email}`) || {};
    return new Response(JSON.stringify(profile), { status: 200, headers: H });
  }

  if (req.method === 'PUT') {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = await checkRateLimit(`ip:${ip}`, 'profile', 30, 3600);
    if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: H });

    let body;
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

    // Only allow known fields
    const allowed = ['firstName','lastName','title','location','phone','summary','linkedin','portfolio','skills','experience','education','languages','profileText'];
    const profile = {};
    for (const k of allowed) if (body[k] !== undefined) profile[k] = body[k];
    profile.updatedAt = new Date().toISOString();

    await kvSet(`profile:${user.email}`, profile);
    return new Response(JSON.stringify({ success: true, profile }), { status: 200, headers: H });
  }

  return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });
}
