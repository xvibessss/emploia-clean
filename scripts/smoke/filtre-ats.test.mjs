// Sonde du simulateur de filtre ATS : lexique (api/_lib/competences.js),
// calcul (api/_lib/filtre-ats.js), collecteurs, et handler api/filtre-ats.js
// branché sur le VRAI moteur de /jobs derrière un faux Upstash. Hors ligne.
import assert from 'node:assert/strict';

process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 't';
const store = new Map();
let appelsJobs = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url?.url || url);
  if (u.startsWith('https://kv.test')) {
    const corps = JSON.parse(init.body || '[]');
    const un = ([op, key, ...a]) => {
      const O = String(op).toUpperCase();
      if (O === 'GET') return store.get(key) ?? null;
      if (O === 'SET') { store.set(key, String(a[0])); return 'OK'; }
      if (O === 'INCR') { const v = Number(store.get(key) || 0) + 1; store.set(key, String(v)); return v; }
      if (O === 'MGET') return [key, ...a].map((k) => store.get(k) ?? null);
      return 1;
    };
    if (u.includes('/pipeline')) return Response.json(corps.map((c) => ({ result: un(c) })));
    return Response.json({ result: un(corps) });
  }
  appelsJobs++;
  return new Response('{}', { status: 503 }); // toute source externe : en panne
};

const C = await import('../../api/_lib/competences.js');
const F = await import('../../api/_lib/filtre-ats.js');

let echecs = 0, ok = 0;
async function test(nom, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nom); }
  catch (e) { echecs++; console.log('  ✗ ' + nom + '\n     ' + (e.message || e)); }
}
const tri = (a) => [...a].sort();

console.log('── lexique');
await test('repère les compétences, accents et casse compris', () => {
  assert.deepEqual(tri(C.competencesDe('Maîtrise de GOOGLE ANALYTICS (GA4), SEO/SEA, HubSpot, Excel. Anglais courant. Gestion du budget.')),
    tri(['google-analytics', 'seo', 'sea', 'hubspot', 'excel', 'anglais', 'gestion-budget']));
  assert.deepEqual(tri(C.competencesDe('Stack React, TypeScript, Node.js, PostgreSQL, Docker, AWS, C#, .NET, C++')),
    tri(['react', 'typescript', 'node', 'postgresql', 'docker', 'aws', 'csharp', 'dotnet', 'cpp']));
  assert.deepEqual(C.competencesDe('Node.js et Vue.js'), ['vue', 'node'], 'le suffixe .js n\'est pas JavaScript');
  assert.ok(C.competencesDe('JS moderne, ES2022').includes('javascript'));
});
await test('faux positifs connus : rien à repérer', () => {
  for (const t of [
    'Notre processus de recrutement en 3 étapes ; votre recruteur vous rappelle.',
    'Avantages : transports en commun, formation continue, produits de qualité, pouvoir d\'achat.',
    'Una vez recibida, en caso de que su candidatura no sea seleccionada.',
    'Rejoins une scale-up en hyper growth, dans une équipe lean.',
    'Contribuer à l\'amélioration continue du produit. Bilan carbone neutre.',
    'Leader de l\'enseignement supérieur privé, nous recrutons.',
    'Java n\'est pas JavaScript ? Ici on code en JavaScript.',
  ]) {
    const r = C.competencesDe(t);
    if (t.startsWith('Java n')) assert.deepEqual(tri(r), ['java', 'javascript'], t);
    else assert.deepEqual(r, [], `${t} → ${r}`);
  }
});
await test('le nom de l\'employeur n\'est pas une compétence', () => {
  assert.ok(C.competencesDe('Rejoins Pennylane. Pennylane recrute un comptable.').includes('pennylane'));
  assert.ok(!C.competencesDe('Rejoins Pennylane. Pennylane recrute un comptable.', 12, 'Pennylane').includes('pennylane'));
  assert.ok(C.competencesDe('Tu maîtrises Pennylane et Cegid.', 12, 'Fiducial').includes('pennylane'));
});
await test('identifiants uniques, chaque motif compile', () => {
  const ids = C.COMPETENCES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(C.nomDe('google-analytics'), 'Google Analytics');
});

console.log('── collecteurs : compétences lues dans la description COMPLÈTE');
await test('Ashby : la description stockée est tronquée, les compétences viennent du texte entier', async () => {
  const { normaliserOffre } = await import('../../api/_lib/ashby.js');
  const long = 'Présentation de la société. '.repeat(20) + 'Profil : maîtrise de HubSpot, Google Analytics et SQL. Anglais courant.';
  const o = normaliserOffre({ id: 1, title: 'Growth Marketing Manager', descriptionPlain: long, address: {} }, { board: 'x', company: 'Acme' });
  assert.ok(o.description.length <= 300 && !/hubspot/i.test(o.description), 'description tronquée');
  for (const k of ['hubspot', 'google-analytics', 'sql', 'anglais', 'growth']) assert.ok(o.competences.includes(k), k + ' ' + o.competences);
});
await test('Lever : les exigences dans `lists` sont lues', async () => {
  const { normaliserOffre } = await import('../../api/_lib/lever.js');
  const o = normaliserOffre({ id: 'a', text: 'Comptable', descriptionPlain: 'Rejoins-nous.', lists: [{ text: 'Profil', content: '<li>Cegid</li><li>Liasses fiscales</li>' }], categories: {} }, { board: 'x', company: 'Acme' });
  assert.ok(o.competences.includes('cegid') && o.competences.includes('liasse-fiscale'), o.competences);
});

console.log('── calcul');
const OFFRES = [
  { t: 'A', c: 'x', k: ['seo', 'google-analytics', 'anglais'] },
  { t: 'B', c: 'x', k: ['seo', 'google-analytics'] },
  { t: 'C', c: 'x', k: ['seo', 'hubspot', 'anglais', 'canva'] },
  { t: 'D', c: 'x', k: ['canva'] },
];
await test('exigées = les plus demandées du marché, au plus 3', () => {
  const f = F.frequences(OFFRES);
  assert.equal(f.get('seo'), 3);
  // À égalité de demande, l'ordre de l'offre départage.
  assert.deepEqual(F.exigeesDe(['canva', 'seo', 'hubspot', 'anglais'], f), ['seo', 'canva', 'anglais']);
  assert.equal(F.exigeesDe(['hubspot', 'canva', 'seo', 'anglais', 'google-analytics'], f).length, 3);
});
await test('analyser : en lice, filtrées, et compétences qui font revenir des offres', () => {
  const r = F.analyser(OFFRES, ['seo', 'anglais']);
  assert.equal(r.nbOffres, 4);
  assert.deepEqual(r.offres.map((o) => o.p), [false, false, false, false]);
  const ga = r.manquantes.find((m) => m.id === 'google-analytics');
  assert.equal(ga.r, 2, 'GA ferait revenir A et B');
  assert.equal(r.manquantes[0].id, 'google-analytics', 'trié par offres récupérées');
  const r2 = F.analyser(OFFRES, ['seo', 'anglais', 'google-analytics', 'canva']);
  assert.equal(r2.enLice, 4);
  assert.equal(r2.fortes[0].id, 'seo');
  assert.deepEqual(tri(r2.fortes.map((x) => x.id)), tri(['seo', 'google-analytics', 'anglais', 'canva']));
});
await test('les chiffres se recomptent à partir de la liste renvoyée', () => {
  const r = F.analyser(OFFRES, ['canva']);
  assert.equal(r.enLice, r.offres.filter((o) => o.p).length);
  assert.equal(r.filtrees, r.nbOffres - r.enLice);
});

console.log('── handler, sur le vrai moteur de /jobs');
const maintenant = new Date().toISOString();
const offresAshby = Array.from({ length: 24 }, (_, i) => ({
  id: `ab_t_${i}`, title: `Chef de projet marketing ${i}`, company: `Entreprise ${i % 6}`, location: 'Paris', type: 'CDI',
  description: 'Courte description.', url: `https://jobs.ashbyhq.com/x/${i}`, date: maintenant, source: 'Ashby', country: 'FR',
  competences: i % 3 ? ['seo', 'google-analytics', 'anglais'] : ['hubspot', 'crm', 'anglais'],
}));
store.set('ashby_jobs', JSON.stringify({ collecteLe: maintenant, offres: offresAshby }));
const handler = (await import('../../api/filtre-ats.js')).default;
const appel = (corps, ip = '203.0.113.30') => handler(new Request('https://emploia.eu/api/filtre-ats', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(corps),
}));
const CV = 'Camille, chargée de marketing. 3 ans : SEO, Google Analytics, campagnes. Anglais courant. Canva, réseaux sociaux.';
await test('valide les entrées', async () => {
  assert.equal((await appel({ metier: '', cv: CV })).status, 400);
  assert.equal((await appel({ metier: 'Marketing', cv: 'court' })).status, 400);
  assert.equal((await appel({ metier: 'Marketing', cv: 'x'.repeat(30000) })).status, 413);
});
let premier;
await test('vraies offres du réservoir Ashby, compétences stockées utilisées', async () => {
  const r = await appel({ metier: 'chef de projet marketing', cv: CV });
  assert.equal(r.status, 200, await r.clone().text());
  premier = await r.json();
  assert.equal(premier.nbOffres, 24);
  assert.equal(premier.enLice, 16, 'les 16 offres SEO/GA/anglais passent');
  assert.ok(premier.manquantes.some((m) => m.id === 'hubspot'));
  assert.equal(premier.noms.hubspot, 'HubSpot');
  assert.ok(!JSON.stringify(premier).includes('chargée de marketing'), 'le CV ne repart pas dans la réponse');
});
await test('offres mises en cache : un second appel ne relance pas le moteur', async () => {
  const avant = appelsJobs;
  const r = await (await appel({ metier: 'chef de projet marketing', cv: CV + ' HubSpot, CRM.' })).json();
  assert.equal(appelsJobs, avant, 'sources rappelées');
  assert.equal(r.enLice, 24);
});
await test('trop peu d\'offres : réponse « insuffisant » sans fausse grille', async () => {
  const r = await (await appel({ metier: 'astronaute lunaire', cv: CV })).json();
  assert.equal(r.insuffisant, true); assert.ok(!r.offres);
});

if (echecs) { console.error(`\n❌ filtre ATS : ${echecs} échec(s), ${ok} OK`); process.exit(1); }
console.log(`\n✅ filtre ATS : ${ok} tests OK`);
