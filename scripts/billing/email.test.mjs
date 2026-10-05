#!/usr/bin/env node
// Tests du helper d'envoi partagé — run : node scripts/billing/email.test.mjs
//
// Couvre les deux défauts que ce helper remplace :
//   1. aucun reply_to, alors que des emails invitent le client à répondre
//      depuis une boîte technique inexistante
//   2. `.catch(() => {})` : un refus de Resend ne laissait aucune trace
import assert from 'node:assert/strict';
import { sendEmail, DEFAULT_REPLY_TO } from '../../api/_lib/email.js';

let passed = 0;
const test = async (nom, fn) => { await fn(); passed++; console.log('  ✓ ' + nom); };

const CHARGE = { from: 'Emploia <noreply@emploia.eu>', to: ['destinataire@exemple.test'],
                 subject: 'Sujet de test', html: '<p>corps</p>' };

const vraiFetch = globalThis.fetch;
const vraieErreur = console.error;

/** Remplace fetch et capture le corps envoyé. */
function stubFetch(reponse) {
  const vus = [];
  globalThis.fetch = async (_url, opts) => { vus.push(JSON.parse(opts.body)); return reponse; };
  return vus;
}
const ok = (id = 'msg_1') => ({ ok: true, status: 200, json: async () => ({ id }) });
const refus = (status, detail) => ({ ok: false, status, text: async () => detail });

/** Capture les appels à console.error. */
function stubErreur() {
  const lignes = [];
  console.error = (...args) => lignes.push(args);
  return lignes;
}

console.log('\n[1] reply_to');
await test('un reply_to est posé par défaut', async () => {
  const vus = stubFetch(ok());
  await sendEmail('cle_factice', CHARGE);
  assert.equal(vus[0].reply_to, DEFAULT_REPLY_TO);
  assert.equal(DEFAULT_REPLY_TO, 'contact@emploia.eu');
});
await test('un reply_to explicite n\'est pas écrasé', async () => {
  const vus = stubFetch(ok());
  await sendEmail('cle_factice', { ...CHARGE, reply_to: 'visiteur@exemple.test' });
  assert.equal(vus[0].reply_to, 'visiteur@exemple.test');
});
await test('la charge utile est transmise intacte', async () => {
  const vus = stubFetch(ok());
  await sendEmail('cle_factice', CHARGE);
  for (const champ of ['from', 'subject', 'html']) assert.deepEqual(vus[0][champ], CHARGE[champ]);
  assert.deepEqual(vus[0].to, CHARGE.to);
});

console.log('\n[2] les échecs sont visibles');
await test('un succès renvoie ok:true et l\'identifiant Resend', async () => {
  stubFetch(ok('msg_abc'));
  assert.deepEqual(await sendEmail('cle_factice', CHARGE), { ok: true, id: 'msg_abc' });
});
await test('un domaine non vérifié est journalisé, pas avalé', async () => {
  stubFetch(refus(403, 'The emploia.eu domain is not verified'));
  const lignes = stubErreur();
  const r = await sendEmail('cle_factice', CHARGE);
  console.error = vraieErreur;
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'rejected');
  assert.equal(r.status, 403);
  assert.equal(lignes.length, 1, 'un refus doit produire exactement une ligne d\'erreur');
  assert.match(JSON.stringify(lignes[0]), /not verified/, 'le détail de Resend doit être journalisé');
});
await test('une clé absente est signalée sans appel réseau', async () => {
  let appele = false;
  globalThis.fetch = async () => { appele = true; return ok(); };
  const lignes = stubErreur();
  const r = await sendEmail('', CHARGE);
  console.error = vraieErreur;
  assert.equal(appele, false, 'aucun appel réseau sans clé');
  assert.deepEqual(r, { ok: false, reason: 'missing_api_key' });
  assert.equal(lignes.length, 1);
});
await test('une panne réseau renvoie ok:false et journalise', async () => {
  globalThis.fetch = async () => { throw new Error('socket hang up'); };
  const lignes = stubErreur();
  const r = await sendEmail('cle_factice', CHARGE);
  console.error = vraieErreur;
  assert.deepEqual(r, { ok: false, reason: 'network' });
  assert.match(JSON.stringify(lignes[0]), /socket hang up/);
});

console.log('\n[3] non-régression — plus aucun appel Resend direct dans les trois fichiers corrigés');
const { readFileSync } = await import('node:fs');
for (const f of ['api/stripe-webhook.js', 'api/contact.js', 'api/trial-reminder.js']) {
  await test(`${f} passe par le helper partagé`, async () => {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /api\.resend\.com/, 'ne doit plus appeler Resend directement');
    assert.match(src, /from '\.\/_lib\/email\.js'/, 'doit importer le helper partagé');
  });
}

globalThis.fetch = vraiFetch;
console.log(`\n✅ ${passed} tests OK\n`);
