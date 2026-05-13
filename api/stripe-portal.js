export const config = { runtime: 'edge' };
import { getCurrentUser, getAllowedOrigin, checkRateLimit } from './_lib/auth.js';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

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
  if (req.method !== 'POST' && req.method !== 'GET') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'stripe-portal', 5, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const user = await getCurrentUser(req);
  // GET from email links: redirect unauthenticated users to login first
  if (!user) {
    if (req.method === 'GET') {
      const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
      return new Response(null, { status: 302, headers: { Location: `${baseUrl}/app?action=billing` } });
    }
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });
  }

  if (!STRIPE_SECRET) return new Response(JSON.stringify({ error: 'Stripe non configuré' }), { status: 503, headers: H });

  if (!user.stripeCustomerId) {
    if (req.method === 'GET') {
      const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
      return new Response(null, { status: 302, headers: { Location: `${baseUrl}/app` } });
    }
    return new Response(JSON.stringify({ error: 'Aucun abonnement actif trouvé' }), { status: 404, headers: H });
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/app`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const session = await res.json();
    if (!res.ok) throw new Error(session.error?.message || 'Stripe error');

    // GET (email link): redirect directly to Stripe portal
    if (req.method === 'GET') {
      return new Response(null, { status: 302, headers: { Location: session.url } });
    }
    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: H });
  } catch (err) {
    console.error('Stripe portal error:', err);
    if (req.method === 'GET') {
      const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
      return new Response(null, { status: 302, headers: { Location: `${baseUrl}/app` } });
    }
    return new Response(JSON.stringify({ error: 'Erreur portail Stripe' }), { status: 500, headers: H });
  }
}
