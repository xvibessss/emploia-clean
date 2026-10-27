// ── MESURE DU RECOUVREMENT ───────────────────────────────────────────────────
// La seule question qui décide si ce collecteur mérite la production : parmi
// les offres qu'il rapporte, combien les collecteurs actuels rendent-ils
// DÉJÀ ? Un collecteur de plus qui rapporte les mêmes offres ne vaut rien ;
// un collecteur qui en rapporte d'autres vaut son intégration.
//
// LE CHIFFRE DE TÊTE EST CELUI DES ENTREPRISES. Lever avait rendu 331 offres
// françaises dont 41,7 % absentes d'emploia et ZÉRO entreprise nouvelle : il
// avait épaissi la liste sans l'élargir, et ce fait était enterré sous le
// compte d'offres. Teamtailor a inversé l'ordre du rapport ; celui-ci le
// garde.
//
// Un ATS qui ajoute des offres d'employeurs déjà couverts rend la liste plus
// profonde ; un ATS qui ajoute des EMPLOYEURS rend le site utile à des
// candidats qu'il ne servait pas.
//
// LE PROTOCOLE, et il est délibérément DÉFAVORABLE au prototype. On n'
// interroge pas l'API de production sur des requêtes vagues où elle aurait
// peu de chances de tomber sur ces offres : on l'interroge ENTREPRISE PAR
// ENTREPRISE, avec le nom exact, ET EN PAGINANT JUSQU'À ÉPUISEMENT. Si Veepee
// publie 77 offres en France et qu'une recherche « Veepee » sur emploia n'en
// rend aucune sur AUCUNE page, le recouvrement est nul — et il l'est dans les
// conditions les plus favorables aux collecteurs en place, pas dans un cas
// tordu choisi pour faire gagner le nouveau venu.
//
// POURQUOI LA PAGINATION EST DANS LA MESURE, et pas seulement dans un
// contre-test à côté. Le premier relevé n'interrogeait que `page=0`, et il
// rendait 90,2 % d'offres « absentes ». Le contre-test l'a démenti dans
// l'heure : en paginant, emploia rendait déjà 41 offres Qonto quand Ashby en
// porte 27, et 43 Verkor sur 44. La production BORNE chaque source par page
// (Greenhouse à 10, les offres employeurs à 5, France Travail à 8) ; mesurer
// sur une seule page ne mesure donc pas la couverture, il mesure la taille
// d'une page. Le chiffre était flatteur et faux, et un chiffre faux dans le
// bon sens est le plus dangereux de tous. La pagination est donc remontée
// DANS le protocole.
//
// La clé de comparaison n'est pas inventée pour l'occasion : c'est la clé de
// `deduplicate()`, EXTRAITE du vrai `api/jobs.js` et exécutée telle quelle,
// avec un garde qui FAIT ÉCHOUER la mesure si cette clé change. Une copie de
// la logique resterait verte en divergeant du handler — c'est le gabarit de
// `scripts/greenhouse/recouvrement.mjs`, pour la même raison.
import fs from 'node:fs';
import vm from 'node:vm';
import { collecterAshby } from '../../api/_lib/ashby.js';
import { BOARDS } from '../../api/_lib/ashby-boards.js';

const API = process.env.EMPLOIA_API || 'https://emploia.eu/api/jobs';
const src = fs.readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');

function extraire(nom) {
  const i = src.indexOf(`function ${nom}(`);
  if (i < 0) throw new Error(`fonction ${nom} introuvable dans api/jobs.js`);
  let profondeur = 0;
  const debut = src.indexOf('{', i);
  for (let j = debut; j < src.length; j++) {
    if (src[j] === '{') profondeur++;
    else if (src[j] === '}' && --profondeur === 0) return src.slice(i, j + 1);
  }
  throw new Error(`fonction ${nom} mal fermée`);
}

// LE GARDE QUI REND LA MESURE CADUQUE PLUTÔT QUE FAUSSE. Si la clé de
// dédoublonnage du handler change, comparer avec l'ancienne ne mesure plus
// rien — et le chiffre sortirait quand même, l'air juste.
const texteDedup = extraire('deduplicate');
const CLE_ATTENDUE = "(j.title+j.company).toLowerCase().replace(/[^a-z0-9]/g,'')";
if (!texteDedup.includes(CLE_ATTENDUE)) {
  console.error('✗ la clé de dédoublonnage de api/jobs.js a changé — cette mesure est caduque.');
  console.error(`  attendu : ${CLE_ATTENDUE}`);
  console.error(`  lu      : ${texteDedup}`);
  process.exit(1);
}
const bac = { module: {} };
vm.createContext(bac);
vm.runInContext(`${texteDedup}; module.cle = j => ${CLE_ATTENDUE};`, bac);
const cle = bac.module.cle;

const pause = (ms) => new Promise(r => setTimeout(r, ms));

const PAGE_MAX = 10;

async function interrogerUnePage(params) {
  const url = `${API}?${new URLSearchParams(params)}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    let res;
    try { res = await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(t); }
    if (!res.ok) return { erreur: `http_${res.status}`, jobs: [] };
    const d = await res.json();
    return {
      jobs: Array.isArray(d?.jobs) ? d.jobs : [],
      demo: d?.demo === true,
      enEchec: d?.sourcesEnEchec || [],
      causes: d?.causesEnEchec || null,
    };
  } catch (e) {
    return { erreur: e?.name === 'AbortError' ? 'timeout' : 'erreur_reseau', jobs: [] };
  }
}

// Une requête, toutes ses pages. On s'arrête après DEUX pages consécutives qui
// n'apportent aucune clé nouvelle : une seule page vide peut être un trou de
// pagination entre deux sources bornées différemment, deux de suite disent que
// la source est épuisée.
async function interrogerToutesPages(params, ajouter) {
  let rendues = 0, pages = 0, pagesSteriles = 0, demo = false, erreur = null, causes = null, enEchec = [];
  for (let page = 0; page <= PAGE_MAX && pagesSteriles < 2; page++) {
    const r = await interrogerUnePage({ ...params, page: String(page) });
    pages++;
    if (r.erreur) { erreur = r.erreur; break; }
    if (r.demo) demo = true;
    if (r.causes && !causes) causes = r.causes;
    if (r.enEchec?.length) enEchec = r.enEchec;
    rendues += r.jobs.length;
    const nouvelles = ajouter(r.jobs);
    if (nouvelles === 0) pagesSteriles++; else pagesSteriles = 0;
    await pause(1100);                      // l'API limite à 60 requêtes/minute
  }
  return { rendues, pages, demo, erreur, causes, enEchec };
}

console.error('1/3 — collecte Ashby…');
const journal = [];
const debut = Date.now();
const ashby = await collecterAshby(BOARDS, { journal });
const dureeCollecte = Date.now() - debut;
const fr = ashby.filter(o => o.country === 'FR');
console.error(`      ${ashby.length} offres en ${(dureeCollecte / 1000).toFixed(1)} s, dont ${fr.length} en France.`);

console.error('2/3 — interrogation de l’API de production, entreprise par entreprise…');
const vues = new Map();
const parRequete = [];
const requetes = [
  ...BOARDS.map(b => ({ q: b.company, location: 'France' })),
  // Quelques requêtes génériques, pour ne pas mesurer QUE le cas nominatif.
  { q: 'développeur', location: 'Paris' }, { q: 'data engineer', location: 'Paris' },
  { q: 'product manager', location: 'Paris' }, { q: 'software engineer', location: 'France' },
  { q: 'account executive', location: 'Paris' }, { q: 'ingénieur', location: 'France' },
  { q: 'commercial', location: 'France' }, { q: 'alternance', location: 'Paris' },
];
let causesVues = null;
const ajouter = (jobs) => {
  let n = 0;
  for (const j of jobs) {
    if (!j?.title || !j?.company) continue;
    const k = cle(j);
    if (!vues.has(k)) n++;
    vues.set(k, j);
  }
  return n;
};
for (const [i, params] of requetes.entries()) {
  const r = await interrogerToutesPages(params, ajouter);
  if (r.causes && !causesVues) causesVues = r.causes;
  parRequete.push({ ...params, rendues: r.rendues, pages: r.pages, demo: r.demo, erreur: r.erreur, enEchec: r.enEchec });
  process.stderr.write(`      ${i + 1}/${requetes.length} « ${params.q} » → ${r.rendues} offres sur ${r.pages} page(s)${r.demo ? ' (DÉMO)' : ''}${r.erreur ? ' ' + r.erreur : ''}\n`);
}

console.error('3/3 — comparaison…');
const clesEmploia = new Set(vues.keys());
const deja = fr.filter(o => clesEmploia.has(cle(o)));
const nouvelles = fr.filter(o => !clesEmploia.has(cle(o)));

// Un recouvrement par ENTREPRISE, aussi : une offre peut différer par son
// titre tout en venant du même employeur. Si emploia connaît déjà
// l'entreprise mais pas l'offre, l'apport est plus faible que le compte
// d'offres ne le dit — et c'est ce que le relevé Greenhouse avait montré.
const normal = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const entreprisesEmploia = new Set([...vues.values()].map(j => normal(j.company)));
const entreprisesAshby = [...new Set(fr.map(o => o.company))];
const entreprisesConnues = entreprisesAshby.filter(c => entreprisesEmploia.has(normal(c)));

const entreprisesNouvelles = entreprisesAshby.filter(c => !entreprisesEmploia.has(normal(c)));
const offresDesNouvelles = fr.filter(o => !entreprisesEmploia.has(normal(o.company))).length;

const enDemo = parRequete.filter(r => r.demo).length;
const enErreur = parRequete.filter(r => r.erreur).length;

console.log('\n══ RECOUVREMENT ASHBY × COLLECTEURS ACTUELS ════════════════════');
console.log(`Requêtes envoyées à l’API de production : ${requetes.length}, paginées jusqu’à épuisement (${parRequete.reduce((s, r) => s + r.pages, 0)} pages au total)`);
console.log(`  dont en repli démo (aucune source vivante) : ${enDemo}`);
console.log(`  dont en erreur : ${enErreur}`);
console.log(`Offres distinctes rendues par emploia : ${clesEmploia.size}`);
if (causesVues) console.log(`Causes d’échec publiées par la prod : ${JSON.stringify(causesVues)}`);

// ── LE CHIFFRE DE TÊTE : LES ENTREPRISES ────────────────────────────────────
console.log('\n── CE QUE LE CATALOGUE ÉLARGIT (le chiffre qui décide) ──────────────');
console.log(`Entreprises Ashby avec offres FR : ${entreprisesAshby.length}`);
console.log(`  INCONNUES d'emploia aujourd'hui : ${entreprisesNouvelles.length} (${(100 * entreprisesNouvelles.length / entreprisesAshby.length).toFixed(1)}%)`);
for (const c of entreprisesNouvelles) {
  console.log(`      · ${c} — ${fr.filter(o => o.company === c).length} offre(s) FR`);
}
console.log(`  déjà présentes                  : ${entreprisesConnues.length}${entreprisesConnues.length ? ' — ' + entreprisesConnues.join(', ') : ''}`);
console.log(`Offres portées par les entreprises nouvelles : ${offresDesNouvelles} / ${fr.length}`);
console.log('\n  Repères : Greenhouse 9 entreprises nouvelles sur 27, Lever 0 sur 16, Teamtailor 10 sur 19.');

// ── PUIS LE RECOUVREMENT D'OFFRES ───────────────────────────────────────────
console.log('\n── CE QUE LE CATALOGUE APPROFONDIT (offre par offre) ────────────────');
console.log(`Offres Ashby collectées : ${ashby.length} en ${(dureeCollecte / 1000).toFixed(1)} s`);
console.log(`Offres Ashby localisées en France : ${fr.length} (${(100 * fr.length / ashby.length).toFixed(1)}% de la collecte)`);
console.log(`  déjà rendues par les collecteurs actuels : ${deja.length} (${(100 * deja.length / fr.length).toFixed(1)}%)`);
console.log(`  ABSENTES des collecteurs actuels        : ${nouvelles.length} (${(100 * nouvelles.length / fr.length).toFixed(1)}%)`);
console.log(`  dont portant un salaire publié          : ${fr.filter(o => o.salary).length}`);
if (deja.length) {
  console.log('\nLes offres en recouvrement :');
  for (const o of deja.slice(0, 20)) console.log(`  · ${o.company} — ${o.title}`);
}
console.log('\nÉchantillon de ce que le collecteur apporte en propre :');
for (const o of nouvelles.slice(0, 12)) console.log(`  · ${o.company} — ${o.title} (${o.location})${o.type ? ' [' + o.type + ']' : ''}`);
if (journal.length) console.log(`\nBoards en échec : ${JSON.stringify(journal)}`);

const out = process.argv.find(a => a.startsWith('--out='))?.slice(6);
if (out) {
  fs.writeFileSync(out, JSON.stringify({
    releve: new Date().toISOString(),
    ashby: { total: ashby.length, fr: fr.length, dureeMs: dureeCollecte },
    emploia: { requetes: parRequete, offresDistinctes: clesEmploia.size, enDemo, enErreur, causes: causesVues },
    recouvrement: { deja: deja.length, nouvelles: nouvelles.length, entreprisesConnues, entreprisesNouvelles, offresDesNouvelles },
    echantillonNouvelles: nouvelles.slice(0, 50).map(o => ({ company: o.company, title: o.title, location: o.location, type: o.type, url: o.url })),
  }, null, 2));
  console.log(`\nRelevé écrit dans ${out}`);
}
