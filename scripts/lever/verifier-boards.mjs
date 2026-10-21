// Vérification board par board du catalogue Lever.
//
// Même doctrine que `scripts/greenhouse/verifier-boards.mjs`, et pour la même
// raison : un slug Lever est choisi par l'employeur, pas publié. Il se devine,
// et un slug deviné qui répond 404 est pire qu'un board absent — il inscrit au
// catalogue une entreprise qu'on ne collectera jamais, et le silence de sa
// collecte se lira comme « cette entreprise ne recrute pas ».
//
// CE QUE CETTE SONDE MESURE EN PLUS. Lever publie un champ `country` en code
// ISO-2, là où Greenhouse n'avait qu'une chaîne de lieu libre. C'est tentant,
// et c'est exactement le champ qui a piégé le collecteur Greenhouse : son
// « Job Posting Country = France » nommait l'entité qui PUBLIE, pas le lieu de
// travail, et envoyait un poste berlinois à un candidat cherchant à Paris.
// La sonde compte donc les deux signaux SÉPARÉMENT — `country === 'FR'` d'un
// côté, une ville française reconnue dans `categories.location` de l'autre —
// et rapporte leurs désaccords. On ne fera confiance au champ qu'après l'avoir
// vu tenir, et seulement dans la mesure où il tient.
//
//   node scripts/lever/verifier-boards.mjs            # candidats par défaut
//   node scripts/lever/verifier-boards.mjs qonto alan # candidats explicites
import { CANDIDATS } from './candidats.mjs';

const BASE = 'https://api.lever.co/v0/postings';
const CONCURRENCE = 6;
const TIMEOUT_MS = 25000;

// Les mêmes villes que le collecteur Greenhouse reconnaît, en motif, pour que
// les deux relevés soient comparables.
const VILLE_FR = /\b(france|paris|lyon|marseille|toulouse|bordeaux|lille|nantes|nice|strasbourg|montpellier|rennes|grenoble|sophia|annecy|aix|roubaix|metz|nancy|dijon|angers|reims|tours|brest|caen|rouen|orleans|limoges|amiens|perpignan|avignon|pau|biarritz|bayonne|valence|besancon|poitiers|vannes|quimper|lannion|chambery|colmar|mulhouse|toulon|cannes|antibes|montreuil|nanterre|courbevoie|puteaux|levallois|issy|meudon|massy|cergy|evry|creteil|versailles|argenteuil|tourcoing|niort|calais|bourges|saint-etienne|le mans|le havre|clermont)\b/i;

async function sonder(board) {
  const url = `${BASE}/${encodeURIComponent(board)}?mode=json`;
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
    // Lever rend un TABLEAU à la racine, pas un objet à clé `jobs`. Un 200 qui
    // n'est pas un tableau est illisible, pas vide : les confondre ferait lire
    // « cette entreprise ne recrute pas » là où il faut lire « on n'a pas su
    // lire ».
    if (!Array.isArray(data)) return { board, statut: 200, offres: null, note: 'reponse_illisible' };

    const parPays = data.filter(p => String(p?.country ?? '').toUpperCase() === 'FR').length;
    const parLieu = data.filter(p => VILLE_FR.test(String(p?.categories?.location ?? ''))).length;
    // Les désaccords entre les deux signaux : c'est là que se cache le piège.
    const paysSansLieu = data.filter(p =>
      String(p?.country ?? '').toUpperCase() === 'FR' &&
      String(p?.categories?.location ?? '').trim() &&
      !VILLE_FR.test(String(p.categories.location))).map(p => `${p.country}/${p.categories.location}`);
    const lieuSansPays = data.filter(p =>
      VILLE_FR.test(String(p?.categories?.location ?? '')) &&
      String(p?.country ?? '').toUpperCase() !== 'FR').map(p => `${p.country || '∅'}/${p.categories.location}`);
    // `allLocations` qui liste la France sur un poste NON français : le même
    // piège que `offices` chez Greenhouse.
    const franceEnSecondaire = data.filter(p =>
      String(p?.country ?? '').toUpperCase() !== 'FR' &&
      (p?.categories?.allLocations || []).some(l => VILLE_FR.test(String(l)))).length;

    return {
      board, statut: 200, offres: data.length,
      offresFR: parPays, offresFRparLieu: parLieu,
      paysSansLieu, lieuSansPays, franceEnSecondaire,
      commitments: [...new Set(data.map(p => p?.categories?.commitment).filter(Boolean))],
      workplaces: [...new Set(data.map(p => p?.workplaceType).filter(Boolean))],
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
console.error(`Sondage de ${candidats.length} boards Lever…`);
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
console.log(`Total offres : ${vivants.reduce((s, r) => s + r.offres, 0)} — dont ${vivants.reduce((s, r) => s + r.offresFR, 0)} avec country=FR, ${vivants.reduce((s, r) => s + r.offresFRparLieu, 0)} avec un lieu français reconnu.`);

console.log('\n── LE CHAMP `country` EST-IL DIGNE DE CONFIANCE ? ────');
const descPays = vivants.flatMap(r => r.paysSansLieu);
const descLieu = vivants.flatMap(r => r.lieuSansPays);
console.log(`country=FR mais lieu non reconnu français : ${descPays.length}`);
for (const d of [...new Set(descPays)].slice(0, 25)) console.log(`    ${d}`);
console.log(`lieu français reconnu mais country≠FR   : ${descLieu.length}`);
for (const d of [...new Set(descLieu)].slice(0, 25)) console.log(`    ${d}`);
console.log(`offres NON françaises listant la France dans allLocations : ${vivants.reduce((s, r) => s + r.franceEnSecondaire, 0)}`);

console.log('\n── VOCABULAIRE OBSERVÉ ──────────────────────────────');
console.log('commitment   :', JSON.stringify([...new Set(vivants.flatMap(r => r.commitments))].sort()));
console.log('workplaceType:', JSON.stringify([...new Set(vivants.flatMap(r => r.workplaces))].sort()));

if (out) {
  const fs = await import('node:fs');
  fs.writeFileSync(out, JSON.stringify({ releve: new Date().toISOString(), resultats: res }, null, 2));
  console.log(`\nRelevé complet écrit dans ${out}`);
}
console.log('\nJSON:' + JSON.stringify(vivants.filter(r => r.offresFR > 0).map(r => ({ board: r.board, offres: r.offres, offresFR: r.offresFR }))));
