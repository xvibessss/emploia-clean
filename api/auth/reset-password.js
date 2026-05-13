export const config = { runtime: 'edge' };
import { kvGet, kvSet, kvDel, signToken, setCookieHeader, checkRateLimit, getAllowedOrigin, hashPassword, generateSalt } from '../_lib/auth.js';

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
    headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'reset-password', 5, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: H }); }

  const { token, password } = body;
  if (!token || !password) return new Response(JSON.stringify({ error: 'Token et mot de passe requis' }), { status: 400, headers: H });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 400, headers: H });
  }
  if (password.length < 8) return new Response(JSON.stringify({ error: 'Mot de passe trop court (8 caractères min)' }), { status: 400, headers: H });
  if (password.length > 128) return new Response(JSON.stringify({ error: 'Mot de passe trop long' }), { status: 400, headers: H });
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return new Response(JSON.stringify({ error: 'Le mot de passe doit contenir une majuscule et un chiffre' }), { status: 400, headers: H });
  }

  const resetData = await kvGet(`reset:${token}`);
  if (!resetData || Date.now() - resetData.createdAt > 3_600_000) {
    return new Response(JSON.stringify({ error: 'Ce lien est invalide ou expiré. Demandez-en un nouveau.' }), { status: 400, headers: H });
  }

  const user = await kvGet(`user:${resetData.email}`);
  if (!user) return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), { status: 404, headers: H });

  const salt = await generateSalt();
  const passwordHash = await hashPassword(password, salt);
  await kvSet(`user:${resetData.email}`, { ...user, passwordHash, passwordSalt: salt });
  await kvDel(`reset:${token}`);

  const authToken = await signToken(user.id);
  const safeUser = { id: user.id, name: user.name, email: user.email, plan: user.plan || 'free' };

  return new Response(JSON.stringify({ success: true, user: safeUser }), {
    status: 200,
    headers: { ...H, 'Set-Cookie': setCookieHeader(authToken) },
  });
}
