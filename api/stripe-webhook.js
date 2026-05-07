export const config = { runtime: 'edge' };
import { kvGet, kvSet } from './_lib/auth.js';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifyStripeSignature(payload, header, secret) {
  if (!secret || !header) return false;
  const parts = header.split(',');
  const ts = parts.find(p => p.startsWith('t='))?.slice(2);
  const sig = parts.find(p => p.startsWith('v1='))?.slice(3);
  if (!ts || !sig) return false;
  const signedPayload = `${ts}.${payload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const computed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computedHex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(computedHex, sig);
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const body = await req.text();
  const sig = req.headers.get('stripe-signature') || '';

  if (STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(body, sig, STRIPE_WEBHOOK_SECRET);
    if (!valid) return new Response('Invalid signature', { status: 400 });
  }

  let event;
  try { event = JSON.parse(body); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.customer_email || session.customer_details?.email;
        const plan = session.metadata?.plan || 'pro';
        if (email) {
          const normalizedEmail = email.toLowerCase();
          const user = await kvGet(`user:${normalizedEmail}`);
          if (user) {
            await Promise.all([
              kvSet(`user:${normalizedEmail}`, {
                ...user,
                plan,
                stripeCustomerId: session.customer,
                subscriptionId: session.subscription,
                planActivatedAt: new Date().toISOString(),
                generationsUsed: 0,
              }),
              // Store customerId → email mapping for subscription cancellation
              kvSet(`stripe:${session.customer}`, normalizedEmail),
            ]);
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const email = await kvGet(`stripe:${customerId}`);
        if (email) {
          const user = await kvGet(`user:${email}`);
          if (user) await kvSet(`user:${email}`, { ...user, plan: 'free', subscriptionId: null });
        }
        break;
      }
      case 'invoice.payment_failed': {
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), { status: 500 });
  }
}
