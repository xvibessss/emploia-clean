export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser, kvSet, kvIncr } from './_lib/auth.js';

const ALLOWED_TYPES = ['cv', 'cover-letter', 'ats-score', 'interview', 'salary', 'linkedin', 'follow-up', 'debrief', 'tools'];

function getHeaders(req) {
  const origin = getAllowedOrigin(req);
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export default async function handler(req) {
  const headers = getHeaders(req);
  const origin = getAllowedOrigin(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers });
  }

  const user = await getCurrentUser(req).catch(() => null);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentification requise' }), { status: 401, headers });
  }

  const rl = await checkRateLimit(`user:${user.email}`, 'feedback', 20, 3600);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Trop de feedbacks. Réessayez plus tard.' }), { status: 429, headers: { ...headers, 'Retry-After': '3600' } });
  }

  const bodyText = await req.text();
  if (bodyText.length > 1000) {
    return new Response(JSON.stringify({ error: 'Payload trop long' }), { status: 413, headers });
  }

  let body;
  try { body = JSON.parse(bodyText); }
  catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers }); }

  const type = String(body.type || '').toLowerCase().trim();
  const rating = String(body.rating || '').toLowerCase().trim();
  const comment = body.comment ? sanitizeString(String(body.comment), 500).trim() : null;

  if (!ALLOWED_TYPES.includes(type)) {
    return new Response(JSON.stringify({ error: 'Type invalide' }), { status: 400, headers });
  }
  if (rating !== 'up' && rating !== 'down') {
    return new Response(JSON.stringify({ error: 'Rating doit être "up" ou "down"' }), { status: 400, headers });
  }

  const ts = Date.now();
  const entry = { type, rating, comment, email: user.email, plan: user.plan || 'free', ts };

  await Promise.all([
    kvSet(`feedback:entry:${user.email}:${ts}`, entry, 90 * 86400),
    kvIncr(`feedback:stat:${type}:${rating}`),
    kvIncr(`feedback:stat:all:${rating}`),
  ]);

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
