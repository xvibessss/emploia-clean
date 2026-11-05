// Sonde des correctifs de sécurité — comportements, pas forme du code.
//
// KV Upstash remplacé par un petit Redis en mémoire derrière un fetch stubé :
// les handlers tournent tels quels, sans réseau.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';

// Secrets de test tirés au hasard à chaque exécution : aucun littéral dans le
// dépôt (gitleaks les prendrait — à raison — pour des fuites).
const fauxSecret = () => randomBytes(24).toString('hex');
const ADMIN = fauxSecret(), CRON = fauxSecret(), HEALTH = fauxSecret();
process.env.JWT_SECRET = fauxSecret();
process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 't';
process.env.ADMIN_SECRET = ADMIN;
process.env.CRON_SECRET = CRON;

// ── mini Redis ───────────────────────────────────────────────────────────────
const store = new Map();
const sets = new Map();
const zsets = new Map();
function redis(cmd) {
  const [op, key, ...a] = cmd;
  switch (op) {
    case 'GET': return store.has(key) ? store.get(key) : null;
    case 'SET': {
      if (a.includes('NX') && store.has(key)) return null;
      store.set(key, a[0]); return 'OK';
    }
    case 'INCR': { const v = Number(store.get(key) || 0) + 1; store.set(key, String(v)); return v; }
    case 'DECR': { const v = Number(store.get(key) || 0) - 1; store.set(key, String(v)); return v; }
    case 'EXPIRE': return 1;
    case 'DEL': return store.delete(key) ? 1 : 0;
    case 'SADD': { const s = sets.get(key) || new Set(); a.forEach(m => s.add(m)); sets.set(key, s); return a.length; }
    case 'SREM': { const s = sets.get(key) || new Set(); a.forEach(m => s.delete(m)); return 1; }
    case 'SMEMBERS': return [...(sets.get(key) || [])];
    case 'ZADD': { const z = zsets.get(key) || []; z.push(a[1]); zsets.set(key, z); return 1; }
    case 'ZCARD': return (zsets.get(key) || []).length;
    case 'ZREMRANGEBYRANK': return 0;
    case 'MGET': return [key, ...a].map(k => (store.has(k) ? store.get(k) : null));
    default: throw new Error('commande non simulée: ' + op);
  }
}
const sortants = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith('https://kv.test')) {
    return new Response(JSON.stringify({ result: redis(JSON.parse(init.body)) }));
  }
  sortants.push(u);
  return new Response('{}', { status: 200 });
};
const kvPut = (k, v) => store.set(k, JSON.stringify(v));
const kvRead = (k) => (store.has(k) ? JSON.parse(store.get(k)) : null);

const auth = await import('../../api/_lib/auth.js');
const { creditReferral } = await import('../../api/_lib/referral.js');

let n = 0;
const test = async (nom, fn) => { await fn(); n++; console.log('  ✓ ' + nom); };
const req = (url, { method = 'GET', headers = {}, body } = {}) =>
  new Request(url, { method, headers: new Headers(headers), body });

console.log('\n[1] liens de désinscription signés');
await test('HMAC JS pur identique à node:crypto', () => {
  for (let i = 0; i < 300; i++) {
    const k = Math.random().toString(36).repeat(1 + (i % 9)), m = Math.random().toString(36).repeat(i % 45);
    assert.equal(auth.hmacSha256Hex(k, m), createHmac('sha256', k).update(m).digest('hex'));
  }
  assert.equal(auth.hmacSha256Hex('', ''), createHmac('sha256', '').update('').digest('hex'));
  assert.equal(auth.hmacSha256Hex('é'.repeat(70), 'ü'), createHmac('sha256', 'é'.repeat(70)).update('ü').digest('hex'));
});
await test('un jeton ne vaut que pour son adresse, casse comprise', () => {
  const t = auth.unsubscribeToken('Jean@Example.com');
  assert.ok(auth.verifyUnsubscribeToken('jean@example.com', t));
  assert.ok(!auth.verifyUnsubscribeToken('autre@example.com', t));
  assert.ok(!auth.verifyUnsubscribeToken('jean@example.com', '0'.repeat(32)));
});
const newsletter = (await import('../../api/newsletter.js')).default;
await test('newsletter : lien forgé refusé, optout non posé', async () => {
  const r = await newsletter(req('https://emploia.eu/api/newsletter?unsubscribe=victime%40example.com&t=' + '0'.repeat(32)));
  assert.equal(r.status, 400);
  assert.equal(kvRead('optout:victime@example.com'), null);
});
await test('newsletter : lien signé accepté', async () => {
  const r = await newsletter(req(auth.unsubscribeUrl('victime@example.com')));
  assert.equal(r.status, 200);
  assert.equal(kvRead('optout:victime@example.com'), true);
});

console.log('\n[2] CORS et cookie de session');
await test('un projet Vercel tiers nommé emploia-clean-* n’est pas reflété', () => {
  const o = (origin) => auth.getAllowedOrigin(req('https://emploia.eu/', { headers: { origin } }));
  assert.equal(o('https://emploia-clean-evil.vercel.app'), 'https://emploia.eu');
  assert.equal(o('https://emploia-cleanx.vercel.app'), 'https://emploia.eu');
  assert.equal(o('https://emploia-clean-abc123-xvibessss-projects.vercel.app'), 'https://emploia-clean-abc123-xvibessss-projects.vercel.app');
  assert.equal(o('https://emploia-clean-git-feat-x-xvibessss-projects.vercel.app'), 'https://emploia-clean-git-feat-x-xvibessss-projects.vercel.app');
  assert.equal(o('https://www.emploia.eu'), 'https://www.emploia.eu');
});
await test('seul le cookie __Host- authentifie', async () => {
  kvPut('userid:u_1', 'a@example.com');
  kvPut('user:a@example.com', { id: 'u_1', email: 'a@example.com', plan: 'free' });
  const tok = await auth.signToken('u_1');
  assert.equal((await auth.getCurrentUser(req('https://emploia.eu/', { headers: { cookie: `__Host-emploia-token=${tok}` } })))?.id, 'u_1');
  assert.equal(await auth.getCurrentUser(req('https://emploia.eu/', { headers: { cookie: `emploia-token=${tok}` } })), null);
  assert.equal(await auth.getCurrentUser(req('https://emploia.eu/', { headers: { cookie: `x__Host-emploia-token=${tok}` } })), null);
});

console.log('\n[3] secrets comparés à temps constant');
await test('bearerMatches / adminSecretMatches', () => {
  assert.ok(auth.bearerMatches(req('https://x/', { headers: { authorization: `Bearer ${CRON}` } }), CRON));
  assert.ok(!auth.bearerMatches(req('https://x/', { headers: { authorization: `Bearer ${CRON.slice(0, -1)}` } }), CRON));
  assert.ok(!auth.bearerMatches(req('https://x/'), undefined), 'secret absent ⇒ refus, même sans en-tête');
  assert.ok(!auth.bearerMatches({ headers: { authorization: 'Bearer ' } }, ''), 'Node style, secret vide');
  assert.ok(auth.adminSecretMatches({ headers: { 'x-admin-secret': ADMIN } }));
  assert.ok(!auth.adminSecretMatches(req('https://x/', { headers: { 'x-admin-secret': 'nope' } })));
});
const health = (await import('../../api/health.js')).default;
await test('health : le secret en query string ne donne plus le détail', async () => {
  process.env.HEALTH_SECRET = HEALTH;
  const r = await health(req(`https://emploia.eu/api/health?secret=${HEALTH}`));
  const d = await r.json();
  assert.equal(d.checks, undefined);
});

console.log('\n[4] parrainage');
const referral = (await import('../../api/referral.js')).default;
await test('POST /api/referral n’existe plus (405)', async () => {
  const r = await referral(req('https://emploia.eu/api/referral', { method: 'POST', body: JSON.stringify({ code: 'ABCDEFGH', newUserEmail: 'a@example.com' }) }));
  assert.equal(r.status, 405);
});
await test('crédit : parrain +30 j, filleul +14 j, une seule fois', async () => {
  kvPut('ref:PARRAIN1', { userId: 'u_p', email: 'p@example.com', signups: [], monthsEarned: 0 });
  kvPut('user:p@example.com', { id: 'u_p', email: 'p@example.com', plan: 'free' });
  const filleul = { id: 'u_f', email: 'f@example.com', plan: 'free' };
  kvPut('user:f@example.com', filleul);
  const r1 = await creditReferral('parrain1', filleul);
  assert.equal(r1.ok, true);
  const p = kvRead('user:p@example.com'), f = kvRead('user:f@example.com');
  assert.ok(new Date(p.proUntil) - Date.now() > 29 * 86400000);
  assert.ok(new Date(f.proUntil) - Date.now() > 13 * 86400000);
  assert.equal(f.referredBy, 'PARRAIN1');
  const r2 = await creditReferral('PARRAIN1', filleul);
  assert.equal(r2.ok, false);
});
await test('crédit : auto-parrainage et code inconnu refusés', async () => {
  assert.equal((await creditReferral('PARRAIN1', { email: 'p@example.com' })).ok, false);
  assert.equal((await creditReferral('INCONNU1', { email: 'z@example.com' })).ok, false);
  assert.equal((await creditReferral('<script>', { email: 'z@example.com' })).ok, false);
});

console.log('\n[5] compteurs du funnel');
const { trackEvent } = await import('../../api/_lib/track.js');
const track = (await import('../../api/track.js')).default;
function nodeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
await test('/api/track public ignore les événements serveur', async () => {
  const before = Number(store.get('track:plan_upgraded') || 0);
  const res = nodeRes();
  await track({ method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body: { event: 'plan_upgraded' } }, res);
  assert.equal(res.code, 202);
  assert.equal(Number(store.get('track:plan_upgraded') || 0), before);
  const res2 = nodeRes();
  await track({ method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body: { event: 'paywall_viewed' } }, res2);
  assert.equal(res2.code, 200);
});
await test('trackEvent côté serveur compte les événements serveur', async () => {
  await trackEvent('plan_upgraded', { plan: 'pro' });
  assert.equal(Number(store.get('track:plan_upgraded')), 1);
});

console.log('\n[6] offres');
const jobsSrc = (await import('node:fs')).readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');
await test('aucune offre fabriquée au nom d’un employeur réel', () => {
  for (const nom of ['BNP Paribas', 'Doctolib', "L'Oréal", 'Thales', 'Capgemini', 'LVMH']) {
    assert.ok(!jobsSrc.includes(`company:'${nom}'`) && !jobsSrc.includes(`company:"${nom}"`), nom);
  }
});
const manage = (await import('../../api/employer/manage-job.js')).default;
await test('offre employeur : en attente tant que l’email n’a pas confirmé', async () => {
  kvPut('employer_jobs', [{ id: 'emp_1', manageToken: 'a'.repeat(32), status: 'pending', title: 'Dev', company: 'ACME', postedAt: new Date().toISOString() }]);
  const renew = await manage(req('https://emploia.eu/api/employer/manage-job', { method: 'POST', body: JSON.stringify({ token: 'a'.repeat(32), action: 'renew' }) }));
  assert.equal(renew.status, 409);
  const ok = await manage(req('https://emploia.eu/api/employer/manage-job', { method: 'POST', body: JSON.stringify({ token: 'a'.repeat(32), action: 'confirm' }) }));
  assert.equal(ok.status, 200);
  assert.equal(kvRead('employer_jobs')[0].status, 'active');
});

console.log(`\n✓ sécurité : ${n} tests OK\n`);
