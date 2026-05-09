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
    headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'stripe-portal', 5, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes.' }), { status: 429, headers: H });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

  if (!STRIPE_SECRET) return new Response(JSON.stringify({ error: 'Stripe non configuré' }), { status: 503, headers: H });

  if (!user.stripeCustomerId) {
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

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: H });
  } catch (err) {
    console.error('Stripe portal error:', err);
    return new Response(JSON.stringify({ error: 'Erreur portail Stripe' }), { status: 500, headers: H });
  }
}
