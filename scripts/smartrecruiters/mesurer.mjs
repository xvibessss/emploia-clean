// Ce que le collecteur SmartRecruiters rapporte, et à quel prix. Mesure LOCALE :
// elle n'interroge pas emploia, seulement SmartRecruiters, et sert à décider
// la forme de l'intégration avant de la coder.
//
// Deux questions tranchent ici, et la seconde est propre à cet ATS :
//   1. Combien de temps prend la collecte ? `api/jobs.js` borne chaque source
//      à 10 s : au-delà, cron + clé KV.
//   2. Combien PÈSE la clé ? Le catalogue rend ~3 400 offres françaises, cinq
//      fois la borne `MAX_OFFRES` des trois ATS précédents. Ce qui compte pour
//      Upstash est la taille de l'enregistrement, pas le nombre d'offres.
import { collecterSmartRecruiters, PAR_ENTREPRISE } from '../../api/_lib/smartrecruiters.js';
import { BOARDS, RELEVE } from '../../api/_lib/smartrecruiters-boards.js';

const sansBorne = process.argv.includes('--sans-borne');
const debut = Date.now();
const journal = [];
const offres = await collecterSmartRecruiters(BOARDS, { journal, ...(sansBorne ? { parEntreprise: Infinity } : {}) });
const duree = Date.now() - debut;

const fr = offres.filter(o => o.country === 'FR');
const octets = Buffer.byteLength(JSON.stringify(fr));

console.log(`\n══ COLLECTE SMARTRECRUITERS ═════════════════════════════════════════`);
console.log(`Catalogue : ${BOARDS.length} entreprises (relevé du ${RELEVE})`);
console.log(`Borne     : ${sansBorne ? 'aucune' : `${PAR_ENTREPRISE} offres par entreprise`}`);
console.log(`Durée     : ${(duree / 1000).toFixed(1)} s`);
console.log(`Offres FR : ${fr.length}`);
console.log(`Poids     : ${(octets / 1024).toFixed(0)} Ko, soit ${fr.length ? Math.round(octets / fr.length) : 0} octets par offre`);
console.log(`Échecs    : ${journal.length}${journal.length ? ' — ' + journal.map(e => `${e.source}:${e.cause}`).join(', ') : ''}`);

const sansContrat = fr.filter(o => !o.type).length;
console.log(`\nCe que le collecteur N'INVENTE PAS, sur les ${fr.length} offres françaises :`);
console.log(`  contrat non écrit dans le titre → null : ${sansContrat} (${(100 * sansContrat / (fr.length || 1)).toFixed(1)} %)`);
console.log(`  salaire → null                         : ${fr.length} (la source n'en publie pas)`);
console.log(`  description → vide                     : ${fr.length} (absente de la liste)`);

const parContrat = new Map();
for (const o of fr) parContrat.set(o.type, (parContrat.get(o.type) || 0) + 1);
console.log(`\nContrats lus :`);
for (const [c, n] of [...parContrat].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padEnd(12)} ${String(n).padStart(5)}`);

const parBoard = new Map();
for (const o of fr) parBoard.set(o.company, (parBoard.get(o.company) || 0) + 1);
console.log(`\nOffres françaises par entreprise (constaté vs relevé) :`);
for (const b of BOARDS) {
  const n = parBoard.get(b.company) || 0;
  console.log(`  ${b.company.padEnd(22)} ${String(n).padStart(4)} (relevé ${String(b.offresFR).padStart(4)})`);
}

// Les métiers que les trois ATS précédents ne servaient pas : c'est le
// critère de ce relevé.
const METIERS = ['serveur', 'chef de rang', 'cuisin', 'chef de partie', 'receptionn', 'barman', 'vendeu', 'conseiller de vente', 'preparat', 'magasinier', 'caissier', 'femme de chambre', 'valet', 'technicien', 'maintenance', 'livreur'];
const n = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
console.log(`\nMétiers de terrain servis :`);
for (const m of METIERS) {
  const k = fr.filter(o => n(o.title).includes(m)).length;
  if (k) console.log(`  ${m.padEnd(20)} ${String(k).padStart(4)}`);
}

console.log(`\nÉchantillon :`);
for (const o of fr.filter((_, i) => i % Math.max(1, Math.floor(fr.length / 12)) === 0).slice(0, 12)) {
  console.log(`  · ${o.company} — ${o.title} (${o.location}) [${o.type ?? 'contrat inconnu'}]${o.remote ? ' · distanciel' : ''}`);
}
console.log(`\nVERDICT SUR LA FORME : collecte à ${(duree / 1000).toFixed(1)} s ${duree > 10000 ? '> 10 s → cron + clé KV obligatoires.' : '< 10 s, mais elle croît avec le catalogue → cron quand même.'}\n`);
