// Crédit de parrainage — exécuté côté serveur, au moment exact où un compte
// est créé, et nulle part ailleurs.
//
// Il vivait derrière `POST /api/referral`, un endpoint public qui acceptait
// `{ code, newUserEmail }` sans authentification. Quiconque connaissait six
// adresses inscrites pouvait s'offrir six mois de Pro (30 jours par adresse
// « parrainée »), offrir 14 jours à n'importe quel compte existant, et
// apprendre au passage si une adresse avait un compte (`ok:false` contre
// `ok:true`). register.js l'appelait par une requête HTTP vers lui-même ; il
// appelle désormais cette fonction directement, avec l'utilisateur qu'il vient
// de créer — la seule preuve qu'un parrainage a eu lieu.
import { kvGet, kvSet, kvSetNX, extendPro } from './auth.js';
import { trackEvent } from './track.js';

export const REF_CODE_RE = /^[A-Z0-9]{8}$/;
const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Récompenses : +30 j au parrain par filleul (6 filleuls récompensés au plus),
// +14 j au filleul.
const MAX_REWARDED = 6;
const REFERRER_DAYS = 30;
const REFEREE_DAYS = 14;

function randomCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => REF_CHARS[b % REF_CHARS.length]).join('');
}

// Réserve un code neuf pour `user` (SET NX : un tirage qui retombe sur un code
// existant ne l'écrase jamais). Renvoie le code, ou null si KV est indisponible.
export async function createReferralCode(user) {
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const ok = await kvSetNX(`ref:${code}`, {
      userId: user.id, email: user.email, signups: [], monthsEarned: 0, createdAt: new Date().toISOString(),
    }, 10 * 365 * 86400);
    if (ok) {
      await kvSet(`refcode:${user.id}`, code);
      return code;
    }
  }
  return null;
}

/**
 * Crédite un parrainage pour un compte QUI VIENT D'ÊTRE CRÉÉ.
 * @param {string} rawCode  code saisi / capté (?ref=)
 * @param {object} newUser  l'enregistrement user:{email} fraîchement écrit
 * @returns {Promise<{ok:boolean, reason?:string, refereeDays?:number}>}
 */
export async function creditReferral(rawCode, newUser) {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (!REF_CODE_RE.test(code) || !newUser?.email) return { ok: false, reason: 'invalid' };
  const email = String(newUser.email).toLowerCase();

  const refData = await kvGet(`ref:${code}`);
  if (!refData) return { ok: false, reason: 'unknown_code' };
  if (refData.email === email) return { ok: false, reason: 'self' };
  if ((refData.signups || []).includes(email)) return { ok: false, reason: 'already_counted' };

  // Un compte ne peut être parrainé qu'une fois, et une seule fois au total :
  // le verrou NX tient même si deux requêtes arrivent ensemble.
  const first = await kvSetNX(`referred:${email}`, code, 10 * 365 * 86400);
  if (!first) return { ok: false, reason: 'already_referred' };

  const signups = [...(refData.signups || []), email];
  const monthsEarned = Math.min(MAX_REWARDED, signups.length);
  await kvSet(`ref:${code}`, { ...refData, signups, monthsEarned });
  trackEvent('referral_signup').catch(() => {});

  const referrer = await kvGet(`user:${refData.email}`);
  if (referrer) {
    const patch = { ...referrer, referralMonths: monthsEarned, referralSignups: signups.length };
    if (signups.length <= MAX_REWARDED) patch.proUntil = extendPro(referrer.proUntil, REFERRER_DAYS);
    await kvSet(`user:${refData.email}`, patch);
  }

  const fresh = (await kvGet(`user:${email}`)) || newUser;
  await kvSet(`user:${email}`, { ...fresh, referredBy: code, proUntil: extendPro(fresh.proUntil, REFEREE_DAYS) });
  return { ok: true, refereeDays: REFEREE_DAYS };
}
