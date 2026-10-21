// ── MESURE DU RECOUVREMENT ───────────────────────────────────────────────────
// La seule question qui décide si ce collecteur mérite la production : parmi
// les offres qu'il rapporte, combien les huit collecteurs actuels rendent-ils
// DÉJÀ ? Un collecteur de plus qui rapporte les mêmes offres ne vaut rien ;
// un collecteur qui en rapporte d'autres vaut son intégration.
//
// LE PROTOCOLE, et il est délibérément DÉFAVORABLE au prototype. On n'
// interroge pas l'API de production sur des requêtes vagues où elle aurait
// peu de chances de tomber sur ces offres : on l'interroge ENTREPRISE PAR
// ENTREPRISE, avec le nom exact. Si Doctolib publie 75 offres en France et
// qu'une recherche « Doctolib » sur emploia n'en rend aucune, le recouvrement
// est nul — et il l'est dans les conditions les plus favorables aux
// collecteurs en place, pas dans un cas tordu choisi pour faire gagner le
// nouveau venu.
//
// La clé de comparaison n'est pas inventée pour l'occasion : c'est la clé de
// `deduplicate()`, EXTRAITE du vrai `api/jobs.js` et exécutée telle quelle.
// Une copie de la logique resterait verte en divergeant du handler — c'est le
// gabarit de `scripts/smoke/contrat.test.mjs`, pour la même raison.
import fs from 'node:fs';
import vm from 'node:vm';
import { collecterGreenhouse } from '../../api/_lib/greenhouse.js';
import { BOARDS } from '../../api/_lib/greenhouse-boards.js';

const API = process.env.EMPLOIA_API || 'https://emploia.eu/api/jobs';
const src = fs.readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');

// La clé de dédoublonnage, prise dans le handler servi en production.
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
const bac = { module: {} };
vm.createContext(bac);
vm.runInContext(`${extraire('deduplicate')}; module.cle = j => (j.title+j.company).toLowerCase().replace(/[^a-z0-9]/g,'');`, bac);
// Vérification que la clé locale est bien CELLE du handler : on la relit dans
// le texte extrait plutôt que de la supposer identique.
const texteDedup = extraire('deduplicate');
if (!texteDedup.includes("(j.title+j.company).toLowerCase().replace(/[^a-z0-9]/g,'')")) {
  console.error('✗ la clé de dédoublonnage de api/jobs.js a changé — cette mesure est caduque.');
  process.exit(1);
}
const cle = bac.module.cle;

const pause = (ms) => new Promise(r => setTimeout(r, ms));

async function interroger(params) {
  const url = `${API}?${new URLSearchParams(params)}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { erreur: `http_${res.status}`, jobs: [] };
    const d = await res.json();
    return { jobs: Array.isArray(d?.jobs) ? d.jobs : [], demo: d?.demo === true, sources: d?.sources || [], enEchec: d?.sourcesEnEchec || [] };
  } catch (e) {
    return { erreur: e?.name === 'AbortError' ? 'timeout' : 'erreur_reseau', jobs: [] };
  }
}

console.error('1/3 — collecte Greenhouse…');
const journal = [];
const greenhouse = await collecterGreenhouse(BOARDS, { journal });
const fr = greenhouse.filter(o => o.country === 'FR');
console.error(`      ${greenhouse.length} offres, dont ${fr.length} en France.`);

console.error('2/3 — interrogation de l’API de production, entreprise par entreprise…');
const vues = new Map();      // clé de dédoublonnage → offre emploia
const parRequete = [];
const requetes = [
  ...BOARDS.map(b => ({ q: b.company, location: 'France' })),
  // Quelques requêtes génériques, pour ne pas mesurer QUE le cas nominatif.
  { q: 'développeur', location: 'Paris' }, { q: 'data engineer', location: 'Paris' },
  { q: 'product manager', location: 'Paris' }, { q: 'software engineer', location: 'France' },
  { q: 'account executive', location: 'Paris' }, { q: 'ingénieur', location: 'France' },
];
for (const [i, params] of requetes.entries()) {
  const r = await interroger(params);
  for (const j of r.jobs) if (j?.title && j?.company) vues.set(cle(j), j);
  parRequete.push({ ...params, rendues: r.jobs.length, demo: r.demo, erreur: r.erreur, enEchec: r.enEchec });
  process.stderr.write(`      ${i + 1}/${requetes.length} « ${params.q} » → ${r.jobs.length} offres${r.demo ? ' (DÉMO)' : ''}${r.erreur ? ' ' + r.erreur : ''}\n`);
  await pause(1100);                      // l’API limite à 60 requêtes/minute
}

console.error('3/3 — comparaison…');
const clesEmploia = new Set(vues.keys());
const deja = fr.filter(o => clesEmploia.has(cle(o)));
const nouvelles = fr.filter(o => !clesEmploia.has(cle(o)));

// Un recouvrement par ENTREPRISE, aussi : une offre peut différer par son
// titre tout en venant du même employeur. Si emploia connaît déjà l'entreprise
// mais pas l'offre, l'apport est plus faible que le compte d'offres le dit.
const entreprisesEmploia = new Set([...vues.values()].map(j => String(j.company).toLowerCase().replace(/[^a-z0-9]/g, '')));
const entreprisesGH = [...new Set(fr.map(o => o.company))];
const entreprisesConnues = entreprisesGH.filter(c => entreprisesEmploia.has(c.toLowerCase().replace(/[^a-z0-9]/g, '')));

const enDemo = parRequete.filter(r => r.demo).length;
const enErreur = parRequete.filter(r => r.erreur).length;

console.log('\n══ RECOUVREMENT GREENHOUSE × COLLECTEURS ACTUELS ═══════════════');
console.log(`Requêtes envoyées à l’API de production : ${requetes.length}`);
console.log(`  dont en repli démo (aucune source vivante) : ${enDemo}`);
console.log(`  dont en erreur : ${enErreur}`);
console.log(`Offres distinctes rendues par emploia : ${clesEmploia.size}`);
console.log('');
console.log(`Offres Greenhouse localisées en France : ${fr.length}`);
console.log(`  déjà rendues par les collecteurs actuels : ${deja.length} (${(100 * deja.length / fr.length).toFixed(1)}%)`);
console.log(`  ABSENTES des collecteurs actuels        : ${nouvelles.length} (${(100 * nouvelles.length / fr.length).toFixed(1)}%)`);
console.log('');
console.log(`Entreprises Greenhouse avec offres FR : ${entreprisesGH.length}`);
console.log(`  déjà présentes dans les résultats emploia : ${entreprisesConnues.length}${entreprisesConnues.length ? ' — ' + entreprisesConnues.join(', ') : ''}`);
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
    greenhouse: { total: greenhouse.length, fr: fr.length },
    emploia: { requetes: parRequete, offresDistinctes: clesEmploia.size, enDemo, enErreur },
    recouvrement: { deja: deja.length, nouvelles: nouvelles.length, entreprisesConnues },
    echantillonNouvelles: nouvelles.slice(0, 50).map(o => ({ company: o.company, title: o.title, location: o.location, type: o.type, url: o.url })),
  }, null, 2));
  console.log(`\nRelevé écrit dans ${out}`);
}
