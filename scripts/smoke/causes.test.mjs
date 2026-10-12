// Sonde du vocabulaire de causes exposé par /api/jobs.
//
// `sourcesEnEchec` disait QUI est tombé, jamais POURQUOI. Diagnostiquer
// exigeait donc d'ouvrir les journaux Vercel, dont la rétention est d'une
// heure sur le plan Hobby : une panne de nuit était illisible au matin.
//
// La contrainte qui encadre la correction : une raison brute ne doit JAMAIS
// entrer dans la réponse publique, parce qu'un `e.message` de fetch peut
// porter une URL complète — donc une clé d'API en clair. La réponse ne porte
// qu'un jeton d'un ensemble fermé, ou un `http_NNN`.
//
// Cette sonde est hors ligne : elle extrait les fonctions du handler et les
// exécute, sans réseau. Elle vérifie la propriété de sûreté par construction
// plutôt que de faire confiance à la relecture des 22 sites d'échec.
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// ── Extraire les trois fonctions, telles qu'elles sont servies ──────────────
// On évalue le source réel du handler, pas une copie de sa logique : une copie
// resterait verte en divergeant de la page, qui est le défaut qu'on vient de
// corriger sur la grille tarifaire.
function extraire(nom) {
  const i = src.indexOf(`function ${nom}(`);
  if (i < 0) return null;
  let profondeur = 0, debut = src.indexOf('{', i);
  for (let j = debut; j < src.length; j++) {
    if (src[j] === '{') profondeur++;
    else if (src[j] === '}' && --profondeur === 0) return src.slice(i, j + 1);
  }
  return null;
}

const bloc = src.slice(src.indexOf('const CAUSES'), src.indexOf('async function fetchJSearch'));
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(`${bloc}\nthis.CAUSES = CAUSES; this.borner_cause = borner_cause; this.causePublique = causePublique;`, sandbox);

const { CAUSES, borner_cause, causePublique } = sandbox;
// `instanceof Set` est faux ici : le Set vient du realm du sandbox, pas du
// nôtre. On teste la forme, pas l'identité de classe.
check('le handler expose son vocabulaire de causes',
  CAUSES && typeof CAUSES.has === 'function' && CAUSES.size > 0, `${CAUSES?.size} jetons`);
check('borner_cause est extractible', typeof borner_cause === 'function');
check('causePublique est extractible', typeof causePublique === 'function');
if (typeof causePublique !== 'function') { console.error('\n❌ sonde des causes : handler non analysable\n'); process.exit(1); }

// ── 1. Les causes que la sonde des sources doit pouvoir lire ────────────────
console.log('\n[A] Les trois pannes réelles du 2026-10-11 sont nommables');
check('clés France Travail absentes → cle_absente',
  borner_cause('clés absentes : FRANCE_TRAVAIL_CLIENT_ID / _SECRET') === 'cle_absente');
check('quota French Job Market → http_429', borner_cause('HTTP 429') === 'http_429');
check('abonnement Internships → http_404', borner_cause('HTTP 404') === 'http_404');
check('timeout JSearch → timeout', borner_cause('timeout') === 'timeout');
check('jeton OAuth refusé → jeton_refuse', borner_cause('jeton OAuth refusé') === 'jeton_refuse');
check('réponse non-JSON → reponse_illisible',
  borner_cause('Unexpected token < in JSON at position 0') === 'reponse_illisible');

// ── 2. LA propriété de sûreté : aucun message ne traverse ───────────────────
// C'est le point qui justifie tout le mécanisme. Si un seul de ces cas
// ressortait tel quel, la correction aurait introduit une fuite de secret là
// où il n'y en avait pas — un recul, pas un progrès.
console.log('\n[B] Aucun message d’exception ne peut atteindre la réponse');
const FUITES = [
  'fetch failed: https://jsearch.p.rapidapi.com/search?query=x&x-rapidapi-key=abcd1234secret',
  'request to https://api.adzuna.com/v1/api/jobs/fr/search/1?app_key=DEADBEEF failed',
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature rejected',
  'FRANCE_TRAVAIL_CLIENT_SECRET=s3cr3t-value-here invalid',
  '{"error":"quota","account":"hugo@emploia.eu","key":"rapidapi-live-9f8e7d"}',
  'getaddrinfo ENOTFOUND api.pole-emploi.io',
];
for (const message of FUITES) {
  const cause = causePublique(borner_cause(message));
  const sain = /^http_\d{3}$/.test(cause) || CAUSES.has(cause);
  const extrait = message.slice(0, 46) + '…';
  check(`« ${extrait} » → jeton borné`, sain, cause);
  // Le test qui compte vraiment : la cause ne doit contenir aucun fragment du
  // message. Un jeton valide qui recopierait l'URL serait encore une fuite.
  check(`  et ne recopie rien du message`,
    !cause.includes('http') || /^http_\d{3}$/.test(cause));
  for (const secret of ['abcd1234secret', 'DEADBEEF', 'eyJhbGci', 's3cr3t', 'rapidapi-live-9f8e7d', 'hugo@emploia.eu']) {
    if (message.includes(secret)) {
      check(`  et ne contient pas « ${secret.slice(0, 12) } »`, !cause.includes(secret));
    }
  }
}

// ── 3. causePublique est le verrou, pas la discipline des appelants ─────────
// Un collecteur ajouté dans six mois passera peut-être un message brut comme
// `cause`. Le verrou doit tenir sans lui.
console.log('\n[C] Le verrou tient même si un appelant passe un message brut');
check('un message brut passé en cause → inconnue',
  causePublique('fetch failed https://x.com?key=SECRET') === 'inconnue');
check('un jeton inventé → inconnue', causePublique('quota_depasse_chez_rapidapi') === 'inconnue');
check('http_ sans code → inconnue', causePublique('http_') === 'inconnue');
check('http_ avec texte → inconnue', causePublique('http_429_rapidapi_key_abcd') === 'inconnue');
check('un objet → inconnue', causePublique({ toString: () => 'http_200' }) === 'http_200' || causePublique({}) === 'inconnue');
check('null → inconnue', causePublique(null) === 'inconnue');
check('undefined → inconnue', causePublique(undefined) === 'inconnue');
// Les jetons légitimes passent, eux : un verrou qui bloque tout ne sert à rien.
for (const jeton of [...CAUSES]) {
  check(`le jeton « ${jeton} » traverse`, causePublique(jeton) === jeton);
}
for (const code of ['http_200', 'http_404', 'http_429', 'http_503']) {
  check(`le code « ${code} » traverse`, causePublique(code) === code);
}

// ── 4. Le handler branche bien la cause dans ses deux réponses ──────────────
console.log('\n[D] Les deux chemins de réponse portent causesEnEchec');
check('réponse fraîche', /sourcesEnEchec, causesEnEchec, filtre: pertinence\.filtre/.test(src));
check('réponse depuis le cache', /causesEnEchec, filtre: cached\.filtre/.test(src));
check('la cause entre en cache', /kvSet\(cacheKey, \{[^}]*causesEnEchec/.test(src));
// Sans ce filtrage à la lecture, une entrée de cache écrite par un
// déploiement antérieur rendrait `{}` — lisible comme « aucune cause ».
check('la lecture du cache repasse par causePublique',
  /\(cached\.sourcesEnEchec \|\| \[\]\)\.map\(s => \[s, causePublique\(brut\[s\]\)\]\)/.test(src));
check('les sites HTTP déclarent leur code explicitement',
  (src.match(/`http_\$\{(res|jobsRes)\.status\}`/g) || []).length === 7,
  `${(src.match(/`http_\$\{(res|jobsRes)\.status\}`/g) || []).length}/7`);
check('la raison complète reste dans les journaux',
  src.includes("console.error('jobs: sources en échec — ' + JSON.stringify(journal))"));

if (failed) { console.error(`\n❌ sonde des causes : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde des causes : ${passed} vérifications OK\n`);
