// Sonde du collecteur Greenhouse.
//
// HORS LIGNE, comme `contrat.test.mjs` dont elle reprend le gabarit : le
// réseau est injecté (`fetchImpl`), donc la sonde teste le collecteur et non
// la disponibilité de Greenhouse. Une sonde qui échoue parce qu'un board a
// été retiré par son employeur n'apprend rien sur le code.
//
// Ce qu'elle verrouille, dans l'ordre d'importance :
//   1. Un board en échec ne fait pas tomber les vingt-sept autres.
//   2. « Unlimited Contract » reste un CDI — le piège de l'inversion.
//   3. Un lieu non reconnu ne devient pas « France ».
//   4. La forme de sortie est celle des huit autres collecteurs.
import fs from 'node:fs';
import vm from 'node:vm';
import {
  collecterBoard, collecterGreenhouse, normaliserOffre, paysGreenhouse,
  texteDeContenu, segmentsDeLieu, offreExploitable,
} from '../../api/_lib/greenhouse.js';
import { TTL_SECONDES, MAX_OFFRES, FOURNISSEURS } from '../../api/_lib/ats.js';
import { BOARDS, RELEVE } from '../../api/_lib/greenhouse-boards.js';
import { CONTRATS, contratGreenhouse, tempsGreenhouse } from '../../api/_lib/contrat.js';

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const reponse = (corps, { ok = true, status = 200 } = {}) => ({
  ok, status, json: async () => corps,
});
const entree = { board: 'acme', company: 'Acme' };
const offreBrute = {
  id: 42,
  title: 'Ingénieur Backend',
  absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/42',
  location: { name: 'Paris, Paris, France' },
  first_published: '2026-10-01T08:00:00-04:00',
  updated_at: '2026-10-15T08:00:00-04:00',
  content: '&lt;p&gt;Rejoignez&amp;nbsp;l&amp;#39;équipe&lt;/p&gt;',
  metadata: [{ name: 'Employment Type', value: 'Unlimited Contract' }],
};

console.log('\n── Forme de sortie ──────────────────────────────────');
const o = normaliserOffre(offreBrute, entree);
for (const champ of ['id', 'title', 'company', 'location', 'type', 'salary', 'description', 'url', 'date', 'remote', 'source', 'logo', 'country']) {
  check(`le champ « ${champ} » existe`, champ in o);
}
check('l’identifiant est préfixé par la source et le board', o.id === 'gh_acme_42', o.id);
check('la source est nommée', o.source === 'Greenhouse');
check('l’URL est celle de l’employeur, pas d’un agrégateur',
  o.url.includes('greenhouse.io/acme'), o.url);
check('la date est la PARUTION, pas la dernière retouche',
  o.date === offreBrute.first_published, o.date);
check('aucun salaire n’est inventé — l’API n’en porte pas', o.salary === null);
check('le contrat sort du vocabulaire fermé ou vaut null',
  o.type === null || CONTRATS.has(o.type), String(o.type));

console.log('\n── Le piège de l’inversion ──────────────────────────');
// Le défaut que ce garde retire : « Unlimited Contract » (durée ILLIMITÉE,
// donc un CDI) contient « contract ». C'est la valeur la plus fréquente du
// champ — 108 des 145 offres qui le portent sur le relevé de huit boards.
check('« Unlimited Contract » est un CDI, pas un CDD',
  contratGreenhouse({ metadata: [{ name: 'Employment Type', value: 'Unlimited Contract' }] }) === 'CDI');
check('« Unbefristeter Vertrag » est un CDI',
  contratGreenhouse({ metadata: [{ name: 'Employment Type', value: 'Unbefristeter Vertrag' }] }) === 'CDI');
check('« Fixed Term Contract » reste un CDD',
  contratGreenhouse({ metadata: [{ name: 'Employment Type', value: 'Fixed Term Contract' }] }) === 'CDD');
check('« Intern » est un Stage',
  contratGreenhouse({ metadata: [{ name: 'Employment Type', value: 'Intern' }] }) === 'Stage');
check('« Working Student » reste inconnu — ni stage ni alternance au sens FR',
  contratGreenhouse({ metadata: [{ name: 'Employment Type', value: 'Working Student' }] }) === null);
check('« Full-time » n’est PAS un contrat',
  contratGreenhouse({ metadata: [{ name: 'Employment Type', value: 'Full-time' }] }) === null);
check('« Full-time » est une durée de travail, et sort dans son propre champ',
  tempsGreenhouse({ metadata: [{ name: 'Employment Type', value: 'Full-time' }] }) === 'Temps plein');
check('sans metadata, le contrat retombe sur le titre',
  contratGreenhouse({ title: 'Stage Marketing — 6 mois' }) === 'Stage');
check('un titre muet ne devient pas un CDI',
  contratGreenhouse({ title: 'Account Executive' }) === null);
check('un champ metadata non rempli est traité comme absent',
  contratGreenhouse({ metadata: [{ name: 'Employment Type', value: null }], title: 'Développeur' }) === null);
check('un multi-select vide est traité comme absent',
  contratGreenhouse({ metadata: [{ name: 'Employment Type', value: [] }], title: 'Développeur' }) === null);

console.log('\n── Localisation : ce qu’on reconnaît, rien de plus ───');
check('Paris est en France', paysGreenhouse({ location: { name: 'Paris, Paris, France' } }) === 'FR');
check('une ville française nue est reconnue', paysGreenhouse({ location: { name: 'Metz' } }) === 'FR');
check('un lieu multiple dont un segment français est français',
  paysGreenhouse({ location: { name: 'Berlin, Berlin, Germany; Paris, Paris, France' } }) === 'FR');
check('Paris (Texas) n’est pas en France',
  paysGreenhouse({ location: { name: 'Paris, Texas, United States' } }) === 'INTL');
check('une ville inconnue ne devient pas la France',
  paysGreenhouse({ location: { name: 'Žilina' } }) === null);
// Le cas qui a corrigé l'ordre : l'employeur déclare « France » sur un poste
// dont le lieu est Berlin. Le champ nomme l'entité qui publie, pas le lieu.
check('un pays déclaré ne l’emporte pas sur un lieu étranger explicite',
  paysGreenhouse({
    location: { name: 'Berlin, Berlin, Germany' },
    metadata: [{ name: 'Job Posting Country', value: 'France' }],
    offices: [{ location: 'Paris, Paris, France' }],
  }) === 'EU');
check('un bureau français ne rend pas française une offre allemande',
  paysGreenhouse({ location: { name: 'München' }, offices: [{ location: 'Paris, Paris, France' }] }) !== 'FR');
check('sans aucun lieu, le pays déclaré décide',
  paysGreenhouse({ location: { name: '' }, metadata: [{ name: 'Job Posting Country', value: 'France' }] }) === 'FR');
check('sans lieu ni déclaration, le pays reste inconnu',
  paysGreenhouse({ location: { name: '' } }) === null);
check('les lieux multiples sont découpés sur le point-virgule',
  segmentsDeLieu('Nantes; Paris, Paris, France').length === 2);

console.log('\n── Description doublement encodée ───────────────────');
check('le HTML doublement encodé est décodé puis dépouillé',
  o.description === "Rejoignez l'équipe", JSON.stringify(o.description));
check('la description est bornée à 300 caractères',
  texteDeContenu('&lt;p&gt;' + 'a'.repeat(500) + '&lt;/p&gt;').length === 300);
check('un contenu absent ne casse rien', texteDeContenu(undefined) === '');

console.log('\n── Un board en échec n’en emporte pas vingt-sept ────');
const journal = [];
const introuvable = await collecterBoard(entree, { journal, fetchImpl: async () => reponse(null, { ok: false, status: 404 }) });
check('un board disparu rend une liste vide', Array.isArray(introuvable) && introuvable.length === 0);
check('et le dit au journal avec un code HTTP', journal.at(-1)?.cause === 'http_404', journal.at(-1)?.cause);

const malforme = await collecterBoard(entree, { journal, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }) });
check('un JSON illisible rend une liste vide', malforme.length === 0);
check('et le dit', journal.at(-1)?.cause === 'reponse_illisible');

const sansJobs = await collecterBoard(entree, { journal, fetchImpl: async () => reponse({ erreur: 'nope' }) });
check('un 200 sans tableau « jobs » est illisible, pas vide', journal.at(-1)?.cause === 'reponse_illisible');

const reseau = await collecterBoard(entree, { journal, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
check('une panne réseau rend une liste vide', reseau.length === 0);
check('et le dit', journal.at(-1)?.cause === 'erreur_reseau');

const coupure = await collecterBoard(entree, { journal, timeout: 5, fetchImpl: async () => { const e = new Error('abort'); e.name = 'AbortError'; throw e; } });
check('un délai dépassé est nommé « timeout »', journal.at(-1)?.cause === 'timeout');

// La garantie qui compte vraiment : la collecte entière survit.
const journalMixte = [];
const catalogue = [
  { board: 'vivant', company: 'Vivant' },
  { board: 'mort', company: 'Mort' },
  { board: 'illisible', company: 'Illisible' },
];
const melange = await collecterGreenhouse(catalogue, {
  journal: journalMixte,
  concurrence: 2,
  fetchImpl: async (url) => {
    if (url.includes('/mort/')) return reponse(null, { ok: false, status: 404 });
    if (url.includes('/illisible/')) throw new Error('ECONNRESET');
    return reponse({ jobs: [offreBrute] });
  },
});
check('deux boards en échec sur trois n’empêchent pas le troisième de rendre',
  melange.length === 1 && melange[0].company === 'Vivant', `${melange.length} offre(s)`);
check('les deux échecs sont journalisés nommément',
  journalMixte.length === 2 && journalMixte.every(e => /^Greenhouse\//.test(e.source)),
  JSON.stringify(journalMixte.map(e => `${e.source}:${e.cause}`)));

console.log('\n── Hygiène ──────────────────────────────────────────');
const avant = JSON.stringify(offreBrute);
normaliserOffre(offreBrute, entree);
check('l’offre amont n’est pas mutée', JSON.stringify(offreBrute) === avant);
check('une offre sans titre est écartée',
  !offreExploitable(normaliserOffre({ id: 1, absolute_url: 'https://x' }, entree)));
check('une offre sans URL est écartée',
  !offreExploitable(normaliserOffre({ id: 1, title: 'T' }, entree)));

console.log('\n── Catalogue ────────────────────────────────────────');
check('le catalogue n’est pas vide', BOARDS.length > 0, `${BOARDS.length} boards`);
check('chaque entrée porte un board et une entreprise',
  BOARDS.every(b => b.board && b.company));
check('aucun board en double',
  new Set(BOARDS.map(b => b.board)).size === BOARDS.length);
check('chaque board porte un relevé chiffré d’offres françaises',
  BOARDS.every(b => Number.isInteger(b.offresFR) && b.offresFR >= 0));
check('la date du relevé est inscrite', /^\d{4}-\d{2}-\d{2}$/.test(RELEVE), RELEVE);
check('les board ids sont des slugs sûrs en URL',
  BOARDS.every(b => /^[a-z0-9-]+$/.test(b.board)));

// ── L'INTÉGRATION ────────────────────────────────────────────────────────────
// Le collecteur ne sert à rien s'il n'est pas branché, et il nuit s'il est mal
// branché. Cette section lit le VRAI `api/jobs.js` et le VRAI cron, et en
// extrait les fonctions pour les exécuter — pas une copie de leur logique, qui
// resterait verte en divergeant du fichier servi.
console.log('\n── Branchement dans api/jobs.js ─────────────────────');
const jobsSrc = fs.readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');
// Le cron de collecte est désormais UNIQUE pour tous les ATS : il parcourt le
// registre de `_lib/ats.js`, qui porte les trois gardes. Les assertions lisent
// donc les DEUX fichiers — celui qui ordonnance et celui qui garde — parce que
// c'est là que les garanties vivent maintenant, et qu'un garde déplacé sans que
// la sonde suive est un garde qu'on croit avoir.
const cronSrc = fs.readFileSync(new URL('../../api/cron/collect-ats.js', import.meta.url), 'utf8');
const atsSrc = fs.readFileSync(new URL('../../api/_lib/ats.js', import.meta.url), 'utf8');
const CLE_KV = FOURNISSEURS.find(f => f.nom === 'Greenhouse')?.cle;
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

function extraire(src, nom) {
  const i = src.indexOf(`async function ${nom}(`) >= 0
    ? src.indexOf(`async function ${nom}(`)
    : src.indexOf(`function ${nom}(`);
  if (i < 0) return null;
  let profondeur = 0;
  const debut = src.indexOf('{', i);
  for (let j = debut; j < src.length; j++) {
    if (src[j] === '{') profondeur++;
    else if (src[j] === '}' && --profondeur === 0) return src.slice(i, j + 1);
  }
  return null;
}

const blocFetch = extraire(jobsSrc, 'fetchGreenhouse');
check('api/jobs.js porte un collecteur Greenhouse', Boolean(blocFetch));

// LA DÉCISION QUI SE VÉRIFIE ICI : Greenhouse est placé AVANT les sources
// tierces, parce que `deduplicate()` garde la PREMIÈRE occurrence. Si l'ordre
// s'inversait un jour, une offre vue des deux côtés sortirait avec l'URL de
// l'agrégateur au lieu de celle de l'employeur — et tout l'intérêt de crawler
// la source serait perdu en silence, sans qu'aucun test ne rougisse.
const ordre = [...jobsSrc.matchAll(/\['([^']+)',\s+\(\) =>/g)].map(m => m[1]);
check('Greenhouse est dans la liste des collecteurs', ordre.includes('Greenhouse'), ordre.join(' → '));
const iGH = ordre.indexOf('Greenhouse');
for (const tiers of ['France Travail', 'French Job Market', 'JSearch', 'Adzuna', 'Remotive', 'Arbeitnow']) {
  const i = ordre.indexOf(tiers);
  check(`Greenhouse passe avant ${tiers} (le dédoublonnage garde la 1re occurrence)`,
    iGH >= 0 && i >= 0 && iGH < i);
}

// Exécution réelle de la fonction extraite, avec un KV simulé.
async function appeler(contenuKV, { q = '', type = '', location = '', page = 0 } = {}) {
  const journal = [];
  const bac = {
    console,
    kvGet: async () => contenuKV,
    muet: (j, source, raison, cause) => { j?.push({ source, raison, cause: cause || 'inconnue' }); return []; },
    FILTRE_VERS_CONTRAT: { stage: 'Stage', alternance: 'Alternance', cdi: 'CDI', cdd: 'CDD', freelance: 'Freelance' },
    resultat: null, journal,
  };
  vm.createContext(bac);
  vm.runInContext(`${blocFetch}; resultat = fetchGreenhouse(${JSON.stringify(q)}, ${JSON.stringify(type)}, ${JSON.stringify(location)}, ${page}, journal);`, bac);
  return { offres: await bac.resultat, journal };
}

const offreKV = (p = {}) => ({
  id: 'gh_acme_1', title: 'Développeur Backend', company: 'Acme', location: 'Paris, Paris, France',
  type: 'CDI', salary: null, description: 'Node.js', url: 'https://job-boards.greenhouse.io/acme/jobs/1',
  date: '2026-10-01T08:00:00Z', remote: false, source: 'Greenhouse', logo: null, country: 'FR', ...p,
});

// Le cas qui décide si une panne de cron est visible ou silencieuse.
const absente = await appeler(null);
check('une clé KV absente n’est PAS une liste vide — la source est déclarée en échec',
  absente.offres.length === 0 && absente.journal.at(-1)?.cause === 'collecte_absente',
  absente.journal.at(-1)?.cause);
const illisible = await appeler({ offres: 'pas un tableau' });
check('une clé illisible est déclarée en échec, pas servie',
  illisible.journal.at(-1)?.cause === 'collecte_absente');

const normal = await appeler({ offres: [offreKV()] });
check('une clé valide rend ses offres', normal.offres.length === 1 && normal.journal.length === 0);

// La règle du contrat, appliquée à ce collecteur comme aux huit autres.
const avecInconnu = { offres: [offreKV(), offreKV({ id: 'gh_acme_2', title: 'Account Executive', type: null })] };
const sousCDI = await appeler(avecInconnu, { type: 'cdi' });
check('sous filtre CDI, seule l’offre au contrat LU est rendue',
  sousCDI.offres.length === 1 && sousCDI.offres[0].type === 'CDI');
const sousCDD = await appeler(avecInconnu, { type: 'cdd' });
check('sous filtre CDD, une offre au contrat inconnu n’est pas servie comme CDD',
  sousCDD.offres.length === 0);
const sansFiltre = await appeler(avecInconnu);
check('hors filtre, l’offre au contrat inconnu est servie telle quelle',
  sansFiltre.offres.length === 2);

// La pagination : sans elle, 334 offres françaises passeraient toutes devant
// les huit autres sources, que `prioritize` classe après la France.
const cent = { offres: Array.from({ length: 100 }, (_, i) => offreKV({ id: `gh_acme_${i}`, title: `Poste ${i}`, date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T08:00:00Z` })) };
const p0 = await appeler(cent);
const p1 = await appeler(cent, { page: 1 });
check('une page rend au plus dix offres', p0.offres.length === 10, `${p0.offres.length}`);
check('deux pages consécutives ne se recouvrent pas',
  !p0.offres.some(a => p1.offres.some(b => b.id === a.id)));
check('les plus récentes d’abord',
  new Date(p0.offres[0].date) >= new Date(p0.offres.at(-1).date));
const filtreQ = await appeler(cent, { q: 'Poste 7' });
check('le terme de recherche filtre vraiment', filtreQ.offres.every(o => /Poste 7/.test(o.title)));

console.log('\n── Le cron d’ingest ─────────────────────────────────');
check('le cron de collecte ATS est déclaré dans vercel.json',
  (vercel.crons || []).some(c => c.path === '/api/cron/collect-ats'),
  (vercel.crons || []).find(c => c.path === '/api/cron/collect-ats')?.schedule);
check('Greenhouse est inscrit au registre des fournisseurs',
  FOURNISSEURS.some(f => f.nom === 'Greenhouse' && f.cle === 'greenhouse_jobs'));
// LE GARDE QUI VIENT D'UN ÉCHEC RÉEL. Le premier réglage était `0 */6 * * *`,
// et il a fait échouer le déploiement de la PR 99 sur les deux projets Vercel,
// avant même le build : le compte est en plan Hobby, où « cron jobs can only
// run once per day » et « cron expressions that would run more frequently will
// fail during deployment ».
//
// Les neuf autres crons du dépôt sont tous quotidiens ou hebdomadaires, donc
// personne n'avait rencontré la contrainte — et rien ne la disait. Une
// fréquence trop élevée ne casse pas un test, elle casse un DÉPLOIEMENT, ce
// qui se découvre après la poussée en ouvrant un lien d'erreur. Ce garde la
// ramène en local.
//
// Il vérifie la forme d'un cron quotidien : minute et heure fixes, jour, mois
// et jour de semaine à `*`. Tout pas (`*/6`), toute liste (`1,13`), tout
// intervalle (`0-12`) et tout `*` dans le champ des heures tournent plus d'une
// fois par jour et sont refusés.
const cronGH = (vercel.crons || []).find(c => c.path === '/api/cron/collect-ats');
const champs = String(cronGH?.schedule ?? '').trim().split(/\s+/);
check('le cron a une expression à cinq champs', champs.length === 5, cronGH?.schedule);
const [minute, heure, jour, mois, semaine] = champs;
check('le plan Hobby n’autorise qu’une exécution par jour : minute et heure fixes',
  /^\d{1,2}$/.test(minute) && /^\d{1,2}$/.test(heure),
  `minute="${minute}" heure="${heure}"`);
check('et les champs jour / mois / jour-de-semaine ne restreignent pas le quotidien',
  jour === '*' && mois === '*' && semaine === '*');
// La règle vaut pour TOUS les crons du dépôt, pas seulement le nôtre : le
// déploiement échoue pour n'importe lequel, et un garde qui ne couvre que le
// dernier ajouté laisserait le prochain retomber dedans.
const tropFrequents = (vercel.crons || []).filter(c => {
  const f = String(c.schedule ?? '').trim().split(/\s+/);
  if (f.length !== 5) return true;
  // Hebdomadaire ou mensuel : moins d'une fois par jour, donc permis.
  const quotidienOuMoins = /^\d{1,2}$/.test(f[0]) && /^\d{1,2}$/.test(f[1]);
  return !quotidienOuMoins;
});
check('aucun cron du dépôt ne tourne plus d’une fois par jour (plan Hobby)',
  tropFrequents.length === 0,
  tropFrequents.length ? tropFrequents.map(c => `${c.path} → ${c.schedule}`).join(', ') : `${(vercel.crons || []).length} crons vérifiés`);

check('la clé survit à plusieurs exécutions manquées du cron quotidien',
  TTL_SECONDES > 24 * 3600, `TTL ${TTL_SECONDES / 3600} h pour un cron quotidien`);
// Le cron de collecte doit précéder celui des alertes, sinon les emails du
// matin lisent le relevé de la veille.
const cronAlertes = (vercel.crons || []).find(c => c.path === '/api/cron/send-alerts');
if (cronAlertes) {
  const hGH = Number(String(cronGH?.schedule).trim().split(/\s+/)[1]);
  const hAl = Number(String(cronAlertes.schedule).trim().split(/\s+/)[1]);
  check('la collecte tourne avant l’envoi des alertes',
    Number.isFinite(hGH) && Number.isFinite(hAl) && hGH < hAl, `collecte ${hGH} h, alertes ${hAl} h`);
}
check('la clé lue par jobs.js est celle qu’écrit le cron',
  CLE_KV === 'greenhouse_jobs' && jobsSrc.includes("kvGet('greenhouse_jobs')"));
check('le cron refuse un appel sans CRON_SECRET',
  /CRON_SECRET/.test(cronSrc) && /\b401\b/.test(cronSrc));
check('la collecte ne stocke que ce dont le pays est établi comme la France',
  /country === 'FR'/.test(atsSrc));
// Le garde qui protège le relevé : si les 28 boards tombent ensemble, écrire
// une liste vide remplacerait un relevé valide par du vide, et la page
// afficherait zéro offre en répondant 200.
// Le garde qui protège le relevé : si tous les boards tombent ensemble, écrire
// une liste vide remplacerait un relevé valide par du vide, et la page
// afficherait zéro offre en répondant 200.
check('une collecte vide n’écrase PAS la clé précédente',
  /if \(!collecte\.ecrire\)/.test(cronSrc) &&
  cronSrc.indexOf('if (!collecte.ecrire)') < cronSrc.indexOf('await kvSet('));
check('et « écrire » est bien conditionné à ce qui a été retenu',
  /ecrire: retenues\.length > 0/.test(atsSrc));
check('la borne de taille est posée et journalisée si atteinte',
  MAX_OFFRES > 0 && /francaises\.length > MAX_OFFRES/.test(atsSrc), `${MAX_OFFRES} offres`);
// LA CONTRAINTE QUI NE CASSE PAS UN TEST MAIS UN DÉPLOIEMENT, deuxième
// édition. Mesuré : Greenhouse 10,1 s + Lever 23,6 s ≈ 34 s. Une fonction en
// runtime Edge « must begin sending a response within 25 seconds » : le cron
// unique y serait tué en pleine collecte Lever, et la clé `lever_jobs` ne
// serait jamais écrite. Ce garde refuse donc le runtime Edge sur CE cron, et
// vérifie que la durée lui est réservée dans vercel.json.
check('le cron de collecte n’est PAS en runtime Edge (≈34 s mesurées > 25 s)',
  !/runtime:\s*'edge'/.test(cronSrc));
const dureeAts = (vercel.functions || {})['api/cron/collect-ats.js']?.maxDuration;
check('une durée est réservée au cron de collecte, au-delà de la borne générale',
  Number(dureeAts) >= 120, `maxDuration ${dureeAts} s`);
check('le jeton collecte_absente est dans le vocabulaire fermé du handler',
  /const CAUSES = new Set\(\[[^\]]*'collecte_absente'/.test(jobsSrc));

if (failed) { console.error(`\n❌ sonde Greenhouse : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde Greenhouse : ${passed} vérifications OK\n`);
