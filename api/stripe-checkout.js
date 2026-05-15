export const config = { runtime: 'edge' };
import { checkRateLimit, getAllowedOrigin, validateEmail, getCurrentUser } from './_lib/auth.js';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const PRICE_IDS = {
  pro:             process.env.STRIPE_PRICE_PRO             || 'price_pro_monthly',
  intensif:        process.env.STRIPE_PRICE_INTENSIF        || 'price_intensif_monthly',
  pro_annual:      process.env.STRIPE_PRICE_PRO_ANNUAL      || null,
  intensif_annual: process.env.STRIPE_PRICE_INTENSIF_ANNUAL || null,
};

// Headers set dynamically based on origin
function getHeaders(req) {
  const origin = getAllowedOrigin(req);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

export default async function handler(req) {
  const headers = getHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers });

  // Rate limit: max 5 checkout attempts per IP per hour
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'stripe', 5, 3600);
  if (!rl.allowed)
    return new Response(JSON.stringify({ error: 'Trop de tentatives. Réessayez dans 1 heure.' }), { status: 429, headers: { ...headers, 'Retry-After': '3600' } });

  if (!STRIPE_SECRET) {
    // Demo mode — return a mock checkout URL
    return new Response(JSON.stringify({
      url: 'https://emploia.fr/app?plan=demo',
      demo: true,
      message: 'Stripe non configuré — contactez contact@emploia.fr pour souscrire'
    }), { status: 200, headers });
  }

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers }); }

  const { plan } = body;
  if (!plan || !(plan in PRICE_IDS)) return new Response(JSON.stringify({ error: 'Plan invalide' }), { status: 400, headers });
  const priceId = PRICE_IDS[plan];
  if (!priceId) return new Response(JSON.stringify({ error: 'Plan annuel non configuré' }), { status: 400, headers });

  // Prefer authenticated user email over body-supplied email to prevent spoofing
  const sessionUser = await getCurrentUser(req);
  const resolvedEmail = sessionUser?.email || (validateEmail(body.email || '') ? body.email : null);

  try {
    const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        success_url: `${process.env.NEXT_PUBLIC_URL || 'https://emploia.fr'}/app?success=1`,
        cancel_url: `${process.env.NEXT_PUBLIC_URL || 'https://emploia.fr'}/#pricing`,
        ...(resolvedEmail ? { customer_email: resolvedEmail } : {}),
        'metadata[plan]': plan,
        locale: 'fr',
        'payment_method_types[0]': 'card',
        'subscription_data[trial_period_days]': '7',
      }),
    });

    const sessionData = await session.json();
    if (!session.ok) throw new Error(sessionData.error?.message || 'Stripe error');

    return new Response(JSON.stringify({ url: sessionData.url }), { status: 200, headers });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return new Response(JSON.stringify({ error: 'Erreur paiement' }), { status: 500, headers });
  }
}
