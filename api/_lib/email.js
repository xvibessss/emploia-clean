// Envoi d'emails transactionnels via Resend.
//
// Remplace trois copies divergentes du même helper (stripe-webhook, contact,
// trial-reminder), dont deux terminaient par `.catch(() => {})` : un refus de
// Resend — domaine non vérifié, clé invalide, quota — ne laissait alors aucune
// trace, et aucun appelant ne pouvait savoir qu'un email n'était pas parti.
//
// Ici l'échec est journalisé avec son contexte et rendu à l'appelant. Les
// appels restent volontairement « fire and forget » côté métier : on ne veut
// pas qu'un email manqué fasse échouer un webhook Stripe et déclenche un rejeu.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 8000;

// Les expéditeurs sont des boîtes techniques inexistantes. Sans reply_to, une
// réponse d'un client part dans le vide — alors que plusieurs emails l'invitent
// explicitement à répondre.
const DEFAULT_REPLY_TO = 'contact@emploia.eu';

/**
 * @param {string} apiKey  clé Resend
 * @param {object} payload corps Resend : from, to[], subject, html, reply_to…
 * @returns {Promise<{ok: boolean, reason?: string, status?: number, id?: string}>}
 */
export async function sendEmail(apiKey, payload) {
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY absente — email non envoyé', {
      to: payload?.to,
      subject: payload?.subject,
    });
    return { ok: false, reason: 'missing_api_key' };
  }

  const corps = { reply_to: DEFAULT_REPLY_TO, ...payload };

  let reponse;
  try {
    reponse = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[email] Resend injoignable', {
      to: corps.to,
      subject: corps.subject,
      erreur: err?.name === 'TimeoutError' ? `timeout ${TIMEOUT_MS}ms` : err?.message,
    });
    return { ok: false, reason: 'network' };
  }

  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => '');
    console.error('[email] Resend a refusé l\'envoi', {
      statut: reponse.status,
      from: corps.from,
      to: corps.to,
      subject: corps.subject,
      detail: detail.slice(0, 500),
    });
    return { ok: false, reason: 'rejected', status: reponse.status };
  }

  const { id } = await reponse.json().catch(() => ({}));
  return { ok: true, id };
}

export { DEFAULT_REPLY_TO };
