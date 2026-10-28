// Vérification board par board du catalogue Teamtailor.
//
// Même doctrine que `scripts/greenhouse/verifier-boards.mjs` et
// `scripts/lever/verifier-boards.mjs` : un slug est choisi par l'employeur, il
// se devine, et un slug deviné qui répond 404 est pire qu'un board absent — il
// inscrit au catalogue une entreprise qu'on ne collectera jamais, et le
// silence de sa collecte se lira comme « cette entreprise ne recrute pas ».
//
// CE QUE CETTE SONDE MESURE EN PLUS, et qui décide de la forme du collecteur.
// Teamtailor sert un JSON Feed dont chaque entrée porte un `_jobposting` en
// **schema.org JobPosting** — un vocabulaire STANDARD, là où Greenhouse n'avait
// qu'un `metadata` libre et Lever un `commitment` libre. La tentation est de
// supposer les champs présents parce que le standard les définit. Ils ne le
// sont pas : sur `payfit`, ni `employmentType`, ni `baseSalary`, ni
// `jobLocationType`. La sonde compte donc leur PRÉSENCE RÉELLE avant qu'une
// ligne de collecteur s'appuie dessus.
//
// Elle mesure aussi, parce que c'est le piège de la famille :
//   · `jobLocation` est un TABLEAU. Combien d'offres en portent plusieurs, et
//     combien d'offres NON françaises y nomment la France ? C'est
//     `allLocations` chez Lever et `offices` chez Greenhouse.
//   · Le pays ISO et la ville sont-ils d'accord ? Chez Lever le code
//     rattrapait 63 communes hors liste ; chez Greenhouse le champ déclaré
//     mentait.
//
//   node scripts/teamtailor/verifier-boards.mjs            # candidats par défaut
//   node scripts/teamtailor/verifier-boards.mjs payfit     # candidats explicites
import { CANDIDATS } from './candidats.mjs';

const CONCURRENCE = 6;
const TIMEOUT_MS = 20000;

const VILLE_FR = /\b(france|paris|lyon|marseille|toulouse|bordeaux|lille|nantes|nice|strasbourg|montpellier|rennes|grenoble|sophia|annecy|aix|roubaix|metz|nancy|dijon|angers|reims|tours|brest|caen|rouen|orleans|limoges|amiens|perpignan|avignon|pau|biarritz|bayonne|valence|besancon|poitiers|vannes|quimper|lannion|chambery|colmar|mulhouse|toulon|cannes|antibes|montreuil|nanterre|courbevoie|puteaux|levallois|issy|meudon|massy|cergy|evry|creteil|versailles|argenteuil|tourcoing|niort|calais|bourges|saint-etienne|le mans|le havre|clermont)\b/i;

const lieux = (j) => {
  const l = j?.jobLocation;
  return (Array.isArray(l) ? l : [l]).filter(Boolean);
};
const paysDe = (p) => String(p?.address?.addressCountry ?? '').trim().toUpperCase();
const villeDe = (p) => String(p?.address?.addressLocality ?? '').trim();

async function sonder(board) {
  const url = `https://${encodeURIComponent(board)}.teamtailor.com/jobs.json`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'emploia-prototype/1.0' } });
    } finally { clearTimeout(t); }
    if (!res.ok) return { board, statut: res.status, offres: null };
    let data;
    try { data = await res.json(); } catch { return { board, statut: 200, offres: null, note: 'reponse_illisible' }; }
    // Un JSON Feed porte ses entrées dans `items`. Un 200 sans ce tableau est
    // illisible, pas vide : les confondre ferait lire « cette entreprise ne
    // recrute pas » là où il faut lire « on n'a pas su lire ».
    if (!Array.isArray(data?.items)) return { board, statut: 200, offres: null, note: 'reponse_illisible' };
    const items = data.items;

    const jp = items.map(i => i?._jobposting).filter(Boolean);
    const parPays = items.filter(i => lieux(i?._jobposting).some(p => paysDe(p) === 'FR')).length;
    const parVille = items.filter(i => lieux(i?._jobposting).some(p => VILLE_FR.test(villeDe(p)))).length;

    // Les désaccords entre les deux signaux : c'est là que se cachent les pièges.
    const paysSansVille = items.filter(i => {
      const L = lieux(i?._jobposting);
      return L.some(p => paysDe(p) === 'FR') && L.some(p => villeDe(p)) && !L.some(p => VILLE_FR.test(villeDe(p)));
    }).map(i => lieux(i._jobposting).map(p => paysDe(p) + '/' + villeDe(p)).join('+'));
    const villeSansPays = items.filter(i => {
      const L = lieux(i?._jobposting);
      return L.some(p => VILLE_FR.test(villeDe(p))) && !L.some(p => paysDe(p) === 'FR');
    }).map(i => lieux(i._jobposting).map(p => (paysDe(p) || '∅') + '/' + villeDe(p)).join('+'));

    // Le piège de la famille : une offre à plusieurs lieux dont UN est français.
    const multiLieux = items.filter(i => lieux(i?._jobposting).length > 1).length;
    const multiAvecFR = items.filter(i => {
      const L = lieux(i?._jobposting);
      return L.length > 1 && L.some(p => paysDe(p) === 'FR') && L.some(p => paysDe(p) && paysDe(p) !== 'FR');
    }).map(i => lieux(i._jobposting).map(p => paysDe(p) + '/' + villeDe(p)).join(' + '));

    return {
      board, statut: 200, offres: items.length,
      offresFR: parPays, offresFRparVille: parVille,
      paysSansVille, villeSansPays, multiLieux, multiAvecFR,
      // La PRÉSENCE réelle des champs du standard, et non leur existence dans
      // la spécification.
      avecEmploymentType: jp.filter(j => j.employmentType).length,
      avecBaseSalary: jp.filter(j => j.baseSalary).length,
      avecJobLocationType: jp.filter(j => j.jobLocationType).length,
      avecValidThrough: jp.filter(j => j.validThrough).length,
      avecDatePosted: jp.filter(j => j.datePosted).length,
      sansLieu: items.filter(i => !lieux(i?._jobposting).length).length,
      employmentTypes: [...new Set(jp.map(j => JSON.stringify(j.employmentType)).filter(v => v !== 'undefined'))],
      locationTypes: [...new Set(jp.map(j => JSON.stringify(j.jobLocationType)).filter(v => v !== 'undefined'))],
      // Le domaine que l'employeur déclare : chez Payfit `careers.payfit.com`,
      // donc son PROPRE domaine et pas celui de l'ATS.
      domaines: [...new Set(jp.map(j => j.hiringOrganization?.sameAs).filter(Boolean))].slice(0, 2),
    };
  } catch (e) {
    return { board, statut: null, offres: null, note: e.name === 'AbortError' ? 'timeout' : 'erreur_reseau' };
  }
}

async function enLots(liste, n, fn) {
  const out = [];
  for (let i = 0; i < liste.length; i += n) {
    out.push(...await Promise.all(liste.slice(i, i + n).map(fn)));
    process.stderr.write(`  …${Math.min(i + n, liste.length)}/${liste.length}\n`);
  }
  return out;
}

const args = process.argv.slice(2);
const out = args.find(a => a.startsWith('--out='))?.slice(6) || null;
const libres = args.filter(a => !a.startsWith('--'));
const candidats = libres.length ? libres : CANDIDATS;
console.error(`Sondage de ${candidats.length} boards Teamtailor…`);
const res = await enLots(candidats, CONCURRENCE, sonder);

const vivants = res.filter(r => r.statut === 200 && r.offres !== null);
const avecOffres = vivants.filter(r => r.offres > 0);
const avecFR = vivants.filter(r => r.offresFR > 0);

console.log('\n── BOARDS QUI RÉPONDENT ─────────────────────────────');
for (const r of vivants.sort((a, b) => b.offresFR - a.offresFR || b.offres - a.offres)) {
  console.log(`  ${String(r.offres).padStart(4)} offres  ${String(r.offresFR).padStart(4)} FR   ${r.board}`);
}
console.log('\n── BOARDS QUI NE RÉPONDENT PAS ──────────────────────');
const morts = res.filter(r => r.statut !== 200 || r.offres === null);
const parCause = new Map();
for (const r of morts) { const k = r.note || 'HTTP ' + r.statut; parCause.set(k, (parCause.get(k) || 0) + 1); }
for (const [k, v] of [...parCause].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
const suspects = morts.filter(r => r.note === 'timeout' || r.note === 'erreur_reseau');
console.log(`  faux négatifs possibles (timeout / réseau) : ${suspects.length}${suspects.length ? ' — ' + suspects.map(r => r.board).join(', ') : ''}`);

console.log(`\nRésumé : ${vivants.length}/${candidats.length} répondent, ${avecOffres.length} avec au moins une offre, ${avecFR.length} avec au moins une offre en France.`);
const tot = vivants.reduce((s, r) => s + r.offres, 0);
const totFR = vivants.reduce((s, r) => s + r.offresFR, 0);
console.log(`Total offres : ${tot} — dont ${totFR} avec un pays ISO = FR (${tot ? (100 * totFR / tot).toFixed(1) : 0} %), ${vivants.reduce((s, r) => s + r.offresFRparVille, 0)} avec une ville française reconnue.`);

console.log('\n── CE QUE LE STANDARD PROMET vs CE QUI EST SERVI ────');
const jpTot = tot || 1;
for (const [label, cle] of [['employmentType', 'avecEmploymentType'], ['baseSalary', 'avecBaseSalary'], ['jobLocationType', 'avecJobLocationType'], ['validThrough', 'avecValidThrough'], ['datePosted', 'avecDatePosted']]) {
  const n = vivants.reduce((s, r) => s + (r[cle] || 0), 0);
  console.log(`  ${label.padEnd(18)} ${String(n).padStart(5)} / ${tot}  (${(100 * n / jpTot).toFixed(1)} %)`);
}
console.log(`  offres sans aucun lieu   ${String(vivants.reduce((s, r) => s + (r.sansLieu || 0), 0)).padStart(5)} / ${tot}`);
console.log('\n  valeurs employmentType :', JSON.stringify([...new Set(vivants.flatMap(r => r.employmentTypes))].sort()));
console.log('  valeurs jobLocationType:', JSON.stringify([...new Set(vivants.flatMap(r => r.locationTypes))].sort()));

console.log('\n── LE PIÈGE DES LIEUX MULTIPLES ─────────────────────');
console.log(`offres à plusieurs lieux : ${vivants.reduce((s, r) => s + (r.multiLieux || 0), 0)}`);
const mixtes = vivants.flatMap(r => r.multiAvecFR || []);
console.log(`dont mêlant la France et un autre pays : ${mixtes.length}`);
for (const m of mixtes.slice(0, 15)) console.log(`    ${m}`);

console.log('\n── LE PAYS ISO EST-IL DIGNE DE CONFIANCE ? ──────────');
const dp = vivants.flatMap(r => r.paysSansVille);
const dv = vivants.flatMap(r => r.villeSansPays);
console.log(`pays=FR mais aucune ville reconnue française : ${dp.length}`);
for (const d of [...new Set(dp)].slice(0, 20)) console.log(`    ${d}`);
console.log(`ville française reconnue mais aucun pays=FR : ${dv.length}`);
for (const d of [...new Set(dv)].slice(0, 20)) console.log(`    ${d}`);

console.log('\n── DOMAINE DÉCLARÉ PAR L’EMPLOYEUR (échantillon) ────');
for (const r of avecFR.slice(0, 12)) console.log(`  ${r.board.padEnd(22)} ${(r.domaines || []).join(', ')}`);

if (out) {
  const fs = await import('node:fs');
  fs.writeFileSync(out, JSON.stringify({ releve: new Date().toISOString(), resultats: res }, null, 2));
  console.log(`\nRelevé complet écrit dans ${out}`);
}
console.log('\nJSON:' + JSON.stringify(avecFR.map(r => ({ board: r.board, offres: r.offres, offresFR: r.offresFR }))));
