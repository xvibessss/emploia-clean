export const config = { runtime: 'edge' };
import { getCurrentUser, kvGet, kvSet, getAllowedOrigin, checkRateLimit } from './_lib/auth.js';

const STATUSES = ['wishlist', 'applied', 'interview', 'offer', 'rejected'];

function h(origin) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = h(origin);

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'applications', 120, 60);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: H });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

  const key = `apps:${user.email}`;
  const id = new URL(req.url).searchParams.get('id');

  if (req.method === 'GET') {
    const apps = await kvGet(key) || [];
    return new Response(JSON.stringify({ applications: apps }), { status: 200, headers: H });
  }

  if (req.method === 'POST') {
    const bodyText = await req.text();
    if (bodyText.length > 10000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
    let body;
    try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

    const rawUrl = String(body.url || '').slice(0, 500);
    const apps = await kvGet(key) || [];
    const app = {
      id: crypto.randomUUID(),
      jobTitle: String(body.jobTitle || '').slice(0, 200),
      company:  String(body.company  || '').slice(0, 200),
      url:      /^https?:\/\//i.test(rawUrl) ? rawUrl : '',
      location: String(body.location || '').slice(0, 200),
      salary:   String(body.salary   || '').slice(0, 100),
      status:   STATUSES.includes(body.status) ? body.status : 'wishlist',
      notes:    String(body.notes    || '').slice(0, 2000),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    apps.unshift(app);
    await kvSet(key, apps.slice(0, 500));
    return new Response(JSON.stringify({ application: app }), { status: 201, headers: H });
  }

  if (req.method === 'PATCH') {
    if (!id) return new Response(JSON.stringify({ error: 'id requis' }), { status: 400, headers: H });
    let body;
    try { body = JSON.parse(await req.text()); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

    const apps = await kvGet(key) || [];
    const idx = apps.findIndex(a => a.id === id);
    if (idx === -1) return new Response(JSON.stringify({ error: 'Introuvable' }), { status: 404, headers: H });

    if (body.status   !== undefined && STATUSES.includes(body.status)) apps[idx].status = body.status;
    if (body.notes    !== undefined) apps[idx].notes    = String(body.notes).slice(0, 2000);
    if (body.jobTitle !== undefined) apps[idx].jobTitle = String(body.jobTitle).slice(0, 200);
    if (body.company  !== undefined) apps[idx].company  = String(body.company).slice(0, 200);
    if (body.url      !== undefined) { const u = String(body.url).slice(0,500); apps[idx].url = /^https?:\/\//i.test(u) ? u : ''; }
    if (body.location !== undefined) apps[idx].location = String(body.location).slice(0, 200);
    if (body.salary   !== undefined) apps[idx].salary   = String(body.salary).slice(0, 100);
    apps[idx].updatedAt = Date.now();

    await kvSet(key, apps);
    return new Response(JSON.stringify({ application: apps[idx] }), { status: 200, headers: H });
  }

  if (req.method === 'DELETE') {
    if (!id) return new Response(JSON.stringify({ error: 'id requis' }), { status: 400, headers: H });
    const apps = await kvGet(key) || [];
    await kvSet(key, apps.filter(a => a.id !== id));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: H });
  }

  return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });
}
