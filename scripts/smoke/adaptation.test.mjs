// Sonde de l'adaptation guidée (/adapter) : la validation des suggestions de
// l'IA (api/_lib/adaptation.js) et le handler api/generate/adaptation-guidee.js
// derrière un faux Upstash et une fausse IA. Hors ligne.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.JWT_SECRET = randomBytes(24).toString('hex');
process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 't';
process.env.ANTHROPIC_API_KEY = 'sk-ant-sonde';

const store = new Map();
let reponseIA = '';
let statutIA = 200;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url?.url || url);
  if (u.startsWith('https://kv.test')) {
    const [op, key, ...a] = JSON.parse(init.body || '[]');
    const O = String(op).toUpperCase();
    let result = null;
    if (O === 'GET') result = store.get(key) ?? null;
    else if (O === 'SET') { store.set(key, String(a[0])); result = 'OK'; }
    else if (O === 'INCR') { const v = Number(store.get(key) || 0) + 1; store.set(key, String(v)); result = v; }
    else if (O === 'DECR') { const v = Number(store.get(key) || 0) - 1; store.set(key, String(v)); result = v; }
    else result = 1;
    return Response.json({ result });
  }
  if (u.includes('anthropic.com')) {
    if (statutIA !== 200) return new Response('{}', { status: statutIA });
    return Response.json({ content: [{ type: 'text', text: reponseIA }] });
  }
  return Response.json({});
};

const A = await import('../../api/_lib/adaptation.js');
const { ANTI_EMBELLISSEMENT } = await import('../../api/_lib/prompts-candidature.js');
const auth = await import('../../api/_lib/auth.js');
const handler = (await import('../../api/generate/adaptation-guidee.js')).default;

let echecs = 0, ok = 0;
async function test(nom, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nom); }
  catch (e) { echecs++; console.log('  ✗ ' + nom + '\n     ' + (e.message || e)); }
}

const CV = `Ibtissam Benali
Community manager & créatrice de contenu

PROFIL
Chargée de communication, 2 ans chez Havas : réseaux sociaux, vidéos courtes, Canva.

EXPÉRIENCES
Havas, Paris (2023-2025)
- Gestion des comptes Instagram et TikTok de 4 marques
- Reporting mensuel des performances

COMPÉTENCES
Canva, Premiere Pro, anglais courant`;
const OFFRE = `Junior Marketing — social media & contenus vidéo courts. Missions : animer Instagram et TikTok, créer des contenus avec Canva et Premiere Pro, reporting. Profil : maîtrise de HubSpot et Google Analytics appréciée, anglais courant.`;

console.log('── validation des suggestions');
const BONNE = { section: 'Titre', avant: 'Community manager & créatrice de contenu', apres: 'Social media & contenus vidéo courts (junior)', pourquoi: "L'offre s'intitule ainsi." };
await test('une reformulation fidèle est gardée', () => {
  const { gardees, ecartees } = A.validerSuggestions([BONNE], CV);
  assert.equal(gardees.length, 1); assert.equal(ecartees.length, 0);
});
await test('un extrait absent du CV est écarté', () => {
  const { gardees, ecartees } = A.validerSuggestions([{ ...BONNE, avant: 'Responsable marketing digital' }], CV);
  assert.equal(gardees.length, 0); assert.equal(ecartees[0].motif, 'avant_absent_du_cv');
});
await test('une compétence ajoutée que le CV n\'a pas est écartée (HubSpot)', () => {
  const { gardees, ecartees } = A.validerSuggestions([{ section: 'Compétences', avant: 'Canva, Premiere Pro, anglais courant', apres: 'Canva, Premiere Pro, HubSpot, anglais courant' }], CV);
  assert.equal(gardees.length, 0); assert.match(ecartees[0].motif, /^competence_inventee:hubspot/);
});
await test('un chiffre inventé est écarté, un chiffre du CV est permis', () => {
  const invente = A.validerSuggestions([{ section: 'Expérience', avant: '- Reporting mensuel des performances', apres: '- Reporting mensuel : +35 % d\'engagement' }], CV);
  assert.equal(invente.gardees.length, 0); assert.match(invente.ecartees[0].motif, /^chiffre_invente:35/);
  const permis = A.validerSuggestions([{ section: 'Expérience', avant: '- Gestion des comptes Instagram et TikTok de 4 marques', apres: '- Animé les comptes Instagram et TikTok de 4 marques' }], CV);
  assert.equal(permis.gardees.length, 1);
});
await test('extrait recopié avec d\'autres espaces : accepté ; identique ou doublon : écarté', () => {
  const r = A.validerSuggestions([
    { ...BONNE, avant: 'Community   manager &\ncréatrice de contenu' },
    { ...BONNE, apres: 'Community manager & créatrice de contenu' },
    { ...BONNE },
  ], CV);
  assert.equal(r.gardees.length, 1);
  assert.deepEqual(r.ecartees.map((e) => e.motif).sort(), ['doublon', 'identique']);
});
await test('section inconnue ramenée à « Autre », au plus 8 suggestions', () => {
  const r = A.validerSuggestions(Array.from({ length: 12 }, (_, i) => ({ section: 'Bidule', avant: '', apres: 'Ligne reformulée numéro un' + 'x'.repeat(i) })), CV);
  assert.equal(r.gardees.length, A.MAX_SUGGESTIONS); assert.equal(r.gardees[0].section, 'Autre');
});
await test('questions : les compétences de l\'offre absentes du CV, posées, jamais écrites', () => {
  const q = A.questionsPour(OFFRE, CV);
  assert.ok(q.includes('hubspot') && q.includes('google-analytics'), q);
  assert.ok(!q.includes('canva') && !q.includes('anglais'), 'déjà dans le CV');
});
await test('score de couverture et motifs pour la page', () => {
  const s = A.score(OFFRE, CV);
  assert.ok(s > 0 && s < 100, String(s));
  assert.equal(A.score(OFFRE, CV + '\nHubSpot, Google Analytics'), 100);
  const m = A.motifsOffre(OFFRE);
  assert.ok(m.every((x) => typeof x.re === 'string' && new RegExp(x.re, 'i')));
});
await test('le prompt porte la règle anti-embellissement commune', () => {
  assert.ok(A.SYSTEME.includes(ANTI_EMBELLISSEMENT));
  assert.match(A.SYSTEME, /COPIÉ À L'IDENTIQUE/);
});
await test('lireReponse lit le JSON même entouré de texte', () => {
  assert.equal(A.lireReponse('Voici :\n```json\n{"intro":"ok","suggestions":[]}\n```').intro, 'ok');
  assert.equal(A.lireReponse('pas du json'), null);
});

console.log('── handler');
store.set('userid:u1', 'i@example.com');
store.set('user:i@example.com', JSON.stringify({ id: 'u1', email: 'i@example.com', plan: 'free' }));
const cookie = `__Host-emploia-token=${await auth.signToken('u1')}`;
const appel = (corps, avecSession = true) => handler(new Request('https://emploia.eu/api/generate/adaptation-guidee', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.40', ...(avecSession ? { cookie } : {}) },
  body: JSON.stringify(corps),
}));
await test('sans session : 401 ; entrées trop courtes : 400', async () => {
  assert.equal((await appel({ cv: CV, offre: OFFRE }, false)).status, 401);
  assert.equal((await appel({ cv: 'court', offre: OFFRE })).status, 400);
});
await test('l\'IA invente HubSpot et un chiffre : seules les suggestions vérifiables arrivent', async () => {
  reponseIA = JSON.stringify({ intro: 'On commence par ton titre.', suggestions: [
    BONNE,
    { section: 'Compétences', avant: 'Canva, Premiere Pro, anglais courant', apres: 'Canva, Premiere Pro, HubSpot, anglais courant', pourquoi: 'x' },
    { section: 'Expérience', avant: '- Reporting mensuel des performances', apres: '- Reporting mensuel : +35 % d\'engagement', pourquoi: 'x' },
  ] });
  const r = await appel({ cv: CV, offre: OFFRE });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.suggestions.length, 1); assert.equal(d.ecartees, 2);
  assert.equal(d.suggestions[0].apres, BONNE.apres);
  assert.ok(d.questions.some((q) => q.nom === 'HubSpot'), 'HubSpot passe en question');
  assert.ok(Number.isFinite(d.score)); assert.ok(d.motifs.length);
  assert.equal(store.get('gen:i@example.com'), '1', 'une génération comptée');
});
await test('réponse illisible ou IA en panne : le crédit gratuit est rendu', async () => {
  reponseIA = 'désolé, pas de JSON';
  assert.equal((await appel({ cv: CV, offre: OFFRE })).status, 502);
  assert.equal(store.get('gen:i@example.com'), '1', 'crédit non rendu (réponse illisible)');
  statutIA = 529;
  assert.equal((await appel({ cv: CV, offre: OFFRE })).status, 502);
  assert.equal(store.get('gen:i@example.com'), '1', 'crédit non rendu (IA en panne)');
  statutIA = 200;
});
await test('au-delà des 5 générations gratuites : 402', async () => {
  store.set('gen:i@example.com', '5');
  reponseIA = JSON.stringify({ intro: 'x', suggestions: [] });
  assert.equal((await appel({ cv: CV, offre: OFFRE })).status, 402);
  assert.equal(store.get('gen:i@example.com'), '5');
});

if (echecs) { console.error(`\n❌ adaptation guidée : ${echecs} échec(s), ${ok} OK`); process.exit(1); }
console.log(`\n✅ adaptation guidée : ${ok} tests OK`);
