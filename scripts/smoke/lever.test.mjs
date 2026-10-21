// Sonde du collecteur Lever.
//
// HORS LIGNE, comme `greenhouse.test.mjs` dont elle reprend le gabarit : le
// réseau est injecté (`fetchImpl`), donc la sonde teste le collecteur et non la
// disponibilité de Lever. Une sonde qui échoue parce qu'un board a été retiré
// par son employeur n'apprend rien sur le code.
//
// Ce qu'elle verrouille, dans l'ordre d'importance :
//   1. Un board en échec ne fait pas tomber les seize autres.
//   2. « contrat à durée INdéterminée » reste un CDI — le piège de
//      l'inversion, troisième édition après unbefristet et unlimited.
//   3. Un bureau français listé en second ne rend pas française une offre
//      allemande.
//   4. Ce que la source ne porte pas sort `null` : salaire, contrat illisible,
//      lieu non reconnu.
//   5. La forme de sortie est celle des autres collecteurs.
import fs from 'node:fs';
import vm from 'node:vm';
import {
  collecterBoard, collecterLever, normaliserOffre, paysLever, segmentsDeLieu,
  texteDeContenu, dateDeParution, estDistanciel, offreExploitable,
} from '../../api/_lib/lever.js';
import { FOURNISSEURS, TTL_SECONDES, MAX_OFFRES, collecterFournisseur } from '../../api/_lib/ats.js';
import { BOARDS, RELEVE } from '../../api/_lib/lever-boards.js';
import { CONTRATS, contratLever, tempsLever, contratDepuisTexte } from '../../api/_lib/contrat.js';

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
  id: 'f00-ba4',
  text: 'Ingénieur Backend',
  hostedUrl: 'https://jobs.lever.co/acme/f00-ba4',
  applyUrl: 'https://jobs.lever.co/acme/f00-ba4/apply',
  categories: { commitment: 'CDI', location: 'Paris', allLocations: ['Paris'] },
  country: 'FR',
  workplaceType: 'hybrid',
  createdAt: 1791900863876,
  descriptionPlain: "Rejoignez l'équipe",
  description: '<p>Rejoignez l&#39;équipe</p>',
};

console.log('\n── Forme de sortie ──────────────────────────────────');
const o = normaliserOffre(offreBrute, entree);
for (const champ of ['id', 'title', 'company', 'location', 'type', 'salary', 'description', 'url', 'date', 'remote', 'source', 'logo', 'country']) {
  check(`le champ « ${champ} » existe`, champ in o);
}
check('l’identifiant est préfixé par la source et le board', o.id === 'lv_acme_f00-ba4', o.id);
check('la source est nommée', o.source === 'Lever');
check('le titre est lu dans « text », pas dans « title »', o.title === 'Ingénieur Backend', o.title);
check('l’URL est la page de candidature chez l’ATS de l’employeur',
  o.url === offreBrute.hostedUrl, o.url);
check('aucun salaire n’est inventé — l’API n’en porte aucun champ', o.salary === null);
check('le contrat sort du vocabulaire fermé ou vaut null',
  o.type === null || CONTRATS.has(o.type), String(o.type));

console.log('\n── La date : epoch ms → ISO ─────────────────────────');
// `createdAt` est un ENTIER en millisecondes, là où les autres collecteurs
// rendent une chaîne. Laisser passer l'entier marcherait par accident et
// casserait au premier aller-retour par le KV.
check('la date est convertie en chaîne ISO', typeof o.date === 'string', typeof o.date);
check('et elle vaut bien la parution', o.date === new Date(1791900863876).toISOString(), o.date);
check('une date absente vaut null', dateDeParution({}) === null);
check('une date illisible vaut null, pas 1970', dateDeParution({ createdAt: 'hier' }) === null);
check('une date à zéro vaut null', dateDeParution({ createdAt: 0 }) === null);

console.log('\n── Le piège de l’inversion, en français ─────────────');
// Le défaut que ce garde retire : « contrat à durée INdéterminée » (un CDI)
// CONTIENT « déterminée » (un CDD). Troisième édition du même piège, après
// `unbefristet`/`befristet` et `unlimited`/`contract`.
check('« contrat à durée indéterminée » est un CDI',
  contratDepuisTexte('contrat a duree indeterminee') === 'CDI');
check('« contrat à durée déterminée » reste un CDD',
  contratDepuisTexte('contrat a duree determinee') === 'CDD');
check('« CDI » est un CDI', contratLever({ categories: { commitment: 'CDI' } }) === 'CDI');
check('« CDD » est un CDD', contratLever({ categories: { commitment: 'CDD' } }) === 'CDD');
check('« CDI / Permanent position » est un CDI',
  contratLever({ categories: { commitment: 'CDI / Permanent position' } }) === 'CDI');
check('« Permanent contract » est un CDI, pas un CDD',
  contratLever({ categories: { commitment: 'Permanent contract' } }) === 'CDI');
check('« Fixed term » est un CDD même sans le mot « contract »',
  contratLever({ categories: { commitment: 'Fixed term' } }) === 'CDD');
check('« Fixed-term contract » est un CDD',
  contratLever({ categories: { commitment: 'Fixed-term contract' } }) === 'CDD');
check('« Freelancer » est un Freelance — la borne de mot refusait le suffixe',
  contratLever({ categories: { commitment: 'Freelancer' } }) === 'Freelance');
check('« Contractor » est un CDD, comme le dépôt l’a tranché pour JSearch',
  contratLever({ categories: { commitment: 'Contractor' } }) === 'CDD');
check('« Apprenticeship » est une Alternance',
  contratLever({ categories: { commitment: 'Apprenticeship' } }) === 'Alternance');
check('« Internship » est un Stage',
  contratLever({ categories: { commitment: 'Internship' } }) === 'Stage');

console.log('\n── Ce qui reste null À DESSEIN ──────────────────────');
// Relevé sur les 31 boards vivants : 38 valeurs distinctes de `commitment`.
// Celles-ci ne sont AUCUN de nos cinq contrats, et les rapprocher serait
// commode et faux.
check('« Remote » n’est PAS un contrat — c’est la faute du collecteur Remotive',
  contratLever({ categories: { commitment: 'Remote' } }) === null);
check('« Full Time » n’est pas un contrat',
  contratLever({ categories: { commitment: 'Full Time' } }) === null);
check('« Full Time » est une durée de travail, et sort dans son propre champ',
  tempsLever({ categories: { commitment: 'Full Time' } }) === 'Temps plein');
check('« Part-Time » sort en temps partiel, sans toucher le contrat',
  tempsLever({ categories: { commitment: 'Part-Time' } }) === 'Temps partiel' &&
  contratLever({ categories: { commitment: 'Part-Time' } }) === null);
check('« Working Student » reste inconnu — ni stage ni alternance au sens FR',
  contratLever({ categories: { commitment: 'Working Student' } }) === null);
check('« Interim » reste inconnu — France Travail a déjà tranché MIS → null',
  contratLever({ categories: { commitment: 'Interim' } }) === null);
check('« Short term » reste inconnu — une durée vague n’est pas un contrat',
  contratLever({ categories: { commitment: 'Short term' } }) === null);
check('« CLT » (régime brésilien) reste inconnu',
  contratLever({ categories: { commitment: 'CLT' } }) === null);
check('« FR Executive/Cadre » est un statut, pas un contrat',
  contratLever({ categories: { commitment: 'FR Executive/Cadre' } }) === null);
check('sans commitment, le contrat retombe sur le titre',
  contratLever({ text: 'Stage Marketing — 6 mois' }) === 'Stage');
check('un titre muet ne devient pas un CDI',
  contratLever({ text: 'Account Executive' }) === null);

console.log('\n── Localisation : ce qu’on reconnaît, rien de plus ───');
check('Paris est en France', paysLever({ categories: { location: 'Paris' } }) === 'FR');
check('un lieu nommant la France est en France',
  paysLever({ categories: { location: 'Lieu-dit, France' } }) === 'FR');
// LE CHAMP QUI RATTRAPE CE QUE LA LISTE DE VILLES IGNORE. Mesuré : 63 offres
// portent `country: "FR"` sur une commune absente de la liste — Mitry-Mory,
// Le Thillay, Saint Vulbas, Blanc-Mesnil. Ce sont de vraies offres françaises,
// et le code ISO est le seul champ qui le dise.
check('une commune française hors liste est rattrapée par le code pays',
  paysLever({ categories: { location: 'Mitry-Mory' }, country: 'FR' }) === 'FR');
check('un code pays de l’Union donne EU',
  paysLever({ categories: { location: 'Belgrade' }, country: 'DE' }) === 'EU');
check('un code pays hors Union donne INTL',
  paysLever({ categories: { location: 'Austin' }, country: 'US' }) === 'INTL');
// LE PIÈGE MESURÉ, identique à `offices` chez Greenhouse : 6 offres NON
// françaises listent la France dans `allLocations`. S'en servir pour établir
// « France » rendrait française toute offre ouverte à plusieurs bureaux dont
// l'un est à Paris.
check('un bureau français listé en second ne rend pas française une offre allemande',
  paysLever({
    categories: { location: 'Berlin', allLocations: ['Berlin', 'Barcelona', 'Paris', 'Madrid'] },
    country: 'DE',
  }) === 'EU');
check('un lieu étranger EXPLICITE l’emporte sur un code pays contraire',
  paysLever({ categories: { location: 'Berlin, Germany' }, country: 'FR' }) === 'EU');
// LE DÉCOUPAGE MULTI-VILLES, et il a failli être du code mort.
// `normaliserValeur` remplace les virgules par des espaces : découper APRÈS
// elle ne découpe rien, et le test par ville ne voit qu'une chaîne de quatre
// villes collées. Le découpage se fait donc sur le texte BRUT.
check('les lieux multiples sont découpés sur la virgule',
  segmentsDeLieu('London, Paris, Toronto').length === 3);
check('une offre multi-villes dont un segment est français est française',
  paysLever({ categories: { location: 'London, Paris, Toronto, New York' } }) === 'FR');
// L'HOMONYME, et c'est pourquoi le code ISO passe AVANT la liste de villes :
// « Nice, California » ne nomme aucun pays, et « nice » est une ville
// française reconnue. La liste seule en ferait une offre française.
check('« Nice, California » n’est pas en France — le code pays tranche',
  paysLever({ categories: { location: 'Nice, California' }, country: 'US' }) === 'INTL');
check('« Paris, Texas, United States » n’est pas en France',
  paysLever({ categories: { location: 'Paris, Texas, United States' } }) === 'INTL');
check('un lieu inconnu sans code pays ne devient pas la France',
  paysLever({ categories: { location: 'Žilina' } }) === null);
check('un code pays mal formé n’est pas lu comme un pays',
  paysLever({ categories: { location: 'Žilina' }, country: 'Slovaquie' }) === null);
check('sans lieu ni code, le distanciel est tout ce qu’on peut dire',
  paysLever({ categories: {}, workplaceType: 'remote' }) === 'REMOTE');
check('sans lieu, sans code et sans distanciel, le pays reste inconnu',
  paysLever({ categories: {} }) === null);

console.log('\n── Distanciel : un vocabulaire fermé de trois valeurs ');
check('« remote » est du distanciel', estDistanciel({ workplaceType: 'remote' }));
check('« hybrid » n’est PAS du distanciel — c’est un poste rattaché à un bureau',
  !estDistanciel({ workplaceType: 'hybrid' }));
check('« onsite » n’est pas du distanciel', !estDistanciel({ workplaceType: 'onsite' }));
check('une valeur absente n’est pas du distanciel', !estDistanciel({}));

console.log('\n── Description ──────────────────────────────────────');
check('le texte déjà dépouillé est pris tel quel',
  o.description === "Rejoignez l'équipe", JSON.stringify(o.description));
check('à défaut, le HTML est dépouillé',
  texteDeContenu({ description: '<p>Bonjour   <b>toi</b></p>' }) === 'Bonjour toi');
check('la description est bornée à 300 caractères',
  texteDeContenu({ descriptionPlain: 'a'.repeat(500) }).length === 300);
check('un contenu absent ne casse rien', texteDeContenu({}) === '');

console.log('\n── Un board en échec n’en emporte pas seize ─────────');
const journal = [];
const introuvable = await collecterBoard(entree, { journal, fetchImpl: async () => reponse(null, { ok: false, status: 404 }) });
check('un board disparu rend une liste vide', Array.isArray(introuvable) && introuvable.length === 0);
check('et le dit au journal avec un code HTTP', journal.at(-1)?.cause === 'http_404', journal.at(-1)?.cause);

const malforme = await collecterBoard(entree, { journal, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }) });
check('un JSON illisible rend une liste vide', malforme.length === 0);
check('et le dit', journal.at(-1)?.cause === 'reponse_illisible');

// Lever rend un TABLEAU à la racine. Un 200 qui n'en est pas un est illisible,
// pas vide : les confondre ferait lire « cette entreprise ne recrute pas » là
// où il faut lire « on n'a pas su lire ».
const pasUnTableau = await collecterBoard(entree, { journal, fetchImpl: async () => reponse({ postings: [] }) });
check('un 200 qui n’est pas un tableau est illisible, pas vide',
  pasUnTableau.length === 0 && journal.at(-1)?.cause === 'reponse_illisible');

const reseau = await collecterBoard(entree, { journal, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
check('une panne réseau rend une liste vide', reseau.length === 0);
check('et le dit', journal.at(-1)?.cause === 'erreur_reseau');

const coupure = await collecterBoard(entree, { journal, timeout: 5, fetchImpl: async () => { const e = new Error('abort'); e.name = 'AbortError'; throw e; } });
check('un délai dépassé est nommé « timeout »',
  coupure.length === 0 && journal.at(-1)?.cause === 'timeout');

// La garantie qui compte vraiment : la collecte entière survit.
const journalMixte = [];
const catalogue = [
  { board: 'vivant', company: 'Vivant' },
  { board: 'mort', company: 'Mort' },
  { board: 'illisible', company: 'Illisible' },
];
const melange = await collecterLever(catalogue, {
  journal: journalMixte,
  concurrence: 2,
  fetchImpl: async (url) => {
    if (url.includes('/mort')) return reponse(null, { ok: false, status: 404 });
    if (url.includes('/illisible')) throw new Error('ECONNRESET');
    return reponse([offreBrute]);
  },
});
check('deux boards en échec sur trois n’empêchent pas le troisième de rendre',
  melange.length === 1 && melange[0].company === 'Vivant', `${melange.length} offre(s)`);
check('les deux échecs sont journalisés nommément',
  journalMixte.length === 2 && journalMixte.every(e => /^Lever\//.test(e.source)),
  JSON.stringify(journalMixte.map(e => `${e.source}:${e.cause}`)));

console.log('\n── Hygiène ──────────────────────────────────────────');
const avant = JSON.stringify(offreBrute);
normaliserOffre(offreBrute, entree);
check('l’offre amont n’est pas mutée', JSON.stringify(offreBrute) === avant);
check('une offre sans titre est écartée',
  !offreExploitable(normaliserOffre({ id: 1, hostedUrl: 'https://x' }, entree)));
check('une offre sans URL est écartée',
  !offreExploitable(normaliserOffre({ id: 1, text: 'T' }, entree)));

console.log('\n── Catalogue ────────────────────────────────────────');
check('le catalogue n’est pas vide', BOARDS.length > 0, `${BOARDS.length} boards`);
check('chaque entrée porte un board et une entreprise',
  BOARDS.every(b => b.board && b.company));
check('aucun board en double',
  new Set(BOARDS.map(b => b.board)).size === BOARDS.length);
check('chaque board porte un relevé chiffré d’offres françaises',
  BOARDS.every(b => Number.isInteger(b.offresFR) && b.offresFR >= 0));
check('aucun board inscrit sans offre française au relevé',
  BOARDS.every(b => b.offresFR > 0));
check('la date du relevé est inscrite', /^\d{4}-\d{2}-\d{2}$/.test(RELEVE), RELEVE);
check('les board ids sont des slugs sûrs en URL',
  BOARDS.every(b => /^[a-z0-9-]+$/.test(b.board)));

// ── LE REGISTRE ET LE CRON ───────────────────────────────────────────────────
console.log('\n── Le registre des ATS ──────────────────────────────');
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const atsSrc = fs.readFileSync(new URL('../../api/_lib/ats.js', import.meta.url), 'utf8');
const cronSrc = fs.readFileSync(new URL('../../api/cron/collect-ats.js', import.meta.url), 'utf8');
const jobsSrc = fs.readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');

check('Lever est inscrit au registre', FOURNISSEURS.some(f => f.nom === 'Lever'));
check('chaque fournisseur porte une clé KV, un catalogue et un collecteur',
  FOURNISSEURS.every(f => f.cle && Array.isArray(f.boards) && typeof f.collecter === 'function'));
// Une clé partagée rendrait les pannes des deux ATS indiscernables — le silence
// exact que `causesEnEchec` est venu retirer.
check('aucune clé KV partagée entre deux fournisseurs',
  new Set(FOURNISSEURS.map(f => f.cle)).size === FOURNISSEURS.length);
check('un seul cron de collecte pour tous les ATS',
  (vercel.crons || []).filter(c => /collect-/.test(c.path)).length === 1,
  (vercel.crons || []).filter(c => /collect-/.test(c.path)).map(c => c.path).join(', '));

// Les trois gardes, exécutés — pas seulement cherchés dans le texte.
const fauxLever = {
  nom: 'Lever', cle: 'lever_jobs', concurrence: 2,
  boards: [{ board: 'acme', company: 'Acme' }],
  collecter: collecterLever,
};
const vide = await collecterFournisseur(fauxLever, { fetchImpl: async () => reponse([]) });
check('une collecte vide ne demande PAS d’écriture', vide.ecrire === false);
const etrangere = await collecterFournisseur(fauxLever, {
  fetchImpl: async () => reponse([{ ...offreBrute, categories: { location: 'Berlin' }, country: 'DE' }]),
});
check('une collecte sans offre française ne demande pas d’écriture',
  etrangere.ecrire === false && etrangere.stats.offresFrance === 0);
const pleine = await collecterFournisseur(fauxLever, { fetchImpl: async () => reponse([offreBrute]) });
check('une collecte française demande l’écriture', pleine.ecrire === true);
check('et la valeur écrite porte la date de collecte et la source',
  Boolean(pleine.valeur.collecteLe) && pleine.valeur.source === 'Lever');
check('seules les offres françaises sont retenues',
  pleine.valeur.offres.every(o => o.country === 'FR'));

console.log('\n── Branchement dans api/jobs.js ─────────────────────');
check('api/jobs.js porte un collecteur Lever', /async function fetchLever\(/.test(jobsSrc));
check('et il lit la clé qu’écrit le cron',
  jobsSrc.includes("kvGet('lever_jobs')") &&
  FOURNISSEURS.find(f => f.nom === 'Lever')?.cle === 'lever_jobs');
check('une clé absente déclare la source en échec, elle ne rend pas une liste vide',
  /muet\(journal, 'Lever'[^)]*'collecte_absente'\)/.test(jobsSrc));

// LA DÉCISION QUI SE VÉRIFIE ICI : Lever est placé AVANT les sources tierces,
// parce que `deduplicate()` garde la PREMIÈRE occurrence. Si l'ordre
// s'inversait un jour, une offre vue des deux côtés sortirait avec l'URL de
// l'agrégateur au lieu de celle de l'employeur — et tout l'intérêt de crawler
// la source serait perdu en silence, sans qu'aucun test ne rougisse.
const ordre = [...jobsSrc.matchAll(/\['([^']+)',\s+\(\) =>/g)].map(m => m[1]);
check('Lever est dans la liste des collecteurs', ordre.includes('Lever'), ordre.join(' → '));
const iLV = ordre.indexOf('Lever');
for (const tiers of ['France Travail', 'French Job Market', 'JSearch', 'Adzuna', 'Remotive', 'Arbeitnow']) {
  const i = ordre.indexOf(tiers);
  check(`Lever passe avant ${tiers} (le dédoublonnage garde la 1re occurrence)`,
    iLV >= 0 && i >= 0 && iLV < i);
}

// Exécution réelle de la fonction extraite du handler servi, avec un KV simulé.
function extraire(src, nom) {
  const i = src.indexOf(`async function ${nom}(`);
  if (i < 0) return null;
  let profondeur = 0;
  const debut = src.indexOf('{', i);
  for (let j = debut; j < src.length; j++) {
    if (src[j] === '{') profondeur++;
    else if (src[j] === '}' && --profondeur === 0) return src.slice(i, j + 1);
  }
  return null;
}
const blocFetch = extraire(jobsSrc, 'fetchLever');
check('le collecteur du handler est extractible pour être exécuté', Boolean(blocFetch));

async function appeler(contenuKV, { q = '', type = '', location = '', page = 0 } = {}) {
  const j = [];
  const bac = {
    console,
    kvGet: async () => contenuKV,
    muet: (jj, source, raison, cause) => { jj?.push({ source, raison, cause: cause || 'inconnue' }); return []; },
    FILTRE_VERS_CONTRAT: { stage: 'Stage', alternance: 'Alternance', cdi: 'CDI', cdd: 'CDD', freelance: 'Freelance' },
    resultat: null, journal: j,
  };
  vm.createContext(bac);
  vm.runInContext(`${blocFetch}; resultat = fetchLever(${JSON.stringify(q)}, ${JSON.stringify(type)}, ${JSON.stringify(location)}, ${page}, journal);`, bac);
  return { offres: await bac.resultat, journal: j };
}

const offreKV = (p = {}) => ({
  id: 'lv_acme_1', title: 'Développeur Backend', company: 'Acme', location: 'Paris',
  type: 'CDI', salary: null, description: 'Node.js', url: 'https://jobs.lever.co/acme/1',
  date: '2026-10-01T08:00:00Z', remote: false, source: 'Lever', logo: null, country: 'FR', ...p,
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

const avecInconnu = { offres: [offreKV(), offreKV({ id: 'lv_acme_2', title: 'Account Executive', type: null })] };
check('sous filtre CDI, seule l’offre au contrat LU est rendue',
  (await appeler(avecInconnu, { type: 'cdi' })).offres.length === 1);
check('sous filtre CDD, une offre au contrat inconnu n’est pas servie comme CDD',
  (await appeler(avecInconnu, { type: 'cdd' })).offres.length === 0);
check('hors filtre, l’offre au contrat inconnu est servie telle quelle',
  (await appeler(avecInconnu)).offres.length === 2);

const cent = { offres: Array.from({ length: 100 }, (_, i) => offreKV({ id: `lv_acme_${i}`, title: `Poste ${i}`, date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T08:00:00Z` })) };
const p0 = await appeler(cent);
const p1 = await appeler(cent, { page: 1 });
check('une page rend au plus dix offres', p0.offres.length === 10, `${p0.offres.length}`);
check('deux pages consécutives ne se recouvrent pas',
  !p0.offres.some(a => p1.offres.some(b => b.id === a.id)));
check('les plus récentes d’abord',
  new Date(p0.offres[0].date) >= new Date(p0.offres.at(-1).date));
check('le terme de recherche filtre vraiment',
  (await appeler(cent, { q: 'Poste 7' })).offres.every(o => /Poste 7/.test(o.title)));

console.log('\n── Le cron de collecte ──────────────────────────────');
const cronAts = (vercel.crons || []).find(c => c.path === '/api/cron/collect-ats');
check('le cron est déclaré dans vercel.json', Boolean(cronAts), cronAts?.schedule);
check('le cron refuse un appel sans CRON_SECRET',
  /CRON_SECRET/.test(cronSrc) && /\b401\b/.test(cronSrc));
// Un fournisseur qui explose ne doit pas emporter les autres : sans ce garde,
// une exception dans Lever laisserait la clé de Greenhouse non écrite.
check('un fournisseur qui échoue n’emporte pas les autres',
  /catch \(e\)/.test(cronSrc) && /continue;/.test(cronSrc));
check('la borne de taille et le TTL sont communs à tous les fournisseurs',
  MAX_OFFRES > 0 && TTL_SECONDES > 24 * 3600, `${MAX_OFFRES} offres, TTL ${TTL_SECONDES / 3600} h`);
check('le registre ne stocke que ce dont le pays est établi comme la France',
  /country === 'FR'/.test(atsSrc));

if (failed) { console.error(`\n❌ sonde Lever : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde Lever : ${passed} vérifications OK\n`);
