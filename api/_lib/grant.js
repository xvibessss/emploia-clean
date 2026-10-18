// ── OCTROI DU PACK CAMPAGNE ──────────────────────────────────────────────────
//
// UN SEUL chemin d'octroi, pour l'acheteur qui a un compte comme pour celui
// qui n'en a pas. C'est le critère qui a dicté la forme de ce module : le
// webhook avait `if (!user) break;` et la tentation était d'ajouter une branche
// « si pas de compte, alors créer et accorder ». Deux implémentations de
// l'octroi auraient divergé au premier changement de durée ou de champ — et la
// branche la moins empruntée, celle de l'acheteur anonyme, est précisément
// celle que personne ne relit.
//
// Ici `preparerCompte` ne fait QUE garantir qu'un compte existe ; l'octroi
// lui-même (`appliquerOctroiCampagne`) reçoit un compte et ne sait pas s'il
// vient d'être créé. Il est donc impossible d'accorder 90 jours à un nouveau
// compte autrement qu'à un ancien.
//
// BASE LÉGALE DE LA CRÉATION. On ne suppose pas le consentement : il est
// recueilli avant le paiement (`api/stripe-checkout.js` refuse un checkout
// sans `consent === true`), horodaté et transporté sur l'objet Stripe en
// `metadata[consent_immediate]` / `metadata[consent_at]`. Le webhook ne le
// lisait pas — zéro occurrence de `consent`. Il le lit maintenant et l'inscrit
// sur le compte créé.
import { kvGet, kvSet, kvSadd, extendPro } from './auth.js';

// 59 € achètent 90 jours d'accès Pro. Valeur dupliquée depuis le webhook, où
// elle vivait : elle appartient à l'octroi, pas au routage des événements.
export const CAMPAGNE_DAYS = 90;

// Durée de validité du lien de définition de mot de passe pour un compte créé
// par un achat. Le lien de réinitialisation ordinaire vaut une heure, ce qui
// est juste pour une demande que l'utilisateur vient de faire — et beaucoup
// trop court pour quelqu'un qui a payé et lira son mail le soir. Sept jours :
// il a déjà prouvé son identité en payant, et le coût d'un lien expiré est un
// client qui a payé et ne peut pas entrer.
export const LIEN_ACHAT_TTL_S = 7 * 24 * 3600;

// ── Le consentement, lu depuis l'objet Stripe ───────────────────────────────
// `metadata[consent_at]` est une chaîne ISO produite par notre propre
// checkout, mais elle revient de l'extérieur du processus : on la valide
// plutôt que de la recopier. Une date illisible vaut `null`, jamais
// « maintenant » — dater un consentement à la réception du paiement serait
// fabriquer la preuve au lieu de la transporter.
export function lireConsentement(session) {
  const m = session?.metadata || {};
  const donne = String(m.consent_immediate) === 'true';
  if (!donne) return { consentImmediate: false, consentAt: null };
  const brut = typeof m.consent_at === 'string' ? m.consent_at : '';
  const t = Date.parse(brut);
  return {
    consentImmediate: true,
    consentAt: Number.isFinite(t) ? new Date(t).toISOString() : null,
  };
}

// ── Garantir le compte ──────────────────────────────────────────────────────
// Réentrant : si le compte existe déjà, il est rendu tel quel. L'idempotence
// globale vient du verrou `kvSetNX('webhook:{id}')` du handler ; celle-ci est
// la seconde ligne, pour le cas où deux événements distincts (un paiement puis
// une facture) concerneraient la même adresse inconnue.
//
// LE COMPTE CRÉÉ N'A AUCUN MOT DE PASSE UTILISABLE. Pas de champ
// `passwordHash`, donc pas de mot de passe par défaut ni dérivé de l'adresse :
// `api/auth/login.js` refuse explicitement un compte sans `passwordHash`
// (« Email ou mot de passe incorrect »), et le seul chemin d'entrée est le lien
// signé envoyé par email. Un hash d'un secret deviné serait une porte ouverte
// sur un compte qui a du crédit dessus.
export async function preparerCompte(normalizedEmail, session) {
  const existant = await kvGet(`user:${normalizedEmail}`);
  if (existant) return { user: existant, cree: false };

  const { consentImmediate, consentAt } = lireConsentement(session);
  const id = `u_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const user = {
    id,
    // Pas de nom : on n'en a pas, et en inventer un depuis l'adresse email
    // ferait dire « Bonjour contact » à tous les emails suivants. Les gabarits
    // existants gèrent déjà un prénom vide.
    name: '',
    email: normalizedEmail,
    // AUCUN passwordHash, AUCUN passwordSalt — voir ci-dessus.
    generationsUsed: 0,
    plan: 'free',
    createdAt: new Date().toISOString(),
    // D'où vient ce compte, pour que ce soit lisible dans la console admin et
    // dans un export RGPD : il n'est pas né d'une inscription.
    createdVia: 'stripe_checkout',
    // L'adresse vient d'un paiement abouti, donc d'une meilleure qualité
    // qu'une inscription libre — mais ce n'est PAS un double opt-in. On le
    // marque pour ne pas la traiter plus tard comme une adresse vérifiée.
    emailVerified: false,
    emailSource: 'stripe_payment',
    // La preuve de consentement, transportée et non supposée.
    consentImmediate,
    consentAt,
  };

  await kvSet(`user:${normalizedEmail}`, user);
  await kvSet(`userid:${id}`, normalizedEmail);
  kvSadd('all_users', normalizedEmail).catch(() => {});
  return { user, cree: true };
}

// ── Accorder ────────────────────────────────────────────────────────────────
// La fonction unique. Elle reçoit un compte — jamais une adresse — et ignore
// s'il a été créé il y a une seconde ou il y a un an.
//
// `extendPro` PROLONGE un proUntil existant au lieu de l'écraser, et repart de
// 90 jours pleins s'il est expiré ; c'est le comportement que `probe-webhook`
// vérifie déjà. On n'écrit toujours PAS `plan` : `getCurrentUser` ne promeut
// qu'un compte dont le plan est `free` ou absent, donc tamponner
// `plan: 'campagne'` annulerait silencieusement le grant.
export async function appliquerOctroiCampagne(user, session) {
  const normalizedEmail = user.email;
  const proUntil = extendPro(user.proUntil, CAMPAGNE_DAYS);
  const compteAJour = {
    ...user,
    proUntil,
    campagnePurchasedAt: new Date().toISOString(),
    stripeCustomerId: session.customer,
    generationsUsed: 0,
  };
  await Promise.all([
    kvSet(`user:${normalizedEmail}`, compteAJour),
    kvSet(`stripe:${session.customer}`, normalizedEmail),
    kvSet(`gen:${normalizedEmail}`, 0),
  ]);
  return { user: compteAJour, proUntil };
}

// ── Le lien de définition de mot de passe ───────────────────────────────────
// Réutilise le mécanisme de réinitialisation existant : même forme de clé
// (`reset:{token}`), même page `/reset-password`, même handler. Un SEUL chemin
// d'émission de lien signé — en créer un second serait une seconde surface à
// sécuriser pour exactement le même service.
//
// `ttlMs` est porté par l'enregistrement parce que `api/auth/reset-password.js`
// validait une heure en dur : sans ce champ, un lien à sept jours serait
// refusé au bout d'une heure malgré son TTL KV. Absent, la valeur reste une
// heure — les liens de `forgot-password` ne changent pas de comportement.
export async function emettreLienMotDePasse(normalizedEmail, ttlSeconds = LIEN_ACHAT_TTL_S) {
  const token = crypto.randomUUID();
  await kvSet(`reset:${token}`, {
    email: normalizedEmail,
    createdAt: Date.now(),
    ttlMs: ttlSeconds * 1000,
    // Pourquoi ce lien a été émis : utile si un jour on veut distinguer, dans
    // les journaux, un lien demandé par l'utilisateur d'un lien envoyé après
    // un achat.
    origine: 'achat',
  }, ttlSeconds);
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://emploia.eu';
  return `${baseUrl}/reset-password?token=${token}`;
}
