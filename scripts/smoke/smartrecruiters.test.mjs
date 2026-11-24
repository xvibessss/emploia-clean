// Sonde du collecteur SmartRecruiters.
//
// HORS LIGNE, comme les sondes Greenhouse, Lever et Teamtailor : le réseau est
// injecté (`fetchImpl`), donc la sonde teste le collecteur et non la
// disponibilité de SmartRecruiters.
//
// Ce qu'elle verrouille, dans l'ordre d'importance :
//   1. L'id `permanent` n'est JAMAIS lu comme un CDI — mesuré, il couvre
//      124 CDD. Le contrat vient du titre, ou il vaut `null`.
//   2. Une entreprise ne remplit pas la clé à elle seule : 60 offres au plus,
//      les plus récentes.
//   3. Une page en échec au milieu de la pagination garde les pages lues ; une
//      entreprise en échec n'emporte pas les autres.
//   4. Le pays est relu offre par offre, même sous le filtre serveur.
//   5. La forme de sortie est celle des autres collecteurs, et le registre,
//      le cron unique et `api/jobs.js` sont branchés.
import fs from 'node:fs';
import vm from 'node:vm';
import {
  collecterBoard, collecterSmartRecruiters, normaliserOffre, paysSmartRecruiters,
  lieuAffiche, offreExploitable, PAR_ENTREPRISE, PAR_PAGE,
} from '../../api/_lib/smartrecruiters.js';
import { FOURNISSEURS, MAX_OFFRES, collecterFournisseur } from '../../api/_lib/ats.js';
import { causeDepuisBalise } from '../../api/_lib/ats-balise.js';
import { lecteurPartage } from './_lecteur-partage.mjs';
import { BOARDS, RELEVE } from '../../api/_lib/smartrecruiters-boards.js';
import { CONTRATS, contratSmartRecruiters, tempsSmartRecruiters } from '../../api/_lib/contrat.js';

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const reponse = (corps, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => corps });
const entree = { board: 'acme', company: 'Acme' };
// La forme réelle d'une offre de la liste, relevée chez Accor le 2026-11-04.
const posting = (p = {}) => ({
  id: '744000159665479',
  name: 'Réceptionniste - CDI 35H/s H/F',
  company: { identifier: 'Acme', name: 'ACME' },
  releasedDate: '2026-11-04T15:31:07.126Z',
  location: { city: 'PARIS', region: 'IDF', country: 'fr', remote: false, hybrid: false, fullLocation: 'PARIS, IDF, France' },
  typeOfEmployment: { id: 'permanent', label: 'Full-time' },
  function: { id: 'customer_service', label: 'Customer Service' },
  ...p,
  location: { city: 'PARIS', country: 'fr', remote: false, hybrid: false, ...(p.location || {}) },
});
const page = (content, totalFound = content.length) => reponse({ offset: 0, limit: PAR_PAGE, totalFound, content });

console.log('\n── Forme de sortie ──────────────────────────────────');
const o = normaliserOffre(posting(), entree);
for (const champ of ['id', 'title', 'company', 'location', 'type', 'salary', 'description', 'url', 'date', 'remote', 'source', 'logo', 'country']) {
  check(`le champ « ${champ} » existe`, champ in o);
}
check('l’identifiant est préfixé par la source et l’entreprise', o.id === 'sr_acme_744000159665479', o.id);
check('la source est nommée', o.source === 'SmartRecruiters');
check('l’entreprise affichée est celle du catalogue, pas le nom servi en capitales', o.company === 'Acme');
check('l’URL est la page publique de l’offre',
  o.url === 'https://jobs.smartrecruiters.com/Acme/744000159665479', o.url);
check('la date est celle de publication', o.date === '2026-11-04T15:31:07.126Z');
check('aucun salaire n’est inventé', o.salary === null);
check('aucune description n’est inventée — la liste n’en porte pas', o.description === '');

console.log('\n── Le contrat : l’id ne dit rien, le titre parle ────');
// LE PIÈGE. « CHEF DE RANG - CDD TEMPS PLEIN » est servi `permanent` chez
// Accor. Lire l'id publierait un CDI sur un CDD.
check('un titre « CDD » servi `permanent` reste un CDD',
  contratSmartRecruiters(posting({ name: 'CHEF DE RANG (F/H/X) - CDD TEMPS PLEIN', typeOfEmployment: { id: 'permanent' } })) === 'CDD');
check('l’id `permanent` seul ne rend AUCUN contrat',
  contratSmartRecruiters(posting({ name: 'Ingénieur Qualité (H/F)', typeOfEmployment: { id: 'permanent' } })) === null);
check('l’id `contract` seul ne rend aucun contrat — il couvre autant de CDI que de CDD',
  contratSmartRecruiters(posting({ name: 'Consultant SAP', typeOfEmployment: { id: 'contract' } })) === null);
check('l’id `intern` seul ne rend pas « Stage » — il étiquette aussi des postes',
  contratSmartRecruiters(posting({ name: 'Développeur Java F/H', typeOfEmployment: { id: 'intern' } })) === null);
check('un titre « Stage » rend Stage',
  contratSmartRecruiters(posting({ name: 'Stage Commercial & Opérationnel (H/F/X)' })) === 'Stage');
check('un titre « Alternant » rend Alternance',
  contratSmartRecruiters(posting({ name: 'Alternant Auditeur Financier - Lille' })) === 'Alternance');
check('un titre « CDI » rend CDI', o.type === 'CDI');
check('le contrat est toujours du vocabulaire fermé ou null',
  [o.type, contratSmartRecruiters(posting({ name: 'x' }))].every(v => v === null || CONTRATS.has(v)));
check('la durée vient du titre : « Temps partiel »',
  tempsSmartRecruiters(posting({ name: 'Employé restauration - CDI - Temps partiel' })) === 'Temps partiel');
check('l’id `part-time` seul ne rend aucune durée',
  tempsSmartRecruiters(posting({ name: 'Stage Superviseur Restauration', typeOfEmployment: { id: 'part-time' } })) === null);

console.log('\n── Le pays ──────────────────────────────────────────');
check('`fr` donne FR', paysSmartRecruiters(posting()) === 'FR');
check('le code est lu sans égard à la casse', paysSmartRecruiters(posting({ location: { country: 'FR' } })) === 'FR');
check('un pays de l’Union donne EU', paysSmartRecruiters(posting({ location: { country: 'de' } })) === 'EU');
check('un autre pays donne INTL', paysSmartRecruiters(posting({ location: { country: 'ca' } })) === 'INTL');
check('sans code, pas de pays inventé', paysSmartRecruiters(posting({ location: { country: '' } })) === null);
check('`hybrid` n’est pas du distanciel',
  normaliserOffre(posting({ location: { hybrid: true } }), entree).remote === false);
check('`remote: true` est du distanciel',
  normaliserOffre(posting({ location: { remote: true } }), entree).remote === true);

console.log('\n── Le lieu affiché ──────────────────────────────────');
check('« PARIS » devient « Paris »', o.location === 'Paris', o.location);
check('« BOULOGNE-BILLANCOURT » devient « Boulogne-Billancourt »',
  lieuAffiche(posting({ location: { city: 'BOULOGNE-BILLANCOURT' } })) === 'Boulogne-Billancourt');
check("« VILLENEUVE-D'ASCQ » devient « Villeneuve-d'Ascq »",
  lieuAffiche(posting({ location: { city: "VILLENEUVE-D'ASCQ" } })) === "Villeneuve-d'Ascq");
check('une ville déjà en casse mixte n’est pas touchée',
  lieuAffiche(posting({ location: { city: 'La Défense' } })) === 'La Défense');
check('sans ville : « Non précisé »', lieuAffiche(posting({ location: { city: '' } })) === 'Non précisé');

console.log('\n── Collecte : pagination, borne, pays ───────────────');
const urls = [];
const deuxPages = await collecterBoard(entree, {
  parEntreprise: Infinity,
  fetchImpl: async (url) => {
    urls.push(url);
    const offset = Number(new URL(url).searchParams.get('offset'));
    if (offset === 0) return page(Array.from({ length: PAR_PAGE }, (_, i) => posting({ id: `a${i}` })), 130);
    return page(Array.from({ length: 30 }, (_, i) => posting({ id: `b${i}` })), 130);
  },
});
check('la pagination va jusqu’à épuisement', deuxPages.length === 130, `${deuxPages.length} offres, ${urls.length} pages`);
check('le filtre serveur `country=fr` est demandé', urls.every(u => new URL(u).searchParams.get('country') === 'fr'));
check('les pages avancent par 100', urls.map(u => new URL(u).searchParams.get('offset')).join(',') === '0,100');

const melangePays = await collecterBoard(entree, {
  fetchImpl: async () => page([posting({ id: '1' }), posting({ id: '2', location: { country: 'ca', city: 'Montreal' } })]),
});
check('une offre étrangère glissée sous le filtre est écartée', melangePays.length === 1 && melangePays[0].country === 'FR');

const nombreuses = await collecterBoard(entree, {
  fetchImpl: async (url) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    return page(Array.from({ length: offset < 200 ? PAR_PAGE : 50 }, (_, i) => posting({
      id: `${offset}-${i}`, releasedDate: new Date(Date.UTC(2026, 9, 1) + (offset + i) * 3600e3).toISOString(),
    })), 250);
  },
});
check(`une entreprise est bornée à ${PAR_ENTREPRISE} offres`, nombreuses.length === PAR_ENTREPRISE, `${nombreuses.length}`);
check('… et ce sont les plus récentes',
  nombreuses.every((x, i, a) => i === 0 || new Date(a[i - 1].date) >= new Date(x.date)) &&
  nombreuses[0].id === 'sr_acme_200-49');

console.log('\n── Les échecs sont nommés et isolés ─────────────────');
const journal = [];
const introuvable = await collecterBoard(entree, { journal, fetchImpl: async () => reponse(null, { ok: false, status: 404 }) });
check('un 404 rend une liste vide et un code HTTP', introuvable.length === 0 && journal.at(-1)?.cause === 'http_404');
const illisible = await collecterBoard(entree, { journal, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } }) });
check('un JSON illisible est nommé', illisible.length === 0 && journal.at(-1)?.cause === 'reponse_illisible');
const sansContenu = await collecterBoard(entree, { journal, fetchImpl: async () => reponse({ totalFound: 3 }) });
check('un 200 sans tableau « content » est illisible, pas vide',
  sansContenu.length === 0 && journal.at(-1)?.cause === 'reponse_illisible');
const coupure = await collecterBoard(entree, { journal, fetchImpl: async () => { const e = new Error('a'); e.name = 'AbortError'; throw e; } });
check('un délai dépassé est nommé « timeout »', coupure.length === 0 && journal.at(-1)?.cause === 'timeout');

const journalPage = [];
const pageCassee = await collecterBoard(entree, {
  journal: journalPage, parEntreprise: Infinity,
  fetchImpl: async (url) => Number(new URL(url).searchParams.get('offset')) === 0
    ? page(Array.from({ length: PAR_PAGE }, (_, i) => posting({ id: `p${i}` })), 300)
    : reponse(null, { ok: false, status: 503 }),
});
check('une page en échec garde les pages déjà lues', pageCassee.length === PAR_PAGE, `${pageCassee.length}`);
check('… et l’échec est journalisé', journalPage.at(-1)?.cause === 'http_503');

// Le piège propre à cet ATS : un identifiant inconnu rend 200 et zéro offre.
const inconnu = await collecterBoard(entree, { journal: [], fetchImpl: async () => page([], 0) });
check('un identifiant inconnu (200, totalFound 0) rend une liste vide sans planter', inconnu.length === 0);

const journalMixte = [];
const mixte = await collecterSmartRecruiters(
  [{ board: 'vivant', company: 'Vivant' }, { board: 'mort', company: 'Mort' }, { board: 'reset', company: 'Reset' }],
  {
    journal: journalMixte, concurrence: 2,
    fetchImpl: async (url) => {
      if (url.includes('/mort/')) return reponse(null, { ok: false, status: 404 });
      if (url.includes('/reset/')) throw new Error('ECONNRESET');
      return page([posting()]);
    },
  });
check('deux entreprises en échec sur trois n’empêchent pas la troisième',
  mixte.length === 1 && mixte[0].company === 'Vivant');
check('les deux échecs sont journalisés nommément',
  journalMixte.length === 2 && journalMixte.every(e => /^SmartRecruiters\//.test(e.source)),
  JSON.stringify(journalMixte.map(e => `${e.source}:${e.cause}`)));

console.log('\n── Hygiène ──────────────────────────────────────────');
const brut = posting();
const avant = JSON.stringify(brut);
normaliserOffre(brut, entree);
check('l’offre amont n’est pas mutée', JSON.stringify(brut) === avant);
check('une offre sans titre est écartée', !offreExploitable(normaliserOffre({ id: '1', location: {} }, entree)));
check('une offre sans id (donc sans URL) est écartée', !offreExploitable(normaliserOffre({ name: 'T', location: {} }, entree)));

console.log('\n── Catalogue ────────────────────────────────────────');
check('le catalogue n’est pas vide', BOARDS.length > 0, `${BOARDS.length} entreprises`);
check('chaque entrée porte un identifiant et une entreprise', BOARDS.every(b => b.board && b.company));
check('aucun identifiant en double', new Set(BOARDS.map(b => b.board)).size === BOARDS.length);
check('aucune entreprise inscrite sans offre française au relevé', BOARDS.every(b => Number.isInteger(b.offresFR) && b.offresFR > 0));
check('la date du relevé est inscrite', /^\d{4}-\d{2}-\d{2}$/.test(RELEVE), RELEVE);
// L'identifiant entre dans un CHEMIN d'URL : une barre ou un point en
// sortirait. Et l'API est insensible à la casse : minuscules seulement.
check('les identifiants sont des segments de chemin sûrs, en minuscules', BOARDS.every(b => /^[a-z0-9-]+$/.test(b.board)));

console.log('\n── Le registre des ATS ──────────────────────────────');
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const jobsSrc = fs.readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');
const f = FOURNISSEURS.find(x => x.nom === 'SmartRecruiters');
check('SmartRecruiters est inscrit au registre', Boolean(f));
check('sa clé est la sienne', f?.cle === 'smartrecruiters_jobs' && FOURNISSEURS.filter(x => x.cle === f.cle).length === 1);
check('aucun cron ne porte le nom de SmartRecruiters — le registre n’est pas contourné',
  !(vercel.crons || []).some(c => /collect-smartrecruiters$/.test(c.path)));
// La borne propre est justifiée par le POIDS : 360 octets par offre, mesuré.
// Si quelqu'un la relève, le poids doit rester sous celui de la borne commune
// (600 × 668 octets).
check('la borne propre reste sous le poids accepté par la borne commune',
  (f?.maxOffres ?? MAX_OFFRES) * 360 <= MAX_OFFRES * 668, `${f?.maxOffres} × 360 o`);

const faux = { ...f, boards: [{ board: 'acme', company: 'Acme' }], concurrence: 1 };
const vide = await collecterFournisseur(faux, { fetchImpl: async () => page([], 0) });
check('une collecte vide ne demande PAS d’écriture', vide.ecrire === false);
const pleine = await collecterFournisseur(faux, { fetchImpl: async () => page([posting()]) });
check('une collecte française demande l’écriture', pleine.ecrire === true && pleine.valeur.offres.length === 1);
const borneSrc = fs.readFileSync(new URL('../../api/_lib/ats.js', import.meta.url), 'utf8');
check('le registre applique la borne du fournisseur quand il en déclare une',
  /fournisseur\.maxOffres \?\? MAX_OFFRES/.test(borneSrc));

console.log('\n── Branchement dans api/jobs.js ─────────────────────');
check('api/jobs.js porte un collecteur SmartRecruiters', /async function fetchSmartRecruiters\(/.test(jobsSrc));
check('et il lit la clé qu’écrit le cron', jobsSrc.includes("kvGet('smartrecruiters_jobs')"));
check('un réservoir vide déclare la source en échec, via la balise',
  /muet\(journal, 'SmartRecruiters',[\s\S]{0,160}?causeDepuisBalise\(await lireBalise\(\), 'SmartRecruiters'\)\)/.test(jobsSrc));
const collecteurs = jobsSrc.match(/const COLLECTEURS = \[([^\]]+)\]/)?.[1] || '';
check('SmartRecruiters est dans COLLECTEURS — sinon il n’est jamais compté', collecteurs.includes("'SmartRecruiters'"));
const ordre = [...jobsSrc.matchAll(/\['([^']+)',\s+\(\) =>/g)].map(m => m[1]);
const iSR = ordre.indexOf('SmartRecruiters');
check('SmartRecruiters est dans la liste des collecteurs', iSR >= 0, ordre.join(' → '));
for (const tiers of ['France Travail', 'French Job Market', 'JSearch', 'Adzuna', 'Remotive', 'Arbeitnow']) {
  const i = ordre.indexOf(tiers);
  check(`SmartRecruiters passe avant ${tiers}`, iSR >= 0 && i >= 0 && iSR < i);
}

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
const blocFetch = extraire(jobsSrc, 'fetchSmartRecruiters');
// Le collecteur délègue sa lecture à `servirReservoir` et à `_lib/recherche.js`,
// exécutés tels qu'écrits — voir `_lecteur-partage.mjs`.
const lecteur = lecteurPartage(jobsSrc);
check('le lecteur partagé des réservoirs est exécutable tel qu’écrit', lecteur.present);
check('le collecteur du handler est extractible pour être exécuté', Boolean(blocFetch));

async function appeler(contenuKV, { q = '', type = '', location = '', page: p = 0, balise = null } = {}) {
  const j = [];
  const bac = {
    console,
    ...lecteur.globaux,
    kvGet: async () => contenuKV,
    muet: (jj, source, raison, cause) => { jj?.push({ source, raison, cause: cause || 'inconnue' }); return []; },
    causeDepuisBalise,
    lireBalise: async () => balise,
    FILTRE_VERS_CONTRAT: { stage: 'Stage', alternance: 'Alternance', cdi: 'CDI', cdd: 'CDD', freelance: 'Freelance' },
    resultat: null, journal: j,
  };
  vm.createContext(bac);
  vm.runInContext(`${lecteur.source}\n${blocFetch}; resultat = fetchSmartRecruiters(${JSON.stringify(q)}, ${JSON.stringify(type)}, ${JSON.stringify(location)}, ${p}, journal, lireBalise);`, bac);
  return { offres: await bac.resultat, journal: j };
}
const offreKV = (p = {}) => ({ ...normaliserOffre(posting(), entree), ...p });

const absente = await appeler(null);
check('une clé KV absente déclare la source en échec', absente.offres.length === 0 && Boolean(absente.journal.at(-1)?.cause));
const normal = await appeler({ offres: [offreKV()] });
check('une clé valide rend ses offres', normal.offres.length === 1 && normal.journal.length === 0);
const avecInconnu = { offres: [offreKV(), offreKV({ id: 'sr_acme_2', title: 'Chef de partie', type: null })] };
check('sous filtre CDI, seule l’offre au contrat LU est rendue', (await appeler(avecInconnu, { type: 'cdi' })).offres.length === 1);
check('sous filtre CDD, une offre au contrat inconnu n’est pas servie', (await appeler(avecInconnu, { type: 'cdd' })).offres.length === 0);
check('le terme de recherche lit le titre', (await appeler(avecInconnu, { q: 'chef de partie' })).offres.length === 1);
check('le lieu filtre sur la ville', (await appeler(avecInconnu, { location: 'Lyon' })).offres.length === 0);
// Boulanger est au catalogue : ses vendeurs ne répondent pas à « boulanger »,
// et ne prennent donc pas la place des vrais postes, le tri étant par date.
const avecEnseigne = { offres: [
  offreKV({ id: 'sr_boulanger_1', title: 'Vendeur électroménager H/F', company: 'Boulanger', date: '2026-11-04T00:00:00.000Z' }),
  offreKV({ id: 'sr_acme_3', title: 'Commis boulanger', date: '2026-10-01T00:00:00.000Z' }),
] };
const surBoulanger = await appeler(avecEnseigne, { q: 'boulanger' });
check('« boulanger » ne remonte pas l’enseigne Boulanger sur son seul nom',
  surBoulanger.offres.length === 1 && surBoulanger.offres[0].id === 'sr_acme_3');
check('l’enseigne reste trouvable par le titre de ses offres',
  (await appeler(avecEnseigne, { q: 'vendeur' })).offres.length === 1);
const cent = { offres: Array.from({ length: 35 }, (_, i) => offreKV({ id: `sr_acme_${i}`, date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString() })) };
const p0 = await appeler(cent), p1 = await appeler(cent, { page: 1 });
check('une page rend au plus dix offres', p0.offres.length === 10);
check('deux pages ne se recouvrent pas', !p0.offres.some(a => p1.offres.some(b => b.id === a.id)));
check('les plus récentes d’abord', new Date(p0.offres[0].date) >= new Date(p0.offres.at(-1).date));

if (failed) { console.error(`\n❌ sonde SmartRecruiters : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde SmartRecruiters : ${passed} vérifications OK\n`);
