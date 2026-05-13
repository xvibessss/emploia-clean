export const config = { runtime: 'edge' };
import {
  getCurrentUser, kvGet, kvSet, verifyPassword, hashPassword, generateSalt,
  getAllowedOrigin, checkRateLimit,
} from '../_lib/auth.js';

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
    headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'change-password', 5, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de tentatives. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

  // Google-only accounts have no local password
  if (!user.passwordHash) {
    return new Response(JSON.stringify({ error: 'Ce compte utilise la connexion Google — aucun mot de passe à modifier.' }), { status: 400, headers: H });
  }

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: H }); }

  const currentPassword = body.currentPassword || '';
  const newPassword     = body.newPassword     || '';

  if (!currentPassword) return new Response(JSON.stringify({ error: 'Mot de passe actuel requis' }), { status: 400, headers: H });
  if (!newPassword)     return new Response(JSON.stringify({ error: 'Nouveau mot de passe requis' }), { status: 400, headers: H });
  if (newPassword.length < 8)   return new Response(JSON.stringify({ error: 'Nouveau mot de passe trop court (8 caractères min)' }), { status: 400, headers: H });
  if (newPassword.length > 128) return new Response(JSON.stringify({ error: 'Nouveau mot de passe trop long' }), { status: 400, headers: H });
  if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return new Response(JSON.stringify({ error: 'Le nouveau mot de passe doit contenir une majuscule et un chiffre' }), { status: 400, headers: H });
  }

  // Verify current password
  const valid = await verifyPassword(currentPassword, user.passwordHash, user.passwordSalt);
  if (!valid) return new Response(JSON.stringify({ error: 'Mot de passe actuel incorrect' }), { status: 403, headers: H });

  // Don't allow reusing the same password
  const samePassword = await verifyPassword(newPassword, user.passwordHash, user.passwordSalt);
  if (samePassword) return new Response(JSON.stringify({ error: 'Le nouveau mot de passe doit être différent de l\'actuel' }), { status: 400, headers: H });

  const salt = await generateSalt();
  const passwordHash = await hashPassword(newPassword, salt);
  const fullUser = await kvGet(`user:${user.email}`);
  await kvSet(`user:${user.email}`, { ...fullUser, passwordHash, passwordSalt: salt, passwordChangedAt: new Date().toISOString() });

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: H });
}
