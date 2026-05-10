export const config = { runtime: 'edge' };
import { getCurrentUser, kvGet, kvSet, getAllowedOrigin, checkRateLimit } from './_lib/auth.js';

function H(origin) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const headers = H(origin);

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'saved-jobs', 60, 60);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers });

  const key = `saved:${user.email}`;
  const url = new URL(req.url);
  const jobId = url.searchParams.get('id');

  if (req.method === 'GET') {
    const saved = await kvGet(key) || [];
    return new Response(JSON.stringify({ saved, total: saved.length }), { status: 200, headers });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers }); }
    if (!body.id || !body.title) return new Response(JSON.stringify({ error: 'id et title requis' }), { status: 400, headers });

    const saved = await kvGet(key) || [];
    if (saved.find(j => j.id === body.id)) {
      return new Response(JSON.stringify({ saved, already: true }), { status: 200, headers });
    }
    if (saved.length >= 200) saved.shift();

    const job = {
      id: String(body.id).slice(0, 100),
      title: String(body.title).slice(0, 200),
      company: String(body.company || '').slice(0, 100),
      location: String(body.location || '').slice(0, 100),
      type: String(body.type || '').slice(0, 30),
      salary: body.salary ? String(body.salary).slice(0, 80) : null,
      url: body.url ? String(body.url).slice(0, 500) : null,
      source: String(body.source || '').slice(0, 30),
      savedAt: new Date().toISOString(),
    };
    saved.push(job);
    await kvSet(key, saved);
    return new Response(JSON.stringify({ saved, added: true }), { status: 200, headers });
  }

  if (req.method === 'DELETE') {
    if (!jobId) return new Response(JSON.stringify({ error: 'id requis' }), { status: 400, headers });
    const saved = (await kvGet(key) || []).filter(j => j.id !== jobId);
    await kvSet(key, saved);
    return new Response(JSON.stringify({ saved, removed: true }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers });
}
