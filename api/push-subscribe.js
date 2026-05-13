export const config = { runtime: 'edge' };
import { getAllowedOrigin, getCurrentUser, kvGet, kvSet } from './_lib/auth.js';

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
    headers: { ...H, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });

  // GET: return VAPID public key for client subscription
  if (req.method === 'GET') {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) return new Response(JSON.stringify({ error: 'Push non configuré' }), { status: 503, headers: H });
    return new Response(JSON.stringify({ publicKey }), { status: 200, headers: H });
  }

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: H });

  // POST: save push subscription
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }
    const sub = body.subscription;
    // Only accept known Web Push Subscription fields — reject arbitrary keys
    if (!sub?.endpoint || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://')) {
      return new Response(JSON.stringify({ error: 'Subscription invalide' }), { status: 400, headers: H });
    }
    const authKey  = typeof sub.keys?.auth === 'string'   ? sub.keys.auth.slice(0, 128)   : null;
    const p256dhKey = typeof sub.keys?.p256dh === 'string' ? sub.keys.p256dh.slice(0, 256) : null;
    const sanitizedSub = { endpoint: sub.endpoint.slice(0, 500), keys: { auth: authKey, p256dh: p256dhKey }, createdAt: Date.now() };

    const key = `push:${user.email}`;
    const existing = await kvGet(key) || [];
    const filtered = existing.filter(s => s.endpoint !== sanitizedSub.endpoint);
    filtered.push(sanitizedSub);
    await kvSet(key, filtered.slice(-5));
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: H });
  }

  // DELETE: remove subscription (unsubscribe)
  if (req.method === 'DELETE') {
    let body;
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    const key = `push:${user.email}`;
    const existing = await kvGet(key) || [];
    await kvSet(key, existing.filter(s => s.endpoint !== endpoint));
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: H });
  }

  return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });
}
