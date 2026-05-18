export const config = { runtime: 'edge' };
import { getCurrentUser, kvGet, kvSet, getAllowedOrigin, checkRateLimit, kvSadd, kvSrem } from './_lib/auth.js';

// KV key: alerts:{email} → { keywords, location, type, frequency, active }
// GET → { alerts }
// POST → { keywords, location, type, frequency } → save/update
// DELETE → remove alert

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
    headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'alerts', 30, 60);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Rate limit' }), {
    status: 429, headers: { ...H, 'Retry-After': '60' },
  });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

  const kvKey = `alerts:${user.email}`;

  if (req.method === 'GET') {
    const alerts = await kvGet(kvKey) || [];
    const maxAlerts = (user.plan === 'pro' || user.plan === 'intensif') ? 50 : 10;
    return new Response(JSON.stringify({ alerts, maxAlerts, plan: user.plan || 'free' }), { status: 200, headers: H });
  }

  if (req.method === 'POST') {
    const bodyText = await req.text();
    if (bodyText.length > 2000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
    let body;
    try { body = JSON.parse(bodyText); } catch { body = {}; }

    const VALID_TYPES = ['all', 'CDI', 'CDD', 'Stage', 'Alternance', 'Freelance'];
    const VALID_FREQUENCIES = ['daily', 'weekly', 'realtime'];

    const rawKeywords  = String(body.keywords  || '').replace(/[\r\n]/g, ' ').trim();
    const rawLocation  = String(body.location  || '').replace(/[\r\n]/g, ' ').trim();
    const rawType      = String(body.type      || 'all');
    const rawFrequency = String(body.frequency || 'daily');

    if (!rawKeywords) return new Response(JSON.stringify({ error: 'keywords requis' }), { status: 400, headers: H });
    if (!VALID_TYPES.includes(rawType)) return new Response(JSON.stringify({ error: 'Type invalide' }), { status: 400, headers: H });
    if (!VALID_FREQUENCIES.includes(rawFrequency)) return new Response(JSON.stringify({ error: 'Fréquence invalide' }), { status: 400, headers: H });

    const alerts = await kvGet(kvKey) || [];
    const maxAlerts = (user.plan === 'pro' || user.plan === 'intensif') ? 50 : 10;
    if (alerts.length >= maxAlerts) return new Response(JSON.stringify({ error: `Maximum ${maxAlerts} alertes${maxAlerts === 10 ? ' (passez Pro pour 50 alertes)' : ''}` }), { status: 400, headers: H });

    const alert = {
      id: crypto.randomUUID(),
      keywords: rawKeywords.slice(0, 100),
      location: rawLocation.slice(0, 60),
      type: rawType,
      frequency: rawFrequency,
      active: true,
      createdAt: new Date().toISOString(),
    };
    alerts.push(alert);
    await Promise.all([
      kvSet(kvKey, alerts, 86400 * 365),
      kvSadd('alert_subscribers', user.email),
    ]);

    return new Response(JSON.stringify({ alert, total: alerts.length }), { status: 201, headers: H });
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'id requis' }), { status: 400, headers: H });

    const alerts = await kvGet(kvKey) || [];
    const filtered = alerts.filter(a => a.id !== id);
    const ops = [kvSet(kvKey, filtered, 86400 * 365)];
    if (!filtered.some(a => a.active)) ops.push(kvSrem('alert_subscribers', user.email));
    await Promise.all(ops);

    return new Response(JSON.stringify({ ok: true, total: filtered.length }), { status: 200, headers: H });
  }

  return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });
}
