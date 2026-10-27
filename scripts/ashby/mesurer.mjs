// Ce que le collecteur Ashby rapporte, et à quel prix. Mesure LOCALE : elle
// n'interroge pas emploia, seulement Ashby, et sert à décider la forme de
// l'intégration (en ligne ou par cron) avant de la coder.
//
// La question qui tranche : combien de temps prend la collecte ? `api/jobs.js`
// borne CHAQUE source à 10 s. Une collecte plus lente ne peut pas vivre dans
// le chemin de la requête, quel que soit son intérêt.
import { collecterAshby } from '../../api/_lib/ashby.js';
import { BOARDS, RELEVE } from '../../api/_lib/ashby-boards.js';

const debut = Date.now();
const journal = [];
const offres = await collecterAshby(BOARDS, { journal });
const duree = Date.now() - debut;

const fr = offres.filter(o => o.country === 'FR');
const parPays = new Map();
for (const o of offres) parPays.set(o.country, (parPays.get(o.country) || 0) + 1);

console.log(`\n══ COLLECTE ASHBY ══════════════════════════════════════════════`);
console.log(`Catalogue : ${BOARDS.length} boards (relevé du ${RELEVE})`);
console.log(`Durée     : ${(duree / 1000).toFixed(1)} s`);
console.log(`Offres    : ${offres.length}`);
console.log(`Boards en échec : ${journal.length}${journal.length ? ' — ' + journal.map(e => `${e.source}:${e.cause}`).join(', ') : ''}`);
console.log(`\nPays établi :`);
for (const [p, n] of [...parPays].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(p).padEnd(8)} ${String(n).padStart(5)}  ${(100 * n / offres.length).toFixed(1)}%`);
}

// CE QUE LE COLLECTEUR N'INVENTE PAS. Ces trois compteurs sont le contrôle de
// la doctrine du dépôt : un champ que la source ne porte pas doit sortir
// `null`, pas rempli d'une valeur plausible.
const sansContrat = fr.filter(o => !o.type).length;
const sansSalaire = fr.filter(o => o.salary === null).length;
const sansDate = fr.filter(o => !o.date).length;
const paysInconnu = offres.filter(o => o.country === null).length;
console.log(`\nCe que le collecteur N'INVENTE PAS, sur les ${fr.length} offres françaises :`);
console.log(`  salaire NON publié (refusé, equity, mensuel ou hors EUR) : ${sansSalaire} (${(100 * sansSalaire / fr.length).toFixed(1)}%)`);
console.log(`  salaire publié (consenti + Salary + EUR + annuel)         : ${fr.length - sansSalaire}`);
console.log(`  contrat non lisible → null                  : ${sansContrat} (${(100 * sansContrat / fr.length).toFixed(1)}%)`);
console.log(`  date de parution absente → null             : ${sansDate}`);
console.log(`  (toutes offres) pays non établi → null      : ${paysInconnu} (${(100 * paysInconnu / offres.length).toFixed(1)}%)`);

const parContrat = new Map();
for (const o of fr) parContrat.set(o.type, (parContrat.get(o.type) || 0) + 1);
console.log(`\nContrats lus sur les offres françaises :`);
for (const [c, n] of [...parContrat].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(c).padEnd(12)} ${String(n).padStart(4)}`);
}

const parBoard = new Map();
for (const o of fr) parBoard.set(o.company, (parBoard.get(o.company) || 0) + 1);
console.log(`\nOffres françaises par entreprise (constaté vs relevé du catalogue) :`);
for (const b of BOARDS) {
  const n = parBoard.get(b.company) || 0;
  const ecart = n - b.offresFR;
  console.log(`  ${b.company.padEnd(22)} ${String(n).padStart(4)} (relevé ${String(b.offresFR).padStart(3)}${ecart ? `, écart ${ecart > 0 ? '+' : ''}${ecart}` : ''})`);
}

const avecSalaire = fr.filter(o => o.salary);
if (avecSalaire.length) {
  console.log(`\nLes salaires publiés :`);
  for (const o of avecSalaire.slice(0, 10)) console.log(`  ${o.salary.padEnd(16)} ${o.company} — ${o.title.slice(0, 48)}`);
}
console.log(`\nDistanciel : ${fr.filter(o => o.remote).length} offres FR sur ${fr.length} — lu sur workplaceType, JAMAIS sur isRemote.`);

console.log(`\nÉchantillon :`);
for (const o of fr.slice(0, 10)) {
  console.log(`  · ${o.company} — ${o.title} (${o.location}) [${o.type ?? 'contrat inconnu'}] ${o.remote ? '· distanciel' : ''}`);
}
console.log(`\nVERDICT SUR LA FORME : ${duree > 10000
  ? `collecte à ${(duree / 1000).toFixed(1)} s > borne de 10 s par source dans api/jobs.js → cron + clé KV obligatoires.`
  : `collecte à ${(duree / 1000).toFixed(1)} s sous la borne de 10 s, mais cette durée croît avec le catalogue → cron quand même.`}\n`);
