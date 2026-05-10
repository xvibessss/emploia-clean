export const config = { runtime: 'edge' };
import { getCurrentUser, kvGet, kvSet, getAllowedOrigin, checkRateLimit } from './_lib/auth.js';

// KV key: alerts:{email} → { keywords, location, type, frequency, active }
// GET → { alerts }
// POST → { keywords, location, type, frequency } → save/update
// DELETE → remove alert

export default async function handler(req) {
  const origin = getAllowedOrigin(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    }});
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'alerts', 30, 60);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit' }), {
      status: 429, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
    });
  }

  const user = await getCurrentUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), {
      status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
    });
  }

  const kvKey = `alerts:${user.email}`;

  if (req.method === 'GET') {
    const alerts = await kvGet(kvKey) || [];
    return new Response(JSON.stringify({ alerts }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
    });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { body = {}; }

    const { keywords = '', location = '', type = 'all', frequency = 'daily' } = body;
    if (!keywords.trim()) {
      return new Response(JSON.stringify({ error: 'keywords requis' }), {
        status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
      });
    }

    const alerts = await kvGet(kvKey) || [];
    if (alerts.length >= 10) {
      return new Response(JSON.stringify({ error: 'Maximum 10 alertes' }), {
        status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
      });
    }

    const alert = {
      id: Date.now().toString(36),
      keywords: keywords.trim().slice(0, 100),
      location: location.trim().slice(0, 60),
      type,
      frequency,
      active: true,
      createdAt: new Date().toISOString(),
    };
    alerts.push(alert);
    await kvSet(kvKey, alerts, 86400 * 365);

    return new Response(JSON.stringify({ alert, total: alerts.length }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
    });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'id requis' }), {
        status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
      });
    }

    const alerts = await kvGet(kvKey) || [];
    const filtered = alerts.filter(a => a.id !== id);
    await kvSet(kvKey, filtered, 86400 * 365);

    return new Response(JSON.stringify({ ok: true, total: filtered.length }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
  });
}
