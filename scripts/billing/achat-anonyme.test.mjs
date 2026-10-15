// Sonde de l'achat anonyme : un acheteur non connecté paie et DOIT recevoir.
//
// LE DÉFAUT. `api/stripe-webhook.js` se terminait par `if (!user) break;` sur
// un `checkout.session.completed`, puis répondait `{ received: true }` en 200.
// Stripe considère alors l'événement livré et ne réessaie jamais. Un visiteur
// froid — le parcours que le canal créateurs produit par conception — pouvait
// donc payer 59 €, ne correspondre à aucun compte, et disparaître : argent
// encaissé, aucun accès, aucune trace. `orphan` avait zéro occurrence dans le
// dépôt.
//
// CETTE SONDE EST HORS LIGNE. Elle exécute le VRAI handler contre un Upstash
// en mémoire et un payload signé, sur le modèle de `probe-webhook.mjs` dont
// elle reprend le stub. Aucune écriture Stripe, aucun appel réseau : le
// périmètre de la mission l'interdit et `AGENTS.md` réserve toute écriture
// live à Hugo.
//
// ET ELLE DOIT ÉCHOUER SI ON RÉINTRODUIT LE `break`. C'est le critère
// d'acceptation qui compte le plus, parce que c'est la seule forme qui prouve
// qu'elle teste ce qu'elle annonce : la section [H] réécrit le handler en
// mémoire pour y remettre le défaut, le réexécute, et vérifie que le compte
// n'est PAS créé. Une sonde qu'on n'a pas vue échouer ne protège rien.
const SECRET = 'whsec_stub';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.KV_REST_API_URL = 'http://kv.stub';
process.env.KV_REST_API_TOKEN = 'stub';
process.env.NEXT_PUBLIC_URL = 'https://emploia.eu';
// Une clé Resend factice : les envois sont interceptés par le stub de fetch,
// donc rien ne sort — mais le handler doit emprunter le chemin où il envoie,
// sinon la sonde ne verrait jamais l'email de création de compte.
process.env.RESEND_API_KEY = 're_stub';
process.env.ADMIN_EMAIL = 'hugo@emploia.eu';
// `reset-password` signe un JWT quand il accepte un lien : sans secret, le
// handler lève avant d'avoir répondu. Valeur factice, uniquement pour que la
// section [C bis] puisse exercer la fenêtre de validité du lien d'achat.
process.env.JWT_SECRET = 'sonde-hors-ligne-secret-de-test-32-caracteres-minimum';

import fs from 'node:fs';
import vm from 'node:vm';

// ── Upstash en mémoire ──────────────────────────────────────────────────────
const store = new Map();
const emailsEnvoyes = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('http://kv.stub')) {
    const cmd = JSON.parse(opts.body);
    const [op, key, val, ...rest] = cmd;
    switch (String(op).toUpperCase()) {
      case 'GET': {
        const v = store.get(key);
        return new Response(JSON.stringify({ result: v === undefined ? null : v }), { status: 200 });
      }
      case 'SET': {
        const isNX = rest.map(String).map(s => s.toUpperCase()).includes('NX');
        if (isNX && store.has(key)) return new Response(JSON.stringify({ result: null }), { status: 200 });
        store.set(key, val);
        return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
      }
      case 'SADD': {
        const k = `set:${key}`;
        const s = store.get(k) || new Set();
        for (const m of [val, ...rest]) s.add(m);
        store.set(k, s);
        return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      }
      case 'INCR': {
        const n = (Number(store.get(key)) || 0) + 1;
        store.set(key, n);
        return new Response(JSON.stringify({ result: n }), { status: 200 });
      }
      default:
        return new Response(JSON.stringify({ result: null }), { status: 200 });
    }
  }
  if (u.includes('api.resend.com')) {
    emailsEnvoyes.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ id: 'email_stub' }), { status: 200 });
  }
  if (u.includes('/api/track')) return new Response('{}', { status: 200 });
  return new Response('{}', { status: 200 });
};

const { default: handler } = await import('../../api/stripe-webhook.js');

async function sign(payload) {
  const ts = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${ts},v1=${hex}`;
}

async function envoyer(event, h = handler) {
  const payload = JSON.stringify(event);
  return h(new Request('https://emploia.eu/api/stripe-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': await sign(payload) },
    body: payload,
  }));
}

let passed = 0, failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const DAY = 86400000;
const INCONNU = 'froid@exemple.fr';
const CONNU = 'connu@exemple.fr';
// Rend `null` pour une clé absente, comme `kvGet` : sans ça, un `=== null`
// comparait à `undefined` et une assertion « aucun compte créé » passait pour
// la mauvaise raison — elle a échoué au premier essai, ce qui l'a révélé.
const lire = (k) => {
  if (!store.has(k)) return null;
  const v = store.get(k);
  try { return JSON.parse(v); } catch { return v; }
};
const jours = iso => (new Date(iso).getTime() - Date.now()) / DAY;

const achat = (id, over = {}) => ({
  id,
  type: 'checkout.session.completed',
  data: { object: {
    id: over.sessionId || 'cs_live_test',
    mode: 'payment',
    customer: 'cus_stub',
    customer_details: { email: over.email === null ? undefined : (over.email || INCONNU) },
    amount_total: 5900,
    currency: 'eur',
    metadata: {
      plan: 'campagne',
      consent_immediate: 'true',
      consent_at: '2026-10-16T09:12:00.000Z',
      ...(over.affiliate ? { affiliate: over.affiliate } : {}),
    },
    ...over.session,
  } },
});

// ── A. L'ACHETEUR INCONNU — le parcours du brief ────────────────────────────
console.log('\n[A] Acheteur inconnu : le compte est créé et l’accès accordé');
store.clear(); emailsEnvoyes.length = 0;
await envoyer(achat('evt_inconnu_1'));
const cree = lire(`user:${INCONNU}`);
check('un compte existe pour l’adresse du paiement', !!cree);
check('il porte proUntil ≈ +90 jours', cree && Math.abs(jours(cree.proUntil) - 90) < 0.1,
  cree ? `${jours(cree.proUntil).toFixed(2)} j` : 'aucun compte');
check('son plan reste free (sinon getCurrentUser ignore le grant)', cree?.plan === 'free', `plan=${cree?.plan}`);
check('campagnePurchasedAt est horodaté', !!cree?.campagnePurchasedAt);
check('l’index userid:{id} → email est posé', lire(`userid:${cree?.id}`) === INCONNU);
check('le mapping stripe:{customer} → email est posé', lire('stripe:cus_stub') === INCONNU);

// Le compte n'a AUCUN mot de passe utilisable. Pas un hash d'un secret deviné :
// aucun champ. `api/auth/login.js` refuse un compte sans passwordHash, donc le
// lien signé est l'unique porte d'entrée.
console.log('\n[A bis] Le compte créé n’a aucun mot de passe utilisable');
check('aucun passwordHash', cree?.passwordHash === undefined, `passwordHash=${String(cree?.passwordHash)}`);
check('aucun passwordSalt', cree?.passwordSalt === undefined);
for (const champ of ['password', 'motDePasse', 'tempPassword', 'defaultPassword']) {
  check(`aucun champ « ${champ} »`, cree?.[champ] === undefined);
}
// Et aucune valeur du compte ne doit ressembler à un mot de passe dérivé de
// l'adresse — la tentation classique quand on crée un compte sans secret.
const valeurs = JSON.stringify(cree || {}).toLowerCase();
check('rien qui dérive de l’adresse ne sert de secret',
  !valeurs.includes('froid123') && !valeurs.includes('emploia2026'));

// ── B. LE CONSENTEMENT, LU ET NON SUPPOSÉ ───────────────────────────────────
// Il est recueilli AVANT le paiement (le checkout refuse `consent !== true`),
// horodaté et transporté dans les metadata Stripe. Le webhook n'en lisait rien.
console.log('\n[B] Le consentement est lu depuis Stripe et inscrit sur le compte');
check('consentImmediate est inscrit', cree?.consentImmediate === true);
check('consentAt reprend l’horodatage de Stripe', cree?.consentAt === '2026-10-16T09:12:00.000Z', String(cree?.consentAt));
check('le compte est marqué comme non vérifié (pas de double opt-in)', cree?.emailVerified === false);
check('l’origine de l’adresse est tracée', cree?.emailSource === 'stripe_payment');
check('l’origine du compte est tracée', cree?.createdVia === 'stripe_checkout');
// Un horodatage illisible ne doit pas être remplacé par « maintenant » :
// dater le consentement à la réception du paiement serait fabriquer la preuve.
store.clear();
await envoyer(achat('evt_consent_bidon', { session: { metadata: { plan: 'campagne', consent_immediate: 'true', consent_at: 'pas-une-date' } } }));
check('un consentAt illisible vaut null, jamais la date du jour',
  lire(`user:${INCONNU}`)?.consentAt === null, String(lire(`user:${INCONNU}`)?.consentAt));

// ── C. L'EMAIL ANNONCE LE COMPTE, FRANCHEMENT ───────────────────────────────
console.log('\n[C] L’email annonce explicitement la création du compte');
store.clear(); emailsEnvoyes.length = 0;
await envoyer(achat('evt_email'));
const mail = emailsEnvoyes.find(e => e.to?.includes(INCONNU));
check('un email part vers l’acheteur', !!mail);
const corps = mail?.html || '';
check('il dit qu’un compte a été créé', /créé un compte/i.test(corps));
// Dans le CORPS, pas en bas de page : la mention doit arriver avant le bouton
// d'action, sinon elle est découverte après coup.
const posMention = corps.search(/créé un compte/i);
const posBouton = corps.search(/Choisir mon mot de passe/i);
check('la mention précède le bouton d’action', posMention > 0 && posMention < posBouton,
  `mention@${posMention} bouton@${posBouton}`);
check('il nomme l’adresse utilisée et dit d’où elle vient', corps.includes(INCONNU) && /celle de votre paiement/i.test(corps));
check('il porte un lien de définition de mot de passe', /\/reset-password\?token=[0-9a-f-]{36}/.test(corps));
check('il dit la durée de validité du lien', /valable <strong>7 jours/i.test(corps));
check('il dit que l’accès court déjà', /accès court déjà/i.test(corps));
check('il rappelle qu’il n’y a pas d’abonnement', /rien ne sera reconduit/i.test(corps));
check('il offre une sortie (suppression + remboursement)', /le supprimons/i.test(corps) && /remboursement/i.test(corps));
check('le sujet annonce le mot de passe', /mot de passe/i.test(mail?.subject || ''), mail?.subject);
// Le token de l'email doit être le VRAI token en KV, et pointer sur l'acheteur.
const token = (corps.match(/token=([0-9a-f-]{36})/) || [])[1];
const reset = token ? lire(`reset:${token}`) : null;
check('le token existe en KV et désigne l’acheteur', reset?.email === INCONNU);
check('sa fenêtre est de 7 jours, portée par l’enregistrement', reset?.ttlMs === 7 * 24 * 3600 * 1000, String(reset?.ttlMs));
check('le lien réutilise le mécanisme de réinitialisation (clé reset:)', !!reset);

// Le lien doit être ACCEPTÉ par le handler de réinitialisation après plus
// d'une heure. C'est le bout de chaîne : un lien émis à sept jours mais validé
// contre une fenêtre d'une heure en dur laisserait dehors un client qui a payé
// et lit son mail le soir. Vérifié en exécutant le vrai handler sur un
// enregistrement vieilli — et ce cas n'était couvert par rien quand il a été
// réintroduit à titre d'essai.
console.log('\n[C bis] Le lien à 7 jours est honoré au-delà d’une heure');
const { default: resetHandler } = await import('../../api/auth/reset-password.js');
async function tenterReset(tokenTest, ageMs, ttlMs) {
  store.set(`reset:${tokenTest}`, JSON.stringify({
    email: INCONNU, createdAt: Date.now() - ageMs, ...(ttlMs ? { ttlMs } : {}), origine: 'achat',
  }));
  const r = await resetHandler(new Request('https://emploia.eu/api/auth/reset-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: tokenTest, password: 'MotDePasse1' }),
  }));
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const SEPT_J = 7 * 24 * 3600 * 1000;
const apres3h = await tenterReset(crypto.randomUUID(), 3 * 3600 * 1000, SEPT_J);
check('un lien d’achat de 3 h est accepté', apres3h.status === 200,
  `HTTP ${apres3h.status} ${apres3h.body.error || ''}`);
const apres8j = await tenterReset(crypto.randomUUID(), 8 * 24 * 3600 * 1000, SEPT_J);
check('au-delà de 7 jours il est refusé', apres8j.status === 400, `HTTP ${apres8j.status}`);
// Et un lien ordinaire (forgot-password, sans ttlMs) garde sa fenêtre d'une
// heure : la souplesse ne doit pas s'appliquer à tout le monde.
const ordinaire = await tenterReset(crypto.randomUUID(), 2 * 3600 * 1000, null);
check('un lien sans ttlMs reste limité à une heure', ordinaire.status === 400, `HTTP ${ordinaire.status}`);
const ordinaireFrais = await tenterReset(crypto.randomUUID(), 10 * 60 * 1000, null);
check('un lien sans ttlMs de 10 min reste accepté', ordinaireFrais.status === 200, `HTTP ${ordinaireFrais.status}`);
check('reset-password honore la fenêtre portée par l’enregistrement',
  /Number\.isFinite\(resetData\?\.ttlMs\) \? resetData\.ttlMs : 3_600_000/
    .test(fs.readFileSync(new URL('../../api/auth/reset-password.js', import.meta.url), 'utf8')));

// ── D. L'ACHETEUR CONNU — même octroi, pas une seconde implémentation ───────
console.log('\n[D] Acheteur connu : même fonction d’octroi, email inchangé');
store.clear(); emailsEnvoyes.length = 0;
store.set(`user:${CONNU}`, JSON.stringify({ id: 'u_1', email: CONNU, name: 'Alice Durand', plan: 'free' }));
await envoyer(achat('evt_connu', { email: CONNU }));
const connu = lire(`user:${CONNU}`);
check('proUntil ≈ +90 jours, comme pour l’inconnu', Math.abs(jours(connu.proUntil) - 90) < 0.1, `${jours(connu.proUntil).toFixed(2)} j`);
check('son nom est préservé', connu.name === 'Alice Durand');
check('aucun consentImmediate n’est tamponné sur un compte existant', connu.consentImmediate === undefined);
const mailConnu = emailsEnvoyes.find(e => e.to?.includes(CONNU));
check('il ne reçoit PAS l’email de création de compte', !/créé un compte/i.test(mailConnu?.html || ''));
check('il ne reçoit aucun lien de mot de passe', !/reset-password\?token=/.test(mailConnu?.html || ''));
check('aucun token de réinitialisation n’est émis pour lui',
  ![...store.keys()].some(k => k.startsWith('reset:')));

// Un proUntil déjà actif est PROLONGÉ, pour les deux parcours.
store.clear();
store.set(`user:${CONNU}`, JSON.stringify({ id: 'u_1', email: CONNU, plan: 'free', proUntil: new Date(Date.now() + 30 * DAY).toISOString() }));
await envoyer(achat('evt_connu_2', { email: CONNU }));
check('un proUntil actif est prolongé à 30+90 = 120 j',
  Math.abs(jours(lire(`user:${CONNU}`).proUntil) - 120) < 0.1,
  `${jours(lire(`user:${CONNU}`).proUntil).toFixed(2)} j`);

// ── E. IDEMPOTENCE : un rejeu ne crée qu’un compte, n’accorde qu’une fois ───
console.log('\n[E] Rejeu : un seul compte, un seul octroi');
store.clear(); emailsEnvoyes.length = 0;
await envoyer(achat('evt_rejeu'));
const avant = lire(`user:${INCONNU}`);
const nbEmails = emailsEnvoyes.length;
const res2 = await envoyer(achat('evt_rejeu'));
const body2 = await res2.json();
const apres = lire(`user:${INCONNU}`);
check('le rejeu signale duplicate:true', body2.duplicate === true, JSON.stringify(body2));
check('proUntil est inchangé — aucun jour de plus', apres.proUntil === avant.proUntil, `${jours(apres.proUntil).toFixed(2)} j`);
check('l’identifiant du compte est inchangé — pas de second compte', apres.id === avant.id);
check('aucun second email n’est envoyé', emailsEnvoyes.length === nbEmails, `${emailsEnvoyes.length} email(s)`);
check('aucun second token n’est émis',
  [...store.keys()].filter(k => k.startsWith('reset:')).length === 1);

// ── F. LE FILET : AUCUNE SORTIE SILENCIEUSE ─────────────────────────────────
// Les trois sorties écrivent un enregistrement et alertent. Le filet reste
// utile même avec l'octroi automatique : il attrape ce qu'on n'a pas prévu.
console.log('\n[F] Les trois sorties écrivent un enregistrement et alertent');

// F1 — aucune adresse transmise : le seul cas que l'octroi ne peut pas couvrir.
store.clear(); emailsEnvoyes.length = 0;
await envoyer(achat('evt_sans_email', { email: null, sessionId: 'cs_live_sans_email' }));
const orph1 = lire('orphan-payment:cs_live_sans_email');
check('sans adresse → enregistrement orphan-payment:{sessionId}', !!orph1);
check('la raison est nommée', orph1?.reason === 'no_email_on_session', orph1?.reason);
check('le montant est conservé en centimes, comme Stripe', orph1?.amountTotal === 5900);
check('la devise est conservée', orph1?.currency === 'eur');
check('resolved est false — c’est un humain qui tranche', orph1?.resolved === false);
check('createdAt est en ISO 8601', typeof orph1?.createdAt === 'string' && orph1.createdAt.endsWith('Z'));
const alerte1 = emailsEnvoyes.find(e => e.to?.includes('hugo@emploia.eu'));
check('une alerte part vers l’administrateur', !!alerte1);
check('elle porte le montant en euros, lisible', /59\.00 EUR/.test(alerte1?.html || ''));
check('elle porte le sessionId pour agir dans Stripe', (alerte1?.html || '').includes('cs_live_sans_email'));
check('elle dit quoi faire', /rembourser/i.test(alerte1?.html || ''));
check('l’index des paiements orphelins est alimenté',
  store.get('set:orphan_payments')?.has('cs_live_sans_email'));

// F2 — échec de renouvellement sur une adresse sans compte : la TROISIÈME
// sortie, absente du brief.
store.clear(); emailsEnvoyes.length = 0;
await envoyer({ id: 'evt_failed', type: 'invoice.payment_failed',
  data: { object: { id: 'in_test', customer: 'cus_x', customer_email: 'nulle-part@exemple.fr', amount_due: 1900, currency: 'eur', attempt_count: 2 } } });
const orph2 = lire('orphan-payment:in_test');
check('invoice.payment_failed sans compte → enregistrement', !!orph2);
check('la raison est no_account_on_failure', orph2?.reason === 'no_account_on_failure', orph2?.reason);
check('le nombre de tentatives est conservé', orph2?.extra?.attemptCount === 2);
check('une alerte part aussi dans ce cas',
  emailsEnvoyes.some(e => e.to?.includes('hugo@emploia.eu')));

// F3 — un enregistrement résolu à la main n'est pas remis à zéro par un rejeu.
store.clear(); emailsEnvoyes.length = 0;
store.set('orphan-payment:cs_live_resolu', JSON.stringify({ sessionId: 'cs_live_resolu', resolved: true, reason: 'no_email_on_session' }));
await envoyer(achat('evt_resolu', { email: null, sessionId: 'cs_live_resolu' }));
check('un paiement déjà résolu à la main n’est pas rouvert',
  lire('orphan-payment:cs_live_resolu')?.resolved === true);

// Et la commission du créateur est versée AVANT toute sortie — chemin déjà
// juste sur main, vérifié ici en non-régression : la vente a eu lieu grâce au
// créateur, même si l'acheteur n'a pas de compte.
console.log('\n[F bis] Non-régression : la commission reste versée');
store.clear();
await envoyer(achat('evt_affilie', { email: null, affiliate: 'LECODE', sessionId: 'cs_aff' }));
check('le créateur est crédité même sans adresse acheteur',
  Number(store.get('affiliate:LECODE:sales')) === 1, String(store.get('affiliate:LECODE:sales')));

// ── G. client_reference_id, lu EN PREMIER ───────────────────────────────────
// Le cas courant : quelqu'un paie avec l'adresse de son compte bancaire,
// différente de celle de son compte Emploia. Sans ce lien, l'accès serait
// accordé à un compte que l'acheteur ne possède pas.
console.log('\n[G] client_reference_id est lu avant toute adresse');
store.clear(); emailsEnvoyes.length = 0;
store.set('userid:u_42', JSON.stringify(CONNU));
store.set(`user:${CONNU}`, JSON.stringify({ id: 'u_42', email: CONNU, name: 'Bob', plan: 'free' }));
await envoyer(achat('evt_ref', { email: 'carte-bancaire@autre.fr', session: { client_reference_id: 'u_42' } }));
check('l’accès va au compte désigné par client_reference_id',
  Math.abs(jours(lire(`user:${CONNU}`).proUntil) - 90) < 0.1);
check('aucun compte n’est créé pour l’adresse de la carte',
  lire('user:carte-bancaire@autre.fr') === null);
// Un identifiant inconnu ou malformé ne doit pas bloquer la livraison : on
// retombe sur l'adresse, qui reste une résolution valide.
store.clear(); emailsEnvoyes.length = 0;
await envoyer(achat('evt_ref_inconnu', { session: { client_reference_id: 'u_inexistant' } }));
check('un client_reference_id inconnu retombe sur l’adresse',
  Math.abs(jours(lire(`user:${INCONNU}`).proUntil) - 90) < 0.1);
store.clear();
await envoyer(achat('evt_ref_injection', { session: { client_reference_id: '../../admin' } }));
check('un client_reference_id malformé est ignoré, pas interprété',
  lire(`user:${INCONNU}`) !== null && lire('user:../../admin') === null);
// Et il est bien posé par le checkout quand l'acheteur est connecté.
const checkoutSrc = fs.readFileSync(new URL('../../api/stripe-checkout.js', import.meta.url), 'utf8');
check('le checkout pose client_reference_id depuis la session authentifiée',
  /client_reference_id: sessionUser\.id/.test(checkoutSrc));
check('il le conditionne à un utilisateur connecté',
  /sessionUser\?\.id \? \{ client_reference_id/.test(checkoutSrc));

// ── H. LA SONDE ÉCHOUE-T-ELLE SI ON REMET LE `break` ? ──────────────────────
// Le critère qui prouve que tout ce qui précède teste bien quelque chose. On
// réécrit le handler en mémoire pour y réintroduire le défaut d'origine, on le
// réexécute, et on vérifie que le compte n'est PAS créé. Si cette section
// passait, c'est que les sections A à C mesuraient autre chose.
console.log('\n[H] La sonde détecte la réintroduction du défaut');
const webhookSrc = fs.readFileSync(new URL('../../api/stripe-webhook.js', import.meta.url), 'utf8');
// Le défaut d'origine, remis à l'identique : chercher le compte, abandonner.
const avecDefaut = webhookSrc.replace(
  /let compte;\n\s*try \{\n\s*compte = await preparerCompte\(normalizedEmail, session\);[\s\S]*?break;\n\s*\}\n/,
  'const __u = await kvGet(`user:${normalizedEmail}`);\n          if (!__u) break;\n          let compte = { user: __u, cree: false };\n',
);
check('le défaut a bien pu être réinjecté dans une copie du handler',
  avecDefaut !== webhookSrc && /if \(!__u\) break;/.test(avecDefaut));

if (avecDefaut !== webhookSrc) {
  // Exécuté dans un module isolé, à partir du source modifié : les imports
  // relatifs sont réécrits en absolus pour que le module charge hors du dossier.
  const apiDir = new URL('../../api/', import.meta.url).href;
  const isole = avecDefaut.replace(/from '\.\/(_lib\/[a-z]+\.js)'/g, (_, p) => `from '${apiDir}${p}'`);
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(isole, 'utf8').toString('base64');
  const { default: handlerCasse } = await import(dataUrl);

  store.clear(); emailsEnvoyes.length = 0;
  await envoyer(achat('evt_defaut'), handlerCasse);
  const rien = lire(`user:${INCONNU}`);
  check('AVEC le break, aucun compte n’est créé — la sonde verrait la régression',
    rien === null, rien ? 'un compte a été créé malgré le break' : 'aucun compte, comme attendu');
  check('AVEC le break, aucun accès n’est accordé', !rien?.proUntil);
  check('AVEC le break, aucun email ne part vers l’acheteur',
    !emailsEnvoyes.some(e => e.to?.includes(INCONNU)));
  // Et le handler d'origine, lui, crée le compte : la différence entre les deux
  // est exactement ce que la mission corrige.
  store.clear(); emailsEnvoyes.length = 0;
  await envoyer(achat('evt_corrige'));
  check('SANS le break, le compte est créé — la différence est le correctif',
    lire(`user:${INCONNU}`) !== null);
}

// ── I. Aucun `break` nu ne subsiste sur un chemin d'argent ─────────────────
console.log('\n[I] Plus aucune sortie nue sur un chemin d’argent');
const sansCommentaires = webhookSrc.replace(/\/\/.*$/gm, '');
// Les trois sorties historiques doivent toutes passer par le filet.
for (const motif of [/if \(!email\) break;/, /if \(!user\) break;/]) {
  check(`le motif ${motif} n’existe plus`, !motif.test(sansCommentaires));
}
const appelsFilet = (sansCommentaires.match(/enregistrerPaiementOrphelin\(/g) || []).length;
check('le filet est appelé sur les trois sorties', appelsFilet === 3, `${appelsFilet} appel(s)`);
const orphanSrc = fs.readFileSync(new URL('../../api/_lib/orphan.js', import.meta.url), 'utf8');
check('les raisons sont un vocabulaire fermé', /RAISONS_ORPHELINES = new Set/.test(orphanSrc));
check('une raison hors vocabulaire devient « unknown »', /return RAISONS_ORPHELINES\.has\(r\) \? r : 'unknown'/.test(orphanSrc));
// Commentaires retirés : le fichier explique justement « jamais de throw »,
// et un test qui se déclenche sur sa propre documentation finit désarmé.
const orphanCode = orphanSrc.replace(/\/\/.*$/gm, '');
check('le filet n’est pas sur le chemin d’échec du paiement (jamais de throw)',
  /catch \(e\) \{/.test(orphanCode) && !/\bthrow\b/.test(orphanCode));

globalThis.fetch = realFetch;
if (failed) { console.error(`\n❌ sonde de l'achat anonyme : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde de l'achat anonyme : ${passed} vérifications OK\n`);
