export const config = { runtime: 'edge' };

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const PRICE_IDS = {
  pro: process.env.STRIPE_PRICE_PRO || 'price_pro_monthly',
  intensif: process.env.STRIPE_PRICE_INTENSIF || 'price_intensif_monthly',
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers });

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

  const { plan, email } = body;
  if (!plan || !PRICE_IDS[plan]) return new Response(JSON.stringify({ error: 'Plan invalide' }), { status: 400, headers });

  try {
    const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price]': PRICE_IDS[plan],
        'line_items[0][quantity]': '1',
        success_url: 'https://emploia.fr/app?success=1',
        cancel_url: 'https://emploia.fr/#pricing',
        ...(email ? { customer_email: email } : {}),
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
    return new Response(JSON.stringify({ error: 'Erreur paiement', details: String(err) }), { status: 500, headers });
  }
}
