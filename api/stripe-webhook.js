export const config = { runtime: 'edge', regions: ['cdg1'] };
import { kvGet, kvSet, kvSetNX, kvIncr, kvSadd, htmlEscape, extendPro } from './_lib/auth.js';
import { sendEmail } from './_lib/email.js';
import { enregistrerPaiementOrphelin } from './_lib/orphan.js';
import {
  CAMPAGNE_DAYS, preparerCompte, appliquerOctroiCampagne, emettreLienMotDePasse,
  LIEN_ACHAT_TTL_S,
} from './_lib/grant.js';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const AFFILIATE_CODE_RE = /^[A-Z0-9]{3,20}$/;

// ── RÉSOLUTION DE L'ACHETEUR ─────────────────────────────────────────────────
// Trois chances au lieu de deux, et la première est infalsifiable par
// l'acheteur : `client_reference_id` est posé par NOTRE checkout depuis la
// session authentifiée (`api/stripe-checkout.js`), pas saisi sur la page
// Stripe. Il compte donc le cas courant où quelqu'un paie avec l'adresse de
// son compte bancaire, différente de celle de son compte Emploia : sans lui,
// l'achat atterrissait sur une adresse inconnue et le client payait pour un
// accès posé ailleurs.
//
// L'identifiant est un `u_…` interne, résolu via `userid:{id}` — jamais une
// adresse, pour qu'un acheteur ne puisse pas se faire passer pour un autre
// compte en manipulant une valeur qui lui reviendrait.
async function resoudreAcheteur(session) {
  const ref = typeof session.client_reference_id === 'string' ? session.client_reference_id.trim() : '';
  if (ref && /^u_[A-Za-z0-9_]{1,64}$/.test(ref)) {
    const email = await kvGet(`userid:${ref}`);
    if (email) {
      const user = await kvGet(`user:${String(email).toLowerCase()}`);
      if (user) return { email: String(email).toLowerCase(), user, via: 'client_reference_id' };
    }
  }
  const brut = session.customer_email || session.customer_details?.email;
  if (!brut) return { email: null, user: null, via: 'aucune' };
  const email = String(brut).toLowerCase();
  const user = await kvGet(`user:${email}`);
  return {
    email,
    user,
    via: session.customer_email ? 'customer_email' : 'customer_details.email',
  };
}

// Attribution de repli, pour l'acheteur qui n'est jamais passé par ?code=.
//
// Chemin nominal : le lien du créateur porte ?code=, shared.js le capte,
// api/stripe-checkout.js le résout côté serveur et pose à la fois
// discounts[0][promotion_code] et metadata[affiliate]. Rien à faire ici,
// l'attribution est déjà dans l'événement.
//
// Chemin résiduel : l'acheteur arrive sans ?code=, voit le champ promo de
// Stripe (allow_promotion_codes) et y saisit le code à la main. Stripe lui
// accorde la remise, mais aucune metadata n'est posée — le créateur a fait la
// vente et n'est pas crédité. C'est exactement l'acheteur le plus engagé :
// celui qui a retenu le code au lieu de cliquer le lien.
//
// L'événement ne contient pas le code en clair, seulement l'identifiant du
// promotion code (Stripe ne développe pas les objets dans les webhooks). Une
// lecture suffit à le résoudre. Lecture seule, et volontairement enfermée dans
// un try/catch : une commission manquée se rattrape à la main depuis la
// console admin, un accès Pro non accordé est un client qui a payé pour rien.
// La livraison passe donc avant l'attribution en cas de panne.
async function resolveAffiliateFromDiscounts(session) {
  if (!STRIPE_SECRET) return '';
  const promo = session.discounts?.[0]?.promotion_code;
  // Déjà développé par une version future de l'API : on prend le code tel quel.
  if (promo && typeof promo === 'object' && promo.code) {
    const code = String(promo.code).toUpperCase();
    return AFFILIATE_CODE_RE.test(code) ? code : '';
  }
  if (!promo || typeof promo !== 'string') return '';
  try {
    const res = await fetch(`https://api.stripe.com/v1/promotion_codes/${encodeURIComponent(promo)}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return '';
    const data = await res.json();
    const code = String(data.code || '').toUpperCase();
    return AFFILIATE_CODE_RE.test(code) ? code : '';
  } catch {
    return '';
  }
}

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

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.eu';

// ── L'EMAIL DU COMPTE CRÉÉ ───────────────────────────────────────────────────
// Décision de Hugo, et c'est l'endroit de cette mission où le texte compte
// autant que le code : **le compte est annoncé franchement, dans le corps du
// message et non en mention de bas de page.**
//
// Quelqu'un qui a cliqué depuis une vidéo, payé 59 € et reçoit « choisissez
// votre mot de passe » découvrirait qu'il a un compte sur un service où il
// croyait acheter un produit. Le dire est honnête ; le laisser découvrir ne
// l'est pas. D'où la première phrase, qui nomme la création avant de parler de
// l'accès, et le rappel que l'adresse utilisée est celle du paiement — c'est
// la réponse à la question qu'il se posera (« pourquoi cette adresse ? »).
//
// Ce qui est délibérément absent : aucun « bienvenue dans la communauté »,
// aucun tutoiement — on ne connaît pas cette personne et elle n'a pas choisi
// de s'inscrire. Le ton reste celui d'une confirmation d'achat.
function emailCompteCree({ baseUrl, proUntil, lienMotDePasse, email }) {
  const jusquAu = new Date(proUntil).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const jours = Math.round(LIEN_ACHAT_TTL_S / 86400);
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:22px;font-weight:900;color:#0f172a;margin:0 0 14px;letter-spacing:-.5px">Votre Pack Campagne est actif</h1>

      <p style="color:#475569;line-height:1.7;margin:0 0 14px">
        Merci pour votre achat. Votre paiement est confirmé et vous avez
        <strong>3 mois d'accès complet à Emploia</strong>, jusqu'au ${jusquAu}.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #6366f1;border-radius:10px;padding:16px 18px;margin:0 0 18px">
        <p style="color:#0f172a;line-height:1.7;margin:0 0 8px;font-size:14px;font-weight:700">
          Nous avons créé un compte pour vous
        </p>
        <p style="color:#475569;line-height:1.7;margin:0;font-size:14px">
          Emploia fonctionne avec un compte — c'est ce qui conserve vos CV, vos
          candidatures et votre accès. Nous en avons donc ouvert un à l'adresse
          <strong>${htmlEscape(email)}</strong>, celle de votre paiement, pour que
          vous n'ayez aucune inscription à faire.
          Il ne vous reste qu'à choisir un mot de passe.
        </p>
      </div>

      <a href="${lienMotDePasse}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">Choisir mon mot de passe →</a>

      <p style="color:#64748b;line-height:1.7;margin:18px 0 0;font-size:13px">
        Ce lien est personnel et valable <strong>${jours} jours</strong>.
        Votre accès court déjà : il ne démarre pas au moment où vous créez le
        mot de passe.
      </p>

      <p style="color:#475569;line-height:1.7;margin:20px 0 0;font-size:14px">
        Paiement unique : rien ne sera reconduit, vous n'avez aucun abonnement à
        résilier.
      </p>

      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.7">
        Vous ne souhaitez pas de compte chez nous ? Répondez à cet email et nous
        le supprimons — avec un remboursement si vous n'avez rien utilisé.
      </p>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${baseUrl}" style="color:#94a3b8">emploia.eu</a></p>
</div></body></html>`;
}

// Le gabarit d'origine, pour l'acheteur qui avait déjà un compte : il garde son
// texte et son tutoiement, puisqu'il s'est inscrit lui-même.
function emailCompteExistant({ baseUrl, proUntil, firstName }) {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div></div><div style="padding:32px"><h1 style="font-size:22px;font-weight:900;color:#0f172a;margin:0 0 8px;letter-spacing:-.5px">Ton Pack Campagne est actif 🚀</h1><p style="color:#475569;line-height:1.6;margin:0 0 6px">Bienvenue${firstName ? ` ${firstName}` : ''} ! Tu as <strong>3 mois d'accès complet</strong>, jusqu'au ${new Date(proUntil).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.</p><p style="color:#475569;line-height:1.6;margin:0 0 24px">Paiement unique : rien ne sera reconduit, tu n'as aucun abonnement à résilier.</p><a href="${baseUrl}/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Commencer ma campagne →</a></div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${baseUrl}" style="color:#94a3b8">emploia.eu</a></p></div></body></html>`;
}

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
        // Trois chances de reconnaître l'acheteur, la première infalsifiable.
        // Voir `resoudreAcheteur`.
        const acheteur = await resoudreAcheteur(session);
        const email = acheteur.email;
        const plan = session.metadata?.plan || 'pro';

        // ── Pack Campagne: one-off payment, not a subscription ──────────────
        // 59 € grants 90 days of Pro through the internal proUntil grant that
        // getCurrentUser honors at read-time. Deliberately does NOT write
        // `plan`: getCurrentUser only promotes an account whose plan is free
        // or unset, so stamping plan='campagne' would silently void the grant.
        // No subscriptionId is stored either — there is no Stripe subscription.
        // Replay safety comes from the kvSetNX('webhook:{id}') lock above,
        // which guards every event type, this one included; without it a
        // retried event would hand out another 90 free days.
        if (session.mode === 'payment') {
          // Credit the creator before anything else: the sale happened and the
          // commission is owed even if the buyer has no account record yet.
          // Two atomic counters rather than one object — a read-modify-write
          // would lose a sale whenever two buyers convert at the same moment.
          // Commission owed is derived at read time in api/affiliate.js, so
          // changing the rate never rewrites history.
          //
          // metadata.affiliate d'abord : c'est le chemin nominal, et il ne
          // coûte aucun appel. Le repli par discounts[] ne sert qu'à l'acheteur
          // qui a saisi le code sur la page Stripe — voir
          // resolveAffiliateFromDiscounts.
          const affiliate = session.metadata?.affiliate
            || await resolveAffiliateFromDiscounts(session);
          if (affiliate && AFFILIATE_CODE_RE.test(affiliate)) {
            await Promise.all([
              kvSadd('affiliates', affiliate),
              kvIncr(`affiliate:${affiliate}:sales`),
            ]).catch(() => {});
          }
          if (!email) {
            // PREMIÈRE SORTIE SILENCIEUSE. Stripe n'a transmis aucune adresse :
            // on ne peut ni créer de compte ni en trouver un. Le paiement est
            // encaissé, donc il est tracé et alerté — c'est le seul cas des
            // trois que l'octroi automatique ne peut pas couvrir.
            await enregistrerPaiementOrphelin({
              sessionId: session.id,
              email: null,
              plan,
              amountTotal: session.amount_total,
              currency: session.currency,
              affiliate,
              reason: 'no_email_on_session',
            }, resendKey, process.env.ADMIN_EMAIL);
            break;
          }
          const normalizedEmail = email.toLowerCase();

          // DEUXIÈME SORTIE SILENCIEUSE — celle du brief. `if (!user) break;`
          // abandonnait ici, le handler répondait 200, et Stripe ne réessayait
          // jamais : argent encaissé, aucun accès, aucune trace.
          //
          // Le compte est désormais créé à la réception du paiement, sur la
          // base du consentement recueilli AVANT le paiement et transporté
          // dans les metadata Stripe. Puis l'octroi passe par la MÊME fonction
          // que pour un compte existant.
          let compte;
          try {
            compte = await preparerCompte(normalizedEmail, session);
          } catch (e) {
            // La création a échoué : le paiement reste dû, donc il repart dans
            // le filet au lieu de disparaître. C'est exactement le cas que le
            // filet existe pour attraper — un défaut dans le chemin neuf.
            await enregistrerPaiementOrphelin({
              sessionId: session.id,
              email: normalizedEmail,
              plan,
              amountTotal: session.amount_total,
              currency: session.currency,
              affiliate,
              reason: 'account_creation_failed',
            }, resendKey, process.env.ADMIN_EMAIL);
            break;
          }

          const { user, cree } = compte;
          const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://emploia.eu';
          const firstName = htmlEscape((user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || '');
          // L'octroi, identique dans les deux parcours : extendPro prolonge un
          // proUntil existant au lieu de l'écraser, et n'écrit pas `plan`.
          const { proUntil } = await appliquerOctroiCampagne(user, session);
          // Un compte neuf n'a aucun mot de passe utilisable : le lien signé
          // est son unique porte d'entrée. Émis par le mécanisme de
          // réinitialisation existant, pas par un second.
          const lienMotDePasse = cree ? await emettreLienMotDePasse(normalizedEmail) : null;

          await Promise.all([
            fetch(`${baseUrl}/api/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'plan_upgraded', props: { plan: 'campagne', compteCree: cree } }) }).catch(() => {}),
            resendKey ? sendEmail(resendKey, {
              from: 'Emploia <noreply@emploia.eu>',
              to: [normalizedEmail],
              subject: cree
                ? 'Votre Pack Campagne est actif — créez votre mot de passe'
                : `🎉 ${firstName || 'Bienvenue'}, ton Pack Campagne est activé !`,
              html: cree
                ? emailCompteCree({ baseUrl, proUntil, lienMotDePasse, email: normalizedEmail })
                : emailCompteExistant({ baseUrl, proUntil, firstName }),
            }) : Promise.resolve(),
          ]);
          break;
        }

        // ── Pro: recurring subscription ─────────────────────────────────────
        // 'intensif' is no longer sellable (removed from api/stripe-checkout.js)
        // but the label is kept so a renewal or a plan change on one of the
        // grandfathered subscriptions still reads correctly in emails.
        const planLabel = plan === 'intensif' ? 'Intensif' : 'Pro';
        if (email) {
          const normalizedEmail = email;
          // L'acheteur est déjà résolu — `client_reference_id` d'abord, donc un
          // abonné qui paie avec l'adresse de sa banque est reconnu ici aussi.
          const user = acheteur.user;
          if (user) {
            const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://emploia.eu';
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
                from: 'Emploia <noreply@emploia.eu>',
                to: [normalizedEmail],
                subject: `🎉 ${firstName || 'Bienvenue'}, ton accès ${planLabel} est activé !`,
                html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div></div><div style="padding:32px"><h1 style="font-size:22px;font-weight:900;color:#0f172a;margin:0 0 8px;letter-spacing:-.5px">Ton abonnement ${planLabel} est actif 🚀</h1><p style="color:#475569;line-height:1.6;margin:0 0 6px">Bienvenue${firstName ? ` ${firstName}` : ''} ! Avec ${planLabel}, tu as accès à l'IA la plus complète de France pour ta recherche d'emploi. Le détail de ta facturation est disponible à tout moment depuis ton espace abonnement.</p><p style="color:#475569;line-height:1.6;margin:0 0 24px">Voilà par où commencer :</p><div style="display:flex;flex-direction:column;gap:12px;margin-bottom:28px"><a href="${baseUrl}/app" style="display:flex;align-items:flex-start;gap:14px;padding:14px;background:#f8fafc;border-radius:12px;text-decoration:none;border:1px solid #e2e8f0"><span style="font-size:20px;line-height:1;flex-shrink:0">1️⃣</span><div><div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:2px">Génère ton CV ATS-optimisé</div><div style="font-size:12px;color:#64748b">Adapté à chaque offre, boosté pour passer les filtres automatiques</div></div></a><a href="${baseUrl}/app" style="display:flex;align-items:flex-start;gap:14px;padding:14px;background:#f8fafc;border-radius:12px;text-decoration:none;border:1px solid #e2e8f0"><span style="font-size:20px;line-height:1;flex-shrink:0">2️⃣</span><div><div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:2px">Vérifie ton score ATS sur une vraie offre</div><div style="font-size:12px;color:#64748b">Colle une offre d'emploi et vois instantanément ton taux de match</div></div></a><a href="${baseUrl}/interview" style="display:flex;align-items:flex-start;gap:14px;padding:14px;background:#f8fafc;border-radius:12px;text-decoration:none;border:1px solid #e2e8f0"><span style="font-size:20px;line-height:1;flex-shrink:0">3️⃣</span><div><div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:2px">Lance une simulation d'entretien IA</div><div style="font-size:12px;color:#64748b">Prépare-toi avec un coach IA qui simule le recruteur</div></div></a></div><a href="${baseUrl}/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">C'est parti →</a><p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.6">Des questions ? Réponds directement à cet email, on te répond sous 24h.</p></div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${baseUrl}/api/stripe-portal" style="color:#94a3b8">Gérer mon abonnement</a> · <a href="${baseUrl}/api/stripe-portal" style="color:#94a3b8">Se désabonner</a></p></div></body></html>`,
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
          if (!user) {
            // TROISIÈME SORTIE SILENCIEUSE — celle que le brief ne mentionnait
            // pas. Un échec de renouvellement sur une adresse sans compte
            // partait au silence lui aussi. Il n'y a pas d'argent encaissé ici,
            // au contraire : un paiement a ÉCHOUÉ pour un client qu'on ne sait
            // pas rattacher, donc personne ne sera prévenu de la coupure à
            // venir. Ça se trace et ça s'alerte pour la même raison.
            await enregistrerPaiementOrphelin({
              sessionId: invoice.id || `inv_${customerId}`,
              email,
              plan: null,
              amountTotal: invoice.amount_due,
              currency: invoice.currency,
              affiliate: null,
              reason: 'no_account_on_failure',
              extra: { customerId, attemptCount: invoice.attempt_count || 1 },
            }, resendKey, process.env.ADMIN_EMAIL);
            break;
          }
          await kvSet(`user:${email}`, { ...user, subscriptionStatus: 'past_due' });
          const firstName = htmlEscape((user?.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || 'là');
          const attemptCount = invoice.attempt_count || 1;
          const nextAttempt = invoice.next_payment_attempt
            ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('fr-FR')
            : null;

          console.error('invoice.payment_failed', email, attemptCount);
          await sendEmail(resendKey, {
            from: 'Emploia <noreply@emploia.eu>',
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
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${BASE_URL}" style="color:#94a3b8">emploia.eu</a></p>
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
                from: 'Emploia <noreply@emploia.eu>',
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
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${BASE_URL}" style="color:#94a3b8">emploia.eu</a></p>
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
