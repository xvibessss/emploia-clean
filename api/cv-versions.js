export const config = { runtime: 'edge' };
import { getCurrentUser, kvGet, kvSet, getAllowedOrigin, checkRateLimit } from './_lib/auth.js';

const FREE_MAX  = 3;
const PRO_MAX   = 20;
const CONTENT_MAX = 50000;

function headers(origin) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = headers(origin);

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'cv-versions', 60, 60);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '60' } });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

  const isPro = user.plan === 'pro' || user.plan === 'intensif';
  const maxVersions = isPro ? PRO_MAX : FREE_MAX;
  const kvKey = `cvversions:${user.email}`;
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (req.method === 'GET') {
    const versions = await kvGet(kvKey) || [];
    return new Response(JSON.stringify({ versions, maxVersions, plan: user.plan || 'free' }), { status: 200, headers: H });
  }

  if (req.method === 'POST') {
    const bodyText = await req.text();
    if (bodyText.length > CONTENT_MAX + 2000) return new Response(JSON.stringify({ error: 'Contenu trop long' }), { status: 413, headers: H });
    let body;
    try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

    const name    = String(body.name    || 'CV sans titre').slice(0, 100).trim();
    const content = String(body.content || '').slice(0, CONTENT_MAX);
    const type    = ['cv', 'letter', 'other'].includes(body.type) ? body.type : 'cv';

    if (!content) return new Response(JSON.stringify({ error: 'Contenu requis' }), { status: 400, headers: H });

    const versions = await kvGet(kvKey) || [];
    if (versions.length >= maxVersions) {
      return new Response(JSON.stringify({
        error: `Maximum ${maxVersions} version${maxVersions > 1 ? 's' : ''}${!isPro ? ' (passez Pro pour 20 versions)' : ''}`,
      }), { status: 402, headers: H });
    }

    const version = {
      id: crypto.randomUUID(),
      name,
      content,
      type,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      charCount: content.length,
    };
    versions.unshift(version);
    await kvSet(kvKey, versions, 86400 * 365);
    return new Response(JSON.stringify({ version, total: versions.length }), { status: 201, headers: H });
  }

  if (req.method === 'PATCH') {
    if (!id) return new Response(JSON.stringify({ error: 'id requis' }), { status: 400, headers: H });
    let body;
    try { body = JSON.parse(await req.text()); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

    const versions = await kvGet(kvKey) || [];
    const idx = versions.findIndex(v => v.id === id);
    if (idx === -1) return new Response(JSON.stringify({ error: 'Version introuvable' }), { status: 404, headers: H });

    if (body.name    !== undefined) versions[idx].name    = String(body.name).slice(0, 100).trim();
    if (body.content !== undefined) {
      versions[idx].content  = String(body.content).slice(0, CONTENT_MAX);
      versions[idx].charCount = versions[idx].content.length;
    }
    versions[idx].updatedAt = new Date().toISOString();

    await kvSet(kvKey, versions, 86400 * 365);
    return new Response(JSON.stringify({ version: versions[idx] }), { status: 200, headers: H });
  }

  if (req.method === 'DELETE') {
    if (!id) return new Response(JSON.stringify({ error: 'id requis' }), { status: 400, headers: H });
    const versions = await kvGet(kvKey) || [];
    const filtered = versions.filter(v => v.id !== id);
    if (filtered.length === versions.length) return new Response(JSON.stringify({ error: 'Version introuvable' }), { status: 404, headers: H });
    await kvSet(kvKey, filtered, 86400 * 365);
    return new Response(JSON.stringify({ ok: true, total: filtered.length }), { status: 200, headers: H });
  }

  return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });
}
