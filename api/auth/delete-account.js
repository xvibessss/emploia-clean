export const config = { runtime: 'edge' };
import {
  getCurrentUser, kvGet, kvDel, kvSet, verifyPassword,
  getAllowedOrigin, checkRateLimit, COOKIE_NAME, kvSrem,
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
  const rl = await checkRateLimit(`ip:${ip}`, 'delete-account', 3, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de tentatives. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: H }); }

  // Require password confirmation for email/password accounts
  if (user.passwordHash) {
    const password = body.password || '';
    if (!password) return new Response(JSON.stringify({ error: 'Mot de passe requis pour supprimer le compte' }), { status: 400, headers: H });
    const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!valid) return new Response(JSON.stringify({ error: 'Mot de passe incorrect' }), { status: 403, headers: H });
  }

  // Cancel Stripe subscription if active
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (stripeSecret && user.subscriptionId) {
    fetch(`https://api.stripe.com/v1/subscriptions/${user.subscriptionId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeSecret}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => {});
  }

  // Remove from newsletter
  const newsletterKey = 'newsletter_subscribers';
  const subscribers = await kvGet(newsletterKey) || [];
  if (Array.isArray(subscribers) && subscribers.some(s => s.email === user.email)) {
    await kvSet(newsletterKey, subscribers.filter(s => s.email !== user.email));
  }

  // Get referral code to clean up
  const refCode = await kvGet(`refcode:${user.id}`);

  // Delete all user data in parallel (RGPD Article 17 — right to erasure)
  await Promise.allSettled([
    kvDel(`user:${user.email}`),
    kvDel(`userid:${user.id}`),
    kvDel(`profile:${user.email}`),
    kvDel(`apps:${user.email}`),
    kvDel(`gen:${user.email}`),
    kvDel(`alerts:${user.email}`),
    kvDel(`saved:${user.email}`),
    kvDel(`push:${user.email}`),
    kvDel(`refcode:${user.id}`),
    kvSrem('alert_subscribers', user.email),
    refCode ? kvDel(`ref:${refCode}`) : Promise.resolve(),
    user.stripeCustomerId ? kvDel(`stripe:${user.stripeCustomerId}`) : Promise.resolve(),
  ]);

  // Clear auth cookie
  const responseHeaders = new Headers(H);
  responseHeaders.set('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure`);

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: responseHeaders });
}
