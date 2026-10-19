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
import {
  collecterBoard, collecterGreenhouse, normaliserOffre, paysGreenhouse,
  texteDeContenu, segmentsDeLieu, offreExploitable,
} from '../../api/_lib/greenhouse.js';
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

if (failed) { console.error(`\n❌ sonde Greenhouse : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde Greenhouse : ${passed} vérifications OK\n`);
