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

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (req.method === 'GET') {
    const rl = await checkRateLimit(`ip:${ip}`, 'profile-get', 120, 60);
    if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '60' } });
    const profile = await kvGet(`profile:${user.email}`) || {};
    return new Response(JSON.stringify(profile), { status: 200, headers: H });
  }

  if (req.method === 'PUT') {
    const rl = await checkRateLimit(`ip:${ip}`, 'profile-put', 30, 3600);
    if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

    const bodyText = await req.text();
    if (bodyText.length > 50000) return new Response(JSON.stringify({ error: 'Profil trop volumineux' }), { status: 413, headers: H });
    let body;
    try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

    const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : undefined;
    const profile = {};

    // Scalar string fields
    const scalarFields = { firstName: 100, lastName: 100, title: 200, location: 200, phone: 30, summary: 3000, profileText: 5000 };
    for (const [k, max] of Object.entries(scalarFields)) {
      if (body[k] !== undefined) { const v = str(body[k], max); if (v !== undefined) profile[k] = v; }
    }
    // URL fields — only allow http(s)://
    for (const k of ['linkedin', 'portfolio']) {
      if (body[k] !== undefined) {
        const v = str(body[k], 300);
        if (v === '' || v === undefined) { profile[k] = ''; continue; }
        if (/^https?:\/\//i.test(v)) profile[k] = v;
        // else silently drop malicious values (javascript:, data:, etc.)
      }
    }

    // Array fields — sanitize each entry
    if (Array.isArray(body.skills)) {
      profile.skills = body.skills.slice(0, 50).map(s => typeof s === 'string' ? s.slice(0, 100) : (typeof s === 'object' && s ? { name: String(s.name||'').slice(0,100), level: Math.min(100, Math.max(0, parseInt(s.level)||0)) } : null)).filter(Boolean);
    }
    if (Array.isArray(body.experience)) {
      profile.experience = body.experience.slice(0, 20).map(e => typeof e === 'object' && e ? {
        title: String(e.title||'').slice(0,200), company: String(e.company||'').slice(0,200),
        date: String(e.date||'').slice(0,100), desc: String(e.desc||'').slice(0,2000),
      } : null).filter(Boolean);
    }
    if (Array.isArray(body.education)) {
      profile.education = body.education.slice(0, 10).map(e => typeof e === 'object' && e ? {
        title: String(e.title||'').slice(0,200), school: String(e.school||'').slice(0,200),
        date: String(e.date||'').slice(0,100), desc: String(e.desc||'').slice(0,1000),
      } : null).filter(Boolean);
    }
    if (Array.isArray(body.languages)) {
      profile.languages = body.languages.slice(0, 10).map(l => typeof l === 'object' && l ? { name: String(l.name||'').slice(0,100), level: String(l.level||'').slice(0,50) } : null).filter(Boolean);
    }

    profile.updatedAt = new Date().toISOString();
    await kvSet(`profile:${user.email}`, profile);
    return new Response(JSON.stringify({ success: true, profile }), { status: 200, headers: H });
  }

  return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });
}
