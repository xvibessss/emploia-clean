export const config = { runtime: 'edge' };
import { kvGet, kvSet } from './_lib/auth.js';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

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
  return computedHex === sig;
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
          const user = await kvGet(`user:${email.toLowerCase()}`);
          if (user) {
            await kvSet(`user:${email.toLowerCase()}`, {
              ...user,
              plan,
              stripeCustomerId: session.customer,
              subscriptionId: session.subscription,
              planActivatedAt: new Date().toISOString(),
              generationsUsed: 0, // Reset on plan upgrade
            });
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;
        // Find user by stripe customer ID
        const email = await kvGet(`stripe:${customerId}`);
        if (email) {
          const user = await kvGet(`user:${email}`);
          if (user) await kvSet(`user:${email}`, { ...user, plan: 'free', subscriptionId: null });
        }
        break;
      }
      case 'invoice.payment_failed': {
        // Could send email notification here
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
