export const config = { runtime: 'edge', regions: ['cdg1'] };
import { kvGet, kvSet, checkRateLimit, getAllowedOrigin } from '../_lib/auth.js';
import { isJobLive, expiresAt, toPublicJob } from '../_lib/employer.js';

// Self-service management of an employer offer via its capability token.
//   GET  ?token=…            → offer status + public fields
//   POST { token, action }   → action: 'close' | 'renew'
const VALID_ACTIONS = ['close', 'renew'];

function findByToken(jobs, token) {
  const idx = jobs.findIndex(j => j.manageToken && j.manageToken === token);
  return { idx, job: idx >= 0 ? jobs[idx] : null };
}

function summarize(job) {
  return { ...toPublicJob(job), live: isJobLive(job), expiresAt: expiresAt(job) };
}

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
    headers: { ...H, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'employer_manage', 60, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez plus tard.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  // Extract + validate the token (opaque 16-64 char hex-ish string).
  let token = '';
  let action = '';
  if (req.method === 'GET') {
    token = new URL(req.url).searchParams.get('token') || '';
  } else if (req.method === 'POST') {
    const bodyText = await req.text();
    if (bodyText.length > 500) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
    let body;
    try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }
    token = String(body.token || '');
    action = String(body.action || '');
  } else {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });
  }

  if (!/^[a-z0-9]{16,64}$/i.test(token)) {
    return new Response(JSON.stringify({ error: 'Lien de gestion invalide' }), { status: 400, headers: H });
  }

  const stored = await kvGet('employer_jobs');
  const jobs = Array.isArray(stored) ? stored : [];
  const { idx, job } = findByToken(jobs, token);
  if (!job) return new Response(JSON.stringify({ error: 'Offre introuvable ou expirée' }), { status: 404, headers: H });

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, job: summarize(job) }), { status: 200, headers: H });
  }

  // POST — mutate immutably.
  if (!VALID_ACTIONS.includes(action)) {
    return new Response(JSON.stringify({ error: 'Action invalide' }), { status: 400, headers: H });
  }
  const patch = action === 'close'
    ? { ...job, status: 'closed' }
    : { ...job, status: 'active', renewedAt: new Date().toISOString() };
  const updated = jobs.map((j, i) => (i === idx ? patch : j));
  await kvSet('employer_jobs', updated);

  return new Response(JSON.stringify({ ok: true, action, job: summarize(patch) }), { status: 200, headers: H });
}
