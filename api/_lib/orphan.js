// ── FILET : UN PAIEMENT NE PART JAMAIS AU SILENCE ────────────────────────────
//
// Le webhook Stripe avait trois sorties qui se terminaient par un `break` nu,
// puis un `{ received: true }` en **200**. Stripe considère alors l'événement
// livré et ne réessaie jamais. Un visiteur froid pouvait donc payer 59 €, ne
// correspondre à aucun compte, et disparaître : argent encaissé, aucun accès,
// aucune trace nulle part. `orphan` n'avait zéro occurrence dans le dépôt.
//
// Ce module est le filet. Il est délibérément indépendant de l'octroi
// automatique (`_lib/grant.js`) : l'octroi couvre le cas qu'on a prévu, le
// filet attrape ceux qu'on n'a pas prévus. Garder les deux est le seul moyen
// qu'un défaut futur dans l'octroi ne redevienne pas un silence.
//
// POURQUOI ON NE REND PAS UN 5xx À LA PLACE. Un 500 ferait réessayer Stripe,
// ce qui est tentant — mais le rejeu buterait sur le verrou
// `kvSetNX('webhook:{id}')` déjà posé en amont et repartirait en 200
// « duplicate », donc la réessai ne réparerait rien tout en inondant les
// journaux. L'enregistrement durable plus l'alerte sont la réponse juste : le
// paiement est tracé là où on peut agir dessus.
import { kvGet, kvSet, kvSadd } from './auth.js';
import { sendEmail } from './email.js';

// Les raisons sont un vocabulaire FERMÉ, dans l'esprit de `causePublique` de
// `api/jobs.js` : une raison libre finirait par porter un message d'exception,
// donc potentiellement une URL signée ou une clé. Ici le risque est moindre
// (rien ne sort vers le client), mais le bénéfice reste : une raison énumérée
// se compte, se filtre et se lit dans une console admin.
export const RAISONS_ORPHELINES = new Set([
  'no_email_on_session',    // Stripe n'a transmis aucune adresse
  'no_account_for_email',   // adresse connue, aucun compte — le cas du brief
  'account_creation_failed',// l'octroi automatique a échoué, le paiement reste dû
  'no_account_on_failure',  // invoice.payment_failed sur une adresse sans compte
]);

export function raisonPublique(r) {
  return RAISONS_ORPHELINES.has(r) ? r : 'unknown';
}

// Clé : `orphan-payment:{sessionId}`, la forme donnée par le brief. Le
// sessionId (ou l'id de facture) est l'identifiant stable côté Stripe, donc
// deux écritures pour le même paiement se superposent au lieu de s'empiler —
// l'enregistrement est idempotent par construction, comme le reste du handler.
export function cleOrpheline(identifiant) {
  return `orphan-payment:${identifiant}`;
}

// ── Enregistrer ──────────────────────────────────────────────────────────────
// Jamais de `throw` : ce module est appelé sur le chemin d'un paiement déjà
// encaissé. Si l'alerte tombe, le webhook doit continuer — un filet qui fait
// échouer la livraison serait pire que le silence qu'il remplace.
export async function enregistrerPaiementOrphelin({
  sessionId, email, plan, amountTotal, currency, affiliate, reason, extra,
}, resendKey, adminEmail) {
  const identifiant = sessionId || `inconnu_${Date.now()}`;
  const cle = cleOrpheline(identifiant);
  const enregistrement = {
    createdAt: new Date().toISOString(),
    sessionId: identifiant,
    email: email || null,
    plan: plan || null,
    amountTotal: typeof amountTotal === 'number' ? amountTotal : null,
    currency: currency || null,
    affiliate: affiliate || null,
    reason: raisonPublique(reason),
    // `resolved` est posé à false et n'est jamais écrit à true par le code :
    // c'est un humain qui tranche qu'un paiement a été honoré. Un drapeau que
    // le programme pourrait lever tout seul ne prouverait rien.
    resolved: false,
    ...(extra && typeof extra === 'object' ? { extra } : {}),
  };

  try {
    // Pas d'écrasement d'un enregistrement déjà résolu à la main : si Hugo a
    // traité le paiement puis que l'événement est rejoué, on ne remet pas le
    // dossier à « non résolu ».
    const existant = await kvGet(cle);
    if (existant?.resolved === true) return { enregistre: false, deja: true };
    await kvSet(cle, enregistrement);
    // Un index, sinon l'enregistrement n'est trouvable qu'en connaissant déjà
    // le sessionId — c'est-à-dire exactement l'information qu'on n'a pas quand
    // on cherche « y a-t-il des paiements non honorés ? ».
    await kvSadd('orphan_payments', identifiant).catch(() => {});
  } catch (e) {
    // L'écriture KV a échoué : il reste le journal, et l'alerte ci-dessous.
    console.error('orphan-payment: écriture KV impossible', raisonPublique(reason), identifiant);
  }

  // Le journal d'exécution, toujours — il est lisible à chaud même si KV et
  // Resend sont tous les deux tombés.
  console.error(`orphan-payment: ${enregistrement.reason} session=${identifiant} plan=${enregistrement.plan} montant=${enregistrement.amountTotal}`);

  await alerterHugo(enregistrement, resendKey, adminEmail);
  return { enregistre: true, enregistrement };
}

// ── Alerter ──────────────────────────────────────────────────────────────────
// « Un paiement non honoré doit se voir dans l'heure, pas au prochain audit. »
// Les emails sont déjà câblés dans le webhook : `sendEmail` suffit, aucune
// intégration nouvelle.
const LIBELLES = {
  no_email_on_session: "Stripe n'a transmis aucune adresse email",
  no_account_for_email: 'aucun compte Emploia pour cette adresse',
  account_creation_failed: "la création automatique du compte a échoué",
  no_account_on_failure: "échec de paiement sur une adresse sans compte",
  unknown: 'raison non identifiée',
};

// Ce que l'alerte doit permettre de faire, et c'est le critère qui a dicté son
// contenu : rembourser ou honorer à la main, sans ouvrir Stripe pour retrouver
// de quoi on parle. D'où le montant, l'adresse et le sessionId en clair.
export function corpsAlerte(e) {
  const montant = typeof e.amountTotal === 'number'
    ? `${(e.amountTotal / 100).toFixed(2)} ${String(e.currency || 'eur').toUpperCase()}`
    : 'montant inconnu';
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:560px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#ef4444,#f97316);padding:20px 28px">
      <div style="font-size:16px;font-weight:900;color:#fff">Paiement à honorer à la main</div>
    </div>
    <div style="padding:28px">
      <p style="color:#0f172a;line-height:1.6;margin:0 0 18px;font-size:15px">
        Un paiement a été encaissé sans qu'un accès puisse être accordé automatiquement :
        <strong>${LIBELLES[e.reason] || LIBELLES.unknown}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#475569">
        <tr><td style="padding:6px 0;color:#94a3b8">Montant</td><td style="padding:6px 0;font-weight:700;color:#0f172a">${montant}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Email</td><td style="padding:6px 0">${e.email || '— non transmis —'}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Plan</td><td style="padding:6px 0">${e.plan || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Créateur</td><td style="padding:6px 0">${e.affiliate || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Session Stripe</td><td style="padding:6px 0;font-family:monospace;font-size:12px">${e.sessionId}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Reçu le</td><td style="padding:6px 0">${e.createdAt}</td></tr>
      </table>
      <p style="color:#64748b;line-height:1.6;margin:18px 0 0;font-size:13px">
        Clé de l'enregistrement : <code style="font-family:monospace">${cleOrpheline(e.sessionId)}</code><br/>
        À traiter : accorder l'accès, ou rembourser depuis Stripe.
      </p>
    </div>
  </div>
</div></body></html>`;
}

async function alerterHugo(e, resendKey, adminEmail) {
  if (!resendKey) {
    console.error('orphan-payment: RESEND_API_KEY absente, alerte non envoyée', e.sessionId);
    return;
  }
  try {
    await sendEmail(resendKey, {
      from: 'Emploia <noreply@emploia.eu>',
      to: [adminEmail || process.env.ADMIN_EMAIL || 'contact@emploia.eu'],
      subject: `[Emploia] Paiement non honoré — ${e.reason} — ${e.email || 'sans adresse'}`,
      html: corpsAlerte(e),
    });
  } catch (err) {
    console.error('orphan-payment: alerte non envoyée', e.sessionId);
  }
}
