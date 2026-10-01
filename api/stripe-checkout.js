export const config = { runtime: 'edge' };
import { checkRateLimit, getAllowedOrigin, validateEmail, getCurrentUser } from './_lib/auth.js';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

// Plan catalogue. `mode` decides the Stripe checkout type:
//   subscription → recurring, 7-day trial, card required (Pro)
//   payment      → one-off charge, NO trial, NO subscription created
//                  (Pack Campagne: 59 € for 3 months, non-renewing)
// Price IDs come from the environment; the code never needs their value.
//
// Intensif was retired from sale on 2026-09-30. It is absent here on purpose:
// no new checkout can create one. Existing subscribers are untouched — the
// webhook still maps STRIPE_PRICE_INTENSIF back to plan='intensif' so their
// renewals keep working, and the entitlement checks still honour the plan.
const PLANS = {
  pro:      { priceId: () => process.env.STRIPE_PRICE_PRO      || null, mode: 'subscription' },
  campagne: { priceId: () => process.env.STRIPE_PRICE_CAMPAGNE || null, mode: 'payment' },
};

// Creator / influencer codes. A code is a Stripe promotion code (10 € off the
// Pack Campagne: 59 € → 49 €) and doubles as the attribution key: the code is
// stamped into the session metadata so the webhook can credit the sale and
// api/affiliate.js can total the commission owed.
//
// Deliberately restricted to the Pack Campagne. Commissioning a monthly
// subscription means tracking churn and clawing commission back on refunds;
// a one-off payment settles in a single event and cannot be undone by a
// cancellation.
const AFFILIATE_CODE_RE = /^[A-Z0-9]{3,20}$/;

// Resolves a raw code to an active Stripe promotion code id. Returns null for
// anything unknown, expired, or out of redemptions — the caller then falls
// back to letting Stripe's own promo field handle it, so a typo degrades into
// "no discount", never into a failed checkout.
async function lookupPromotionCode(code) {
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/promotion_codes?code=${encodeURIComponent(code)}&active=true&limit=1`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET}` }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.id || null;
  } catch {
    return null;
  }
}

// Stripe's `code` filter matches the stored string exactly, but a creator code
// travels through a video caption and a viewer's keyboard: its case is not
// guaranteed at either end. A code created as `testAA` in the dashboard — which
// happened on 2026-10-01 — would never resolve against a typed `TESTAA`.
//
// So: one exact lookup on the canonical form, which is the normal path once
// codes are created upper case; on a miss, list the active codes once and match
// case-insensitively. Two requests at worst, and a viewer's capitalisation can
// no longer cost a creator a commission.
//
// The listing is capped at 100: beyond that a code past the first page would
// fall back to "no discount" rather than resolve. Well beyond the size of a
// hand-run creator programme, and it fails in the harmless direction.
async function resolvePromotionCode(canonical) {
  const exact = await lookupPromotionCode(canonical);
  if (exact) return exact;
  try {
    const res = await fetch(
      'https://api.stripe.com/v1/promotion_codes?active=true&limit=100',
      { headers: { Authorization: `Bearer ${STRIPE_SECRET}` }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const hit = (data.data || []).find((p) => String(p.code || '').toUpperCase() === canonical);
    return hit?.id || null;
  } catch {
    return null;
  }
}

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
    return new Response(JSON.stringify({ error: 'Paiement temporairement indisponible' }), { status: 503, headers });
  }

  const bodyText = await req.text();
  if (bodyText.length > 2000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers }); }

  const { plan } = body;
  if (!plan || !(plan in PLANS)) return new Response(JSON.stringify({ error: 'Plan invalide' }), { status: 400, headers });
  const { mode } = PLANS[plan];
  const priceId = PLANS[plan].priceId();
  if (!priceId) return new Response(JSON.stringify({ error: 'Plan non configuré' }), { status: 400, headers });

  // Creator code: only on the Pack Campagne, only if it resolves to a live
  // Stripe promotion code. An unknown code is dropped rather than rejected.
  // The canonical form is what gets stamped into the metadata, so a code used
  // as LEA10 and as lea10 credits the same creator exactly once.
  const canonicalCode = (typeof body.code === 'string' ? body.code.trim() : '').toUpperCase();
  const affiliateCode = plan === 'campagne' && AFFILIATE_CODE_RE.test(canonicalCode) ? canonicalCode : '';
  const promotionCodeId = affiliateCode ? await resolvePromotionCode(affiliateCode) : null;

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
        mode,
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        success_url: `${process.env.NEXT_PUBLIC_URL || 'https://emploia.fr'}/app?success=1`,
        cancel_url: `${process.env.NEXT_PUBLIC_URL || 'https://emploia.fr'}/#pricing`,
        ...(resolvedEmail ? { customer_email: resolvedEmail } : {}),
        'metadata[plan]': plan,
        locale: 'fr',
        'payment_method_types[0]': 'card',
        // `discounts` and `allow_promotion_codes` are mutually exclusive in
        // Stripe. A resolved creator code is applied up front so the buyer
        // lands on 49 € without retyping it; otherwise the Pack shows the
        // promo field so a code can still be entered by hand.
        ...(promotionCodeId
          ? { 'discounts[0][promotion_code]': promotionCodeId, 'metadata[affiliate]': affiliateCode }
          : plan === 'campagne'
            ? { allow_promotion_codes: 'true' }
            : {}),
        // Trial only exists for subscriptions. The Pack Campagne is a one-off
        // charge: sending subscription_data on mode=payment would both be
        // rejected by Stripe and give away a free trial on a single payment.
        ...(mode === 'subscription' ? { 'subscription_data[trial_period_days]': '7' } : {}),
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
