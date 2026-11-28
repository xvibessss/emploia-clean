// Sonde « Prêts à postuler » (/decouvrir) : logique pure de api/_lib/prets.js
// et handler api/prets.js derrière un faux Upstash. Hors ligne.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.JWT_SECRET = randomBytes(24).toString('hex');
process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 't';

const store = new Map();
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith('https://kv.test')) throw new Error('réseau interdit : ' + u);
  const [op, key, ...a] = JSON.parse(init.body || '[]');
  const O = String(op).toUpperCase();
  let result = null;
  if (O === 'GET') result = store.get(key) ?? null;
  else if (O === 'SET') { store.set(key, String(a[0])); result = 'OK'; }
  else if (O === 'INCR') { const v = Number(store.get(key) || 0) + 1; store.set(key, String(v)); result = v; }
  else if (O === 'EXPIRE') result = 1;
  return Response.json({ result });
};

const L = await import('../../api/_lib/prets.js');
const auth = await import('../../api/_lib/auth.js');
const handler = (await import('../../api/prets.js')).default;

let echecs = 0, ok = 0;
async function test(nom, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nom); }
  catch (e) { echecs++; console.log('  ✗ ' + nom + '\n     ' + (e.message || e)); }
}

console.log('── logique (api/_lib/prets.js)');
const CV = `CAMILLE MARTIN\nComptable — Lyon\n\nPROFIL\nComptable, 3 ans en cabinet : révision des comptes, déclarations de TVA, liasses fiscales sous Cegid.\n\nEXPÉRIENCES\n- Fiducial, Lyon (2021-2024) : tenue de 40 dossiers, révision et bilans.\n\nCOMPÉTENCES\nCegid, Excel, TVA, liasses fiscales`;
await test('la section « À PRÉCISER AVANT D\'ENVOYER » est séparée du CV', () => {
  const { cv, aPreciser } = L.separerAPreciser(CV + "\n\n━━━━━━━━\nÀ PRÉCISER AVANT D'ENVOYER\n- Anglais courant demandé : non mentionné\n- Téléphone [à compléter]");
  assert.ok(!/PRÉCISER/.test(cv), 'le titre reste dans le CV');
  assert.ok(cv.endsWith('liasses fiscales'), 'le CV est tronqué ou garde des séparateurs : ' + JSON.stringify(cv.slice(-30)));
  assert.match(aPreciser, /Anglais courant/);
});
await test('variantes du titre (sans accent, markdown, apostrophe typographique)', () => {
  for (const t of ['## A PRECISER AVANT D’ENVOYER :', '**À PRÉCISER AVANT D\'ENVOYER**', 'à préciser avant d\'envoyer']) {
    const { cv, aPreciser } = L.separerAPreciser(CV + '\n\n' + t + '\n- point');
    assert.equal(aPreciser, '- point', t); assert.ok(!cv.includes('point'), t);
  }
});
await test('« Rien à préciser » ne crée pas de section vide', () => {
  assert.equal(L.separerAPreciser(CV + "\n\nÀ PRÉCISER AVANT D'ENVOYER\nRien à préciser.").aPreciser, '');
});
await test('un CV sans la section reste entier', () => {
  assert.deepEqual(L.separerAPreciser(CV), { cv: CV.trim(), aPreciser: '' });
});
await test('motsAjoutes : seulement les mots de l\'offre présents dans le CV et absents du profil', () => {
  const offre = 'Comptable H/F — révision des comptes, liasses fiscales, TVA. Logiciel Cegid. Anglais apprécié.';
  const profil = 'Camille, comptable 3 ans chez Fiducial. Bilans, TVA, Cegid, Excel.';
  const m = L.motsAjoutes(offre, CV, profil);
  assert.ok(m.includes('révision') && m.includes('liasses') && m.includes('fiscales'), JSON.stringify(m));
  assert.ok(!m.map((x) => x.toLowerCase()).includes('tva'), 'TVA était déjà dans le profil');
  assert.ok(!m.map((x) => x.toLowerCase()).includes('anglais'), 'Anglais n\'est pas dans le CV : rien ne doit l\'affirmer');
  assert.ok(!m.map((x) => x.toLowerCase()).includes('comptable'), 'mot du profil');
});
await test('motsAjoutes garde la graphie de l\'offre et ignore les mots d\'annonce', () => {
  const m = L.motsAjoutes('Poste en CDI. Mission : Consolidation IFRS. Rejoindre notre équipe.', 'consolidation ifrs mission poste equipe cdi', '');
  assert.deepEqual(m.sort(), ['Consolidation', 'IFRS']);
});
await test('nbACompleter compte les marqueurs', () => {
  assert.equal(L.nbACompleter('Tel [à compléter] — CA [à compléter : +X %] [A COMPLETER]'), 3);
});
await test('normaliserOffre refuse une URL non http(s) et borne les champs', () => {
  const o = L.normaliserOffre({ id: 'x', title: 'T'.repeat(500), url: 'javascript:alert(1)', salary: 'None' });
  assert.equal(o.url, ''); assert.equal(o.title.length, 200); assert.equal(o.salary, '');
});
await test('ajouterPret remplace la même offre, garde le plus récent en tête, borne à MAX_PRETS', () => {
  let l = [];
  for (let i = 0; i < L.MAX_PRETS + 5; i++) l = L.ajouterPret(l, { id: 'p' + i, offre: { id: 'o' + i } });
  assert.equal(l.length, L.MAX_PRETS); assert.equal(l[0].id, 'p' + (L.MAX_PRETS + 4));
  l = L.ajouterPret(l, { id: 'nouveau', offre: { id: 'o' + (L.MAX_PRETS + 4) } });
  assert.equal(l.filter((p) => p.offre.id === 'o' + (L.MAX_PRETS + 4)).length, 1);
});

console.log('── handler (api/prets.js)');
store.set('userid:u1', 'a@example.com');
store.set('user:a@example.com', JSON.stringify({ id: 'u1', email: 'a@example.com', plan: 'free' }));
store.set('userid:u2', 'b@example.com');
store.set('user:b@example.com', JSON.stringify({ id: 'u2', email: 'b@example.com', plan: 'free' }));
const cookieA = `__Host-emploia-token=${await auth.signToken('u1')}`;
const cookieB = `__Host-emploia-token=${await auth.signToken('u2')}`;
const appel = (method, { cookie, body, query = '' } = {}) => handler(new Request('https://emploia.eu/api/prets' + query, {
  method, headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.5', ...(cookie ? { cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
}));
const OFFRE = { id: 'az_1', title: 'Comptable (H/F)', company: 'Cabinet A', location: 'Lyon', type: 'CDI', url: 'https://example.com/offre', salary: 'None' };
let idPret;
await test('sans session : 401', async () => { assert.equal((await appel('GET')).status, 401); });
await test('POST enregistre le prêt avec ce qui a été adapté', async () => {
  const r = await appel('POST', { cookie: cookieA, body: { offre: OFFRE, description: 'Révision des comptes, liasses fiscales, TVA.', cv: CV + "\n\nÀ PRÉCISER AVANT D'ENVOYER\n- Téléphone [à compléter]", profil: 'Camille, comptable. TVA, Cegid.' } });
  assert.equal(r.status, 201);
  const { pret } = await r.json();
  idPret = pret.id;
  assert.equal(pret.statut, 'pret'); assert.equal(pret.offre.company, 'Cabinet A');
  assert.ok(!pret.cv.includes('PRÉCISER')); assert.match(pret.aPreciser, /Téléphone/);
  assert.ok(pret.ajoutes.includes('Révision') || pret.ajoutes.includes('révision'), JSON.stringify(pret.ajoutes));
  assert.equal(pret.offre.salary, '');
});
await test('POST refuse un CV vide ou une offre sans titre', async () => {
  assert.equal((await appel('POST', { cookie: cookieA, body: { offre: OFFRE, cv: 'court' } })).status, 400);
  assert.equal((await appel('POST', { cookie: cookieA, body: { offre: { id: 'x' }, cv: CV } })).status, 400);
});
await test('GET ne rend que les prêts de la session', async () => {
  assert.equal((await (await appel('GET', { cookie: cookieA })).json()).prets.length, 1);
  assert.equal((await (await appel('GET', { cookie: cookieB })).json()).prets.length, 0);
});
await test('PATCH : lettre et statut « postulé » ; un autre compte ne peut pas toucher le prêt', async () => {
  assert.equal((await appel('PATCH', { cookie: cookieB, body: { id: idPret, statut: 'postule' } })).status, 404);
  const r = await appel('PATCH', { cookie: cookieA, body: { id: idPret, lettre: 'Madame, Monsieur…', statut: 'postule' } });
  const { pret } = await r.json();
  assert.equal(pret.statut, 'postule'); assert.ok(pret.postuleLe); assert.equal(pret.lettre, 'Madame, Monsieur…');
  assert.equal((await (await appel('PATCH', { cookie: cookieA, body: { id: idPret, statut: 'nimporte' } })).json()).pret.statut, 'postule');
});
await test('DELETE retire le prêt', async () => {
  assert.equal((await appel('DELETE', { cookie: cookieB, query: '?id=' + idPret })).status, 200);
  assert.equal((await (await appel('GET', { cookie: cookieA })).json()).prets.length, 1, 'B a supprimé chez A');
  await appel('DELETE', { cookie: cookieA, query: '?id=' + idPret });
  assert.equal((await (await appel('GET', { cookie: cookieA })).json()).prets.length, 0);
});

if (echecs) { console.error(`\n❌ prêts à postuler : ${echecs} échec(s), ${ok} OK`); process.exit(1); }
console.log(`\n✅ prêts à postuler : ${ok} tests OK`);
