// Relevé du catalogue avec le VRAI collecteur — pas la regex approximative de
// la sonde de découverte. C'est ce chiffre-là qui compte : il est produit par
// le code qui tournerait en production.
import { collecterGreenhouse } from '../../api/_lib/greenhouse.js';
import { BOARDS } from '../../api/_lib/greenhouse-boards.js';

const journal = [];
const t0 = Date.now();
const offres = await collecterGreenhouse(BOARDS, { journal });
const ms = Date.now() - t0;

const parPays = offres.reduce((acc, o) => ({ ...acc, [o.country ?? 'inconnu']: (acc[o.country ?? 'inconnu'] || 0) + 1 }), {});
const fr = offres.filter(o => o.country === 'FR');
const parBoard = {};
for (const o of fr) {
  const b = o.id.split('_')[1];
  parBoard[b] = (parBoard[b] || 0) + 1;
}

console.log(`Collecte de ${BOARDS.length} boards en ${(ms / 1000).toFixed(1)}s`);
console.log(`Offres totales : ${offres.length}`);
console.log(`Par pays : ${JSON.stringify(parPays)}`);
console.log(`\nOffres FRANCE par board :`);
for (const [b, n] of Object.entries(parBoard).sort((a, b) => b[1] - a[1])) {
  const e = BOARDS.find(x => x.board === b);
  console.log(`  ${String(n).padStart(4)}  ${e?.company ?? b}`);
}
const boardsSansFR = BOARDS.filter(e => !parBoard[e.board]);
if (boardsSansFR.length) console.log(`\nBoards sans offre FR ce jour : ${boardsSansFR.map(e => e.company).join(', ')}`);
if (journal.length) console.log(`\nÉchecs : ${JSON.stringify(journal)}`);

const avecContrat = fr.filter(o => o.type).length;
console.log(`\nCouverture du contrat sur les offres FR : ${avecContrat}/${fr.length} (${(100 * avecContrat / fr.length).toFixed(1)}%)`);
console.log(`Offres FR en distanciel : ${fr.filter(o => o.remote).length}`);

const fs = await import('node:fs');
const out = process.argv.find(a => a.startsWith('--out='))?.slice(6);
if (out) { fs.writeFileSync(out, JSON.stringify({ releve: new Date().toISOString(), offres }, null, 2)); console.log(`\nOffres écrites dans ${out}`); }
