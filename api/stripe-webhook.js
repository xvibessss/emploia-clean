export const config = { runtime: 'edge' };
import { kvGet, kvSet, kvSetNX, htmlEscape } from './_lib/auth.js';

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
  // Reject webhooks older than 5 minutes to prevent replay attacks.
  if (Math.abs(Date.now() / 1000 - parseInt(ts, 10)) > 300) return false;
  const signedPayload = `${ts}.${payload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const computed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computedHex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(computedHex, sig);
}

function sendEmail(resendKey, payload) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const body = await req.text();
  const sig = req.headers.get('stripe-signature') || '';

  if (!STRIPE_WEBHOOK_SECRET) {
    return new Response('Webhook secret not configured', { status: 500 });
  }
  const valid = await verifyStripeSignature(body, sig, STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response('Invalid signature', { status: 400 });

  let event;
  try { event = JSON.parse(body); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  // Idempotency: reject duplicate events (Stripe retries webhooks on 5xx)
  if (event.id) {
    const isNew = await kvSetNX(`webhook:${event.id}`, '1', 86400);
    if (!isNew) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const resendKey = process.env.RESEND_API_KEY;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.customer_email || session.customer_details?.email;
        const plan = session.metadata?.plan || 'pro';
        const planLabel = plan === 'intensif' ? 'Intensif' : 'Pro';
        const planPrice = plan === 'intensif' ? '19€/mois' : '9€/mois';
        if (email) {
          const normalizedEmail = email.toLowerCase();
          const user = await kvGet(`user:${normalizedEmail}`);
          if (user) {
            const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
            const firstName = htmlEscape((user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || '');
            await Promise.all([
              kvSet(`user:${normalizedEmail}`, {
                ...user,
                plan,
                stripeCustomerId: session.customer,
                subscriptionId: session.subscription,
                planActivatedAt: new Date().toISOString(),
                generationsUsed: 0,
                cancelAtPeriodEnd: false,
                cancelAt: null,
              }),
              kvSet(`stripe:${session.customer}`, normalizedEmail),
              kvSet(`gen:${normalizedEmail}`, 0),
              // Track upgrade (fire and forget)
              fetch(`${baseUrl}/api/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'plan_upgraded', props: { plan } }) }).catch(() => {}),
              resendKey ? sendEmail(resendKey, {
                from: 'Emploia <noreply@emploia.fr>',
                to: [normalizedEmail],
                subject: `🎉 ${firstName || 'Bienvenue'}, ton accès ${planLabel} est activé !`,
                html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div></div><div style="padding:32px"><h1 style="font-size:22px;font-weight:900;color:#0f172a;margin:0 0 8px;letter-spacing:-.5px">Ton abonnement ${planLabel} est actif 🚀</h1><p style="color:#475569;line-height:1.6;margin:0 0 6px">Bienvenue${firstName ? ` ${firstName}` : ''} ! Pour ${planPrice}, tu as accès à l'IA la plus complète de France pour ta recherche d'emploi.</p><p style="color:#475569;line-height:1.6;margin:0 0 24px">Voilà par où commencer :</p><div style="display:flex;flex-direction:column;gap:12px;margin-bottom:28px"><a href="${baseUrl}/app" style="display:flex;align-items:flex-start;gap:14px;padding:14px;background:#f8fafc;border-radius:12px;text-decoration:none;border:1px solid #e2e8f0"><span style="font-size:20px;line-height:1;flex-shrink:0">1️⃣</span><div><div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:2px">Génère ton CV ATS-optimisé</div><div style="font-size:12px;color:#64748b">Adapté à chaque offre, boosté pour passer les filtres automatiques</div></div></a><a href="${baseUrl}/app" style="display:flex;align-items:flex-start;gap:14px;padding:14px;background:#f8fafc;border-radius:12px;text-decoration:none;border:1px solid #e2e8f0"><span style="font-size:20px;line-height:1;flex-shrink:0">2️⃣</span><div><div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:2px">Vérifie ton score ATS sur une vraie offre</div><div style="font-size:12px;color:#64748b">Colle une offre d'emploi et vois instantanément ton taux de match</div></div></a><a href="${baseUrl}/interview" style="display:flex;align-items:flex-start;gap:14px;padding:14px;background:#f8fafc;border-radius:12px;text-decoration:none;border:1px solid #e2e8f0"><span style="font-size:20px;line-height:1;flex-shrink:0">3️⃣</span><div><div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:2px">Lance une simulation d'entretien IA</div><div style="font-size:12px;color:#64748b">Prépare-toi avec un coach IA qui simule le recruteur</div></div></a></div><a href="${baseUrl}/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">C'est parti →</a><p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.6">Des questions ? Réponds directement à cet email, on te répond sous 24h.</p></div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${baseUrl}/api/stripe-portal" style="color:#94a3b8">Gérer mon abonnement</a> · <a href="${baseUrl}/api/stripe-portal" style="color:#94a3b8">Se désabonner</a></p></div></body></html>`,
              }) : Promise.resolve(),
            ]);
          }
        }
        break;
      }

      case 'invoice.paid': {
        // Reset generation counter at the start of each new billing cycle.
        // Ensures paid users get a fresh counter each month and free users
        // who were upgraded get properly unlocked on renewal.
        const invoice = event.data.object;
        if (!invoice.subscription) break; // skip one-time payments
        const customerId = invoice.customer;
        const email = await kvGet(`stripe:${customerId}`);
        if (email) {
          await kvSet(`gen:${email}`, 0);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const email = invoice.customer_email?.toLowerCase() || await kvGet(`stripe:${customerId}`);
        if (email && resendKey) {
          const user = await kvGet(`user:${email}`);
          if (!user) break;
          await kvSet(`user:${email}`, { ...user, subscriptionStatus: 'past_due' });
          const firstName = htmlEscape((user?.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || 'là');
          const attemptCount = invoice.attempt_count || 1;
          const nextAttempt = invoice.next_payment_attempt
            ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('fr-FR')
            : null;

          console.error('invoice.payment_failed', email, attemptCount);
          await sendEmail(resendKey, {
            from: 'Emploia <noreply@emploia.fr>',
            to: [email],
            subject: '⚠️ Problème de paiement — ton accès Emploia Pro',
            html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#ef4444,#f97316);padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 12px;letter-spacing:-.5px">Échec du paiement${firstName !== 'là' ? `, ${firstName}` : ''}</h1>
      <p style="color:#475569;line-height:1.6;margin:0 0 16px">Nous n'avons pas pu débiter votre carte pour votre abonnement Emploia (tentative ${attemptCount}).</p>
      ${nextAttempt ? `<p style="color:#475569;line-height:1.6;margin:0 0 20px">Prochain essai automatique prévu le <strong>${nextAttempt}</strong>.</p>` : ''}
      <p style="color:#475569;line-height:1.6;margin:0 0 28px">Pour éviter l'interruption de votre accès, mettez à jour vos informations de paiement dès maintenant.</p>
      <a href="${BASE_URL}/api/stripe-portal" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">Mettre à jour ma carte →</a>
      <p style="color:#94a3b8;font-size:12px;margin:28px 0 0;line-height:1.6">Si vous avez des questions, répondez directement à cet email.</p>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${BASE_URL}" style="color:#94a3b8">emploia.fr</a></p>
</div>
</body></html>`,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const email = await kvGet(`stripe:${customerId}`);
        if (email) {
          const user = await kvGet(`user:${email}`);
          if (user) {
            await kvSet(`user:${email}`, {
              ...user,
              plan: 'free',
              subscriptionId: null,
              subscriptionStatus: 'canceled',
              planCanceledAt: new Date().toISOString(),
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const email = await kvGet(`stripe:${customerId}`);
        if (email) {
          const user = await kvGet(`user:${email}`);
          if (user) {
            const priceId = sub.items?.data?.[0]?.price?.id;
            const PRICE_TO_PLAN = {
              [process.env.STRIPE_PRICE_PRO]: 'pro',
              [process.env.STRIPE_PRICE_INTENSIF]: 'intensif',
              [process.env.STRIPE_PRICE_PRO_ANNUAL]: 'pro',
              [process.env.STRIPE_PRICE_INTENSIF_ANNUAL]: 'intensif',
            };
            const newPlan = (priceId && PRICE_TO_PLAN[priceId]) || user.plan;
            const wasScheduledForCancellation = user.cancelAtPeriodEnd;
            const isNowScheduledForCancellation = sub.cancel_at_period_end;

            await kvSet(`user:${email}`, {
              ...user,
              plan: sub.status === 'active' ? newPlan : 'free',
              subscriptionId: sub.id,
              subscriptionStatus: sub.status,
              cancelAtPeriodEnd: isNowScheduledForCancellation,
              cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
            });

            // Send retention email only the first time cancel_at_period_end becomes true
            if (!wasScheduledForCancellation && isNowScheduledForCancellation && resendKey) {
              const firstName = htmlEscape((user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || 'là');
              const cancelDate = sub.cancel_at
                ? new Date(sub.cancel_at * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                : 'en fin de période';

              sendEmail(resendKey, {
                from: 'Emploia <noreply@emploia.fr>',
                to: [email],
                subject: 'Votre abonnement Emploia sera annulé',
                html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 12px;letter-spacing:-.5px">Annulation confirmée${firstName !== 'là' ? `, ${firstName}` : ''}</h1>
      <p style="color:#475569;line-height:1.6;margin:0 0 16px">Votre abonnement Emploia sera annulé le <strong>${cancelDate}</strong>. Jusqu'à cette date, vous conservez un accès complet.</p>
      <p style="color:#475569;line-height:1.6;margin:0 0 8px">Vous avez changé d'avis ? Il n'est pas trop tard :</p>
      <a href="${BASE_URL}/api/stripe-portal" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px;margin-bottom:24px">Réactiver mon abonnement →</a>
      <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-top:8px">
        <p style="font-size:13px;color:#64748b;font-weight:600;margin:0 0 10px">Après le ${cancelDate}, vous perdrez l'accès à :</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:center;gap:10px"><span style="color:#ef4444;font-size:16px">✕</span><span style="color:#475569;font-size:13px">Générations illimitées de CV et lettres</span></div>
          <div style="display:flex;align-items:center;gap:10px"><span style="color:#ef4444;font-size:16px">✕</span><span style="color:#475569;font-size:13px">Coaching IA entretiens avancé</span></div>
          <div style="display:flex;align-items:center;gap:10px"><span style="color:#ef4444;font-size:16px">✕</span><span style="color:#475569;font-size:13px">Analyse de score illimitée</span></div>
        </div>
      </div>
      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.6">Une question ? Répondez directement à cet email, nous répondons sous 24h.</p>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${BASE_URL}" style="color:#94a3b8">emploia.fr</a></p>
</div>
</body></html>`,
              });
            }
          }
        }
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), { status: 500 });
  }
}
