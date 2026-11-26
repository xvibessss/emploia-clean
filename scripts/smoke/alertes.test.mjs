// Sonde hors ligne des alertes emploi (api/cron/send-alerts.js, api/offre.js).
//
// Importe les VRAIS modules. La base Upstash et Resend sont remplacés par un
// faux `fetch` en mémoire ; le moteur de /jobs est réellement appelé et sert
// les offres depuis son cache, préchargé ici (toute autre source répond 503).

process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'test';
process.env.CRON_SECRET = 'cron-test';
process.env.RESEND_API_KEY = 're_test';
process.env.NEXT_PUBLIC_URL = 'https://emploia.eu';
process.env.JWT_SECRET = 'jwt-test-secret-de-32-caracteres-au-moins';

const store = new Map();
const emails = [];
let resendStatut = 200;

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u === 'https://kv.test') {
    const [cmd, cle, ...args] = JSON.parse(init.body);
    const rep = (result) => new Response(JSON.stringify({ result }));
    switch (cmd) {
      case 'GET': return rep(store.has(cle) ? store.get(cle) : null);
      case 'SET': {
        if (args.includes('NX') && store.has(cle)) return rep(null);
        store.set(cle, args[0]); return rep('OK');
      }
      case 'SMEMBERS': return rep(store.has(cle) ? JSON.parse(store.get(cle)) : []);
      case 'INCR': { const n = Number(store.get(cle) || 0) + 1; store.set(cle, String(n)); return rep(n); }
      default: return rep(null);
    }
  }
  if (u === 'https://api.resend.com/emails') {
    emails.push(JSON.parse(init.body));
    return new Response('{}', { status: resendStatut });
  }
  return new Response('indisponible', { status: 503 });
};

const { default: cron } = await import('../../api/cron/send-alerts.js');
const { default: offre } = await import('../../api/offre.js');

let fail = 0;
const check = (nom, ok, detail = '') => { console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) fail++; };
const kvSet = (k, v) => store.set(k, JSON.stringify(v));
const kvGet = (k) => (store.has(k) ? JSON.parse(store.get(k)) : null);
const lancer = (auth = 'Bearer cron-test') => cron(new Request('https://emploia.eu/api/cron/send-alerts', { headers: { authorization: auth } }));

const EMAIL = 'camille@exemple.fr';
const offres = Array.from({ length: 7 }, (_, i) => ({
  id: `az_${1000 + i}`, title: `Comptable confirmé ${i}`, company: `Cabinet ${i}`, location: 'Lyon', type: 'CDI',
  description: `Tenue de la comptabilité générale, déclarations TVA, clôtures mensuelles. Offre ${i}.`,
  url: `https://www.adzuna.fr/details/${1000 + i}`, date: '2026-11-26T08:00:00Z', remote: false, source: 'Adzuna',
}));
function semer({ filtre = 'actif', jobs = offres } = {}) {
  kvSet('alert_subscribers', [EMAIL]);
  kvSet(`user:${EMAIL}`, { name: 'Camille Martin', email: EMAIL });
  kvSet(`alerts:${EMAIL}`, [{ id: 'al1', keywords: 'comptable', location: 'Lyon', type: 'CDI', frequency: 'daily', active: true }]);
  // Clé de cache de /api/jobs : `jobs:${q}|${type}|${location}|${page}`.
  kvSet('jobs:comptable|cdi|Lyon|0', { jobs, sources: ['Adzuna'], sourcesEnEchec: [], filtre });
}

console.log('\n  Accès');
check('le cron refuse un appel sans CRON_SECRET', (await lancer('Bearer faux')).status === 401);

console.log('\n  Premier envoi');
semer();
let r = await (await lancer()).json();
check('un email part', r.sent === 1 && emails.length === 1, JSON.stringify(r));
const html = emails[0]?.html || '';
const boutons = html.match(/offre_id=az_\d+/g) || [];
check('5 offres au plus par alerte, chacune avec son bouton « Générer mon CV »', boutons.length === 5 && (html.match(/Générer mon CV pour cette offre/g) || []).length === 5, `${boutons.length} boutons`);
check('le lien du bouton ouvre /app avec auto=1', /https:\/\/emploia\.eu\/app\?source=alerte&amp;offre_id=az_1000&amp;auto=1/.test(html));
check('les offres viennent du moteur de /jobs (Adzuna, Lyon), pas d’Arbeitnow', html.includes('Comptable confirmé 0') && html.includes('Lyon'));
check('l’objet annonce le nombre d’offres', /^🔔 5 nouvelle\(s\) offre\(s\) : comptable/.test(emails[0]?.subject || ''), emails[0]?.subject);
const fiche = kvGet('offre:az_1000');
check('la fiche de chaque offre envoyée est stockée', fiche && fiche.texte.startsWith('Comptable confirmé 0 — Cabinet 0 (Lyon)'), JSON.stringify(fiche));
check('les 5 offres sont marquées « vues » pour cette alerte', (kvGet(`alertSeen:${EMAIL}:al1`) || []).length === 5);

console.log('\n  Envois suivants');
r = await (await lancer()).json();
check('le même jour, rien ne repart', r.sent === 0 && emails.length === 1, JSON.stringify(r));
store.delete(`alertSent:${EMAIL}:al1`);
r = await (await lancer()).json();
const html2 = emails[1]?.html || '';
check('le lendemain, seules les 2 offres jamais envoyées partent', r.sent === 1 && (html2.match(/offre_id=/g) || []).length === 2 && html2.includes('az_1005') && !html2.includes('az_1000'), JSON.stringify(r));
store.delete(`alertSent:${EMAIL}:al1`);
r = await (await lancer()).json();
check('sans offre nouvelle, aucun email', r.sent === 0 && emails.length === 2, JSON.stringify(r));

console.log('\n  Garde-fous');
store.clear(); emails.length = 0;
semer({ filtre: 'abandonne' });
r = await (await lancer()).json();
check('« tous métiers confondus » (pertinence abandonnée) ne part pas', r.sent === 0 && emails.length === 0, JSON.stringify(r));
store.clear(); emails.length = 0; resendStatut = 403;
semer();
r = await (await lancer()).json();
check('Resend refuse → rien n’est marqué envoyé ni vu', r.sent === 0 && !store.has(`alertSent:${EMAIL}:al1`) && !store.has(`alertSeen:${EMAIL}:al1`), JSON.stringify(r));
resendStatut = 200;
r = await (await lancer()).json();
check('… et l’envoi suivant les livre', r.sent === 1, JSON.stringify(r));
store.clear(); emails.length = 0;
kvSet(`optout:${EMAIL}`, true); semer();
r = await (await lancer()).json();
check('un abonné désinscrit ne reçoit rien', r.sent === 0 && emails.length === 0);

console.log('\n  /api/offre');
store.clear(); kvSet('offre:az_42', { texte: 'Comptable — Cabinet (Lyon)\n\nDescription', url: 'https://x.test' });
const lire = (id) => offre(new Request(`https://emploia.eu/api/offre?id=${encodeURIComponent(id)}`, { headers: { 'x-forwarded-for': '10.0.0.1' } }));
let res = await lire('az_42');
check('une fiche stockée se lit', res.status === 200 && (await res.json()).texte.startsWith('Comptable'));
check('une fiche absente ou expirée répond 404', (await lire('az_43')).status === 404);
check('un identifiant invalide est refusé avant toute lecture', (await lire('../user:x')).status === 400 && (await lire('a b')).status === 400);

console.log(fail ? `\n❌ alertes : ${fail} échec(s)` : '\n✅ alertes : toutes les vérifications OK');
process.exit(fail ? 1 : 0);
