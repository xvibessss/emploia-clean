#!/usr/bin/env node
// Unit tests for the new pricing grid — Pack Campagne billing logic.
// No framework — run: node scripts/billing/campagne.test.mjs
//
// Covers the three traps that make a one-off Pack Campagne dangerous:
//   1. a replayed webhook handing out another 90 free days
//   2. proUntil being overwritten instead of prolonged
//   3. a Pack buyer ending up with an active Stripe subscription
//
// The webhook/checkout handlers themselves need Upstash + a Stripe key, so the
// unit tests exercise the pure grant helper (extendPro, the single shared
// implementation) and assert the handler *source* on the structural invariants
// that cannot be observed without a live Stripe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extendPro } from '../../api/_lib/auth.js';

const DAY = 86400000;
const CAMPAGNE_DAYS = 90;
const iso = ms => new Date(ms).toISOString();
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const checkoutSrc = readFileSync(new URL('../../api/stripe-checkout.js', import.meta.url), 'utf8');
const webhookSrc = readFileSync(new URL('../../api/stripe-webhook.js', import.meta.url), 'utf8');
const authSrc = readFileSync(new URL('../../api/_lib/auth.js', import.meta.url), 'utf8');
const referralSrc = readFileSync(new URL('../../api/referral.js', import.meta.url), 'utf8');

console.log('\n[1] extendPro — le mécanisme d\'octroi proUntil');

test('octroi sur un compte sans proUntil → +90j à partir de maintenant', () => {
  const before = Date.now();
  const granted = new Date(extendPro(null, CAMPAGNE_DAYS)).getTime();
  const expected = before + CAMPAGNE_DAYS * DAY;
  assert.ok(Math.abs(granted - expected) < 5000, `attendu ≈${iso(expected)}, obtenu ${iso(granted)}`);
});

test('PROLONGE un proUntil actif au lieu de l\'écraser', () => {
  // A referral already granted 30 days. Buying the Pack must give 30 + 90.
  const existing = iso(Date.now() + 30 * DAY);
  const granted = new Date(extendPro(existing, CAMPAGNE_DAYS)).getTime();
  const expected = new Date(existing).getTime() + CAMPAGNE_DAYS * DAY;
  assert.ok(Math.abs(granted - expected) < 5000, 'le proUntil existant doit être prolongé');
  assert.ok(granted > new Date(existing).getTime(), 'le nouveau proUntil doit dépasser l\'ancien');
});

test('un proUntil EXPIRÉ repart de maintenant, pas du passé', () => {
  const expired = iso(Date.now() - 200 * DAY);
  const granted = new Date(extendPro(expired, CAMPAGNE_DAYS)).getTime();
  const expected = Date.now() + CAMPAGNE_DAYS * DAY;
  assert.ok(Math.abs(granted - expected) < 5000, 'un grant expiré ne doit pas amputer les 90 jours');
  assert.ok(granted > Date.now(), 'le grant doit être dans le futur');
});

test('deux Packs successifs cumulent 180 jours', () => {
  const first = extendPro(null, CAMPAGNE_DAYS);
  const second = new Date(extendPro(first, CAMPAGNE_DAYS)).getTime();
  const expected = Date.now() + 2 * CAMPAGNE_DAYS * DAY;
  assert.ok(Math.abs(second - expected) < 5000, 'deux achats doivent cumuler');
});

console.log('\n[2] Une seule implémentation du grant');

test('extendPro est exporté par _lib/auth.js', () => {
  assert.match(authSrc, /export function extendPro\(/, 'extendPro doit être défini et exporté dans _lib/auth.js');
});

test('referral.js importe extendPro au lieu de le redéfinir', () => {
  assert.match(referralSrc, /import \{[^}]*extendPro[^}]*\} from '\.\/_lib\/auth\.js'/, 'referral.js doit importer extendPro');
  assert.doesNotMatch(referralSrc, /const extendPro\s*=/, 'referral.js ne doit pas redéfinir extendPro');
});

test('stripe-webhook.js importe extendPro au lieu de le redéfinir', () => {
  assert.match(webhookSrc, /import \{[^}]*extendPro[^}]*\} from '\.\/_lib\/auth\.js'/, 'le webhook doit importer extendPro');
  assert.doesNotMatch(webhookSrc, /const extendPro\s*=|function extendPro\(/, 'le webhook ne doit pas réimplémenter extendPro');
});

console.log('\n[3] stripe-checkout — mode payment vs subscription');

test('campagne → mode payment ; pro → mode subscription', () => {
  assert.match(checkoutSrc, /campagne:\s*\{[^}]*mode:\s*'payment'/, 'campagne doit être en mode payment');
  assert.match(checkoutSrc, /pro:\s*\{[^}]*mode:\s*'subscription'/, 'pro doit rester en mode subscription');
});

// Intensif was retired from sale on 2026-09-30. The catalogue is what decides
// what can be bought, so the guarantee is that no new checkout can create one —
// not that the string disappeared from the file (comments still mention it).
test('intensif est retiré du catalogue de vente', () => {
  const catalogue = checkoutSrc.match(/const PLANS = \{[\s\S]*?\n\};/);
  assert.ok(catalogue, 'le catalogue PLANS doit être trouvable');
  assert.doesNotMatch(catalogue[0], /intensif/, 'aucun plan intensif achetable');
});

// Grandfathered subscribers keep paying and must keep their access.
test('les abonnés Intensif existants restent honorés', () => {
  const webhookMap = readFileSync(new URL('../../api/stripe-webhook.js', import.meta.url), 'utf8');
  assert.match(webhookMap, /STRIPE_PRICE_INTENSIF\]:\s*'intensif'/, 'le webhook mappe encore le prix Intensif');
  const alertsSrc = readFileSync(new URL('../../api/alerts.js', import.meta.url), 'utf8');
  assert.match(alertsSrc, /plan === 'intensif'/, 'les droits Intensif restent reconnus');
});

test('trial_period_days est conditionné au mode subscription', () => {
  assert.match(
    checkoutSrc,
    /mode === 'subscription'\s*\?\s*\{\s*'subscription_data\[trial_period_days\]'/,
    'trial_period_days ne doit être envoyé que pour un abonnement',
  );
  // No unconditional trial anywhere: every occurrence must sit behind the guard.
  const trials = checkoutSrc.match(/subscription_data\[trial_period_days\]/g) || [];
  assert.equal(trials.length, 1, 'une seule mention de trial_period_days, derrière le garde-fou');
});

test('aucune référence aux Price annuels retirés', () => {
  assert.doesNotMatch(checkoutSrc, /ANNUAL/, 'stripe-checkout.js ne doit plus lire de Price annuel');
  assert.doesNotMatch(webhookSrc, /ANNUAL/, 'stripe-webhook.js ne doit plus lire de Price annuel');
});

test('STRIPE_PRICE_CAMPAGNE est lu depuis l\'environnement', () => {
  assert.match(checkoutSrc, /process\.env\.STRIPE_PRICE_CAMPAGNE/, 'le Price du Pack vient de l\'env');
});

console.log('\n[4] Webhook — idempotence et absence d\'abonnement');

test('le verrou kvSetNX est posé AVANT le switch, donc couvre le mode payment', () => {
  const lockIdx = webhookSrc.indexOf('kvSetNX(`webhook:${event.id}`');
  const switchIdx = webhookSrc.indexOf('switch (event.type)');
  const paymentIdx = webhookSrc.indexOf("session.mode === 'payment'");
  assert.ok(lockIdx > -1, 'le verrou kvSetNX doit exister');
  assert.ok(switchIdx > -1 && paymentIdx > -1);
  assert.ok(lockIdx < switchIdx, 'le verrou doit précéder le switch');
  assert.ok(lockIdx < paymentIdx, 'le verrou doit précéder le traitement du paiement unique');
  assert.match(webhookSrc, /kvSetNX\(`webhook:\$\{event\.id\}`, '1', 86400\)/, 'TTL 24h');
});

test('le verrou provoque une sortie anticipée sur rejeu', () => {
  // Between the lock and the switch there must be an early return on !isNew.
  const lockIdx = webhookSrc.indexOf('kvSetNX(`webhook:${event.id}`');
  const switchIdx = webhookSrc.indexOf('switch (event.type)');
  const between = webhookSrc.slice(lockIdx, switchIdx);
  assert.match(between, /if \(!isNew\)/, 'un rejeu doit être détecté');
  assert.match(between, /return new Response/, 'un rejeu doit sortir sans rien octroyer');
  assert.match(between, /duplicate: true/, 'la réponse doit signaler le doublon');
});

test('le chemin payment octroie proUntil via extendPro, +90 jours', () => {
  const branch = webhookSrc.slice(webhookSrc.indexOf("session.mode === 'payment'"));
  assert.match(branch, /extendPro\(user\.proUntil, CAMPAGNE_DAYS\)/, 'doit appeler extendPro sur le proUntil existant');
  assert.match(webhookSrc, /const CAMPAGNE_DAYS = 90/, 'le Pack vaut 90 jours');
});

test('le chemin payment ne crée ni abonnement ni plan payant en KV', () => {
  const start = webhookSrc.indexOf("session.mode === 'payment'");
  // Anchored on the first line of the subscription branch rather than on a
  // comment: a reworded comment must not silently widen the slice under test.
  const end = webhookSrc.indexOf('const planLabel', start);
  assert.ok(end > start, 'la branche payment doit être délimitée');
  const branch = webhookSrc.slice(start, end);
  assert.doesNotMatch(branch, /subscriptionId/, 'aucun subscriptionId ne doit être stocké pour un paiement unique');
  assert.doesNotMatch(branch, /plan:\s*plan|plan,/, "la branche ne doit pas écrire plan (sinon getCurrentUser ignore le grant)");
  assert.match(branch, /proUntil,/, 'la branche doit écrire proUntil');
});

test('getCurrentUser n\'honore le grant que si le plan est free/absent', () => {
  assert.match(
    authSrc,
    /\(!user\.plan \|\| user\.plan === 'free'\) && user\.proUntil/,
    'le grant proUntil est lu à condition que le plan ne soit pas déjà payant',
  );
});

console.log('\n[5] Grille tarifaire — cohérence des montants affichés');

test('le MRR admin utilise 24 / 49 et amortit le Pack à 59/3', () => {
  const statsSrc = readFileSync(new URL('../../api/admin/stats.js', import.meta.url), 'utf8');
  assert.match(statsSrc, /const PRO_PRICE = 24/, 'Pro à 24');
  // Intensif is no longer sold but grandfathered subscribers still pay 49 €,
  // so dropping the constant would silently under-report the MRR.
  assert.match(statsSrc, /const INTENSIF_PRICE = 49/, 'Intensif à 49 pour les abonnés existants');
  assert.match(statsSrc, /const CAMPAGNE_PRICE = 59/, 'Pack à 59');
  assert.match(statsSrc, /CAMPAGNE_PRICE \/ 3/, 'Pack amorti sur 3 mois');
});

// The Pack must stay cheaper per month than Pro, otherwise the cheapest offer
// is also the one carrying the "le plus avantageux" badge and Pro sells to
// nobody — the exact flaw of the retired 45 € price (45/3 = 15 < 19).
test('le Pack reste moins cher au mois que Pro, sans le cannibaliser', () => {
  const statsSrc = readFileSync(new URL('../../api/admin/stats.js', import.meta.url), 'utf8');
  const pro = Number(statsSrc.match(/const PRO_PRICE = (\d+)/)[1]);
  const pack = Number(statsSrc.match(/const CAMPAGNE_PRICE = (\d+)/)[1]);
  assert.ok(pack / 3 < pro, `le Pack (${pack}/3 = ${(pack / 3).toFixed(2)} €/mois) doit être sous Pro (${pro} €/mois)`);
  assert.ok(pack / 3 > pro * 0.7, `l'écart doit rester lisible : ${(pack / 3).toFixed(2)} vs ${pro} €/mois`);
});

test('le prompt support annonce la nouvelle grille, sans annuel ni coaching humain', () => {
  const supportSrc = readFileSync(new URL('../../api/agent/support.js', import.meta.url), 'utf8');
  assert.match(supportSrc, /Plan Pro : 24€\/mois/, 'Pro à 24€');
  assert.match(supportSrc, /Pack Campagne : 59€ les 3 mois/, 'Pack Campagne à 59€');
  assert.match(supportSrc, /PAS de plan Intensif/, 'le prompt doit dire qu\'Intensif n\'est plus vendu');
  // Retired grids: Pro 15 then 19 €/mois, Intensif 35 then 49, annual 144/348.
  assert.doesNotMatch(supportSrc, /144€|348€/, 'plus aucun tarif annuel');
  assert.doesNotMatch(supportSrc, /Plan Pro : (15|19)€/, 'plus aucun tarif Pro périmé');
  assert.doesNotMatch(supportSrc, /Pack Campagne : 45€/, 'plus aucun tarif Pack périmé');
  assert.match(supportSrc, /PAS de coaching humain/, 'le prompt doit nier explicitement le coaching humain');
});

console.log(`\n✅ ${passed} tests OK\n`);
