// Vérification board par board du catalogue Greenhouse.
//
// Un board id Greenhouse est un slug d'entreprise choisi par l'employeur, pas
// une donnée publiée : il se devine, et un slug deviné qui répond 404 est pire
// qu'un board absent — il inscrit dans le catalogue une entreprise qu'on ne
// collectera jamais, et le silence de sa collecte se lira comme « cette
// entreprise ne recrute pas ».
//
// D'où cette sonde : elle interroge l'endpoint public de chaque candidat et
// n'inscrit que ce qui RÉPOND, avec le nombre d'offres mesuré au moment du
// relevé. Même doctrine que `_lib/contrat.js` : ce qu'on constate, on
// l'enregistre ; ce qu'on ne constate pas vaut null, jamais une supposition.
//
//   node scripts/greenhouse/verifier-boards.mjs            # candidats par défaut
//   node scripts/greenhouse/verifier-boards.mjs acme corp  # candidats explicites
import { CANDIDATS } from './candidats.mjs';

const BASE = 'https://boards-api.greenhouse.io/v1/boards';
const CONCURRENCE = 6;

async function sonder(board) {
  const url = `${BASE}/${encodeURIComponent(board)}/jobs?content=true`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'emploia-prototype/1.0' } });
    clearTimeout(t);
    if (!res.ok) return { board, statut: res.status, offres: null };
    const data = await res.json();
    const jobs = Array.isArray(data?.jobs) ? data.jobs : null;
    if (!jobs) return { board, statut: 200, offres: null, note: 'reponse_illisible' };
    const lieux = jobs.map(j => j?.location?.name || '').filter(Boolean);
    const fr = lieux.filter(l => /france|paris|lyon|marseille|toulouse|bordeaux|lille|nantes|nice|strasbourg|montpellier|rennes|grenoble|sophia|annecy|aix|roubaix/i.test(l)).length;
    return { board, statut: 200, offres: jobs.length, offresFR: fr };
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
console.error(`Sondage de ${candidats.length} boards Greenhouse…`);
const res = await enLots(candidats, CONCURRENCE, sonder);

const vivants = res.filter(r => r.statut === 200 && r.offres !== null);
const avecOffres = vivants.filter(r => r.offres > 0);
const avecFR = vivants.filter(r => r.offresFR > 0);

console.log('\n── BOARDS QUI RÉPONDENT ─────────────────────────────');
for (const r of vivants.sort((a, b) => b.offresFR - a.offresFR || b.offres - a.offres)) {
  console.log(`  ${String(r.offres).padStart(4)} offres  ${String(r.offresFR).padStart(4)} FR   ${r.board}`);
}
console.log('\n── BOARDS QUI NE RÉPONDENT PAS ──────────────────────');
for (const r of res.filter(r => r.statut !== 200 || r.offres === null)) {
  console.log(`  ${r.note || 'HTTP ' + r.statut}   ${r.board}`);
}
console.log(`\nRésumé : ${vivants.length}/${candidats.length} répondent, ${avecOffres.length} avec au moins une offre, ${avecFR.length} avec au moins une offre en France.`);
console.log(`Total offres : ${vivants.reduce((s, r) => s + r.offres, 0)} — dont ${vivants.reduce((s, r) => s + r.offresFR, 0)} localisées en France.`);
if (out) {
  const fs = await import('node:fs');
  fs.writeFileSync(out, JSON.stringify({ releve: new Date().toISOString(), resultats: res }, null, 2));
  console.log(`\nRelevé complet écrit dans ${out}`);
}
console.log('\nJSON:' + JSON.stringify(vivants.filter(r => r.offresFR > 0).map(r => ({ board: r.board, offres: r.offres, offresFR: r.offresFR }))));
