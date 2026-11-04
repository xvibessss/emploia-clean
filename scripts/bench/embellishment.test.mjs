// Auto-test of the embellishment detector on the real 22/10 case (no API key needed).
import { findEmbellishments } from './embellishment-check.mjs';
import { EMBELLISH } from './fixtures.mjs';

let fail = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) fail++;
};

console.log("\n▶ Détecteur d'embellissement (cas réel du 22/10)");
const planted = findEmbellishments(EMBELLISH.profile, EMBELLISH.offer, EMBELLISH.planted);
check('sortie embellie : signalée', !planted.ok, `${planted.total} signalement(s)`);
check('niveau de langue gonflé (B2 → courant) détecté', planted.languages.some((f) => /anglais/i.test(f.value)));
check('qualificatif « B2B » pris dans l’offre détecté', planted.qualifiers.some((f) => /b2b/i.test(f.value)));
for (const f of [...planted.languages, ...planted.qualifiers]) console.log(`      • ${f.value} — ${f.snippet}`);

const clean = findEmbellishments(EMBELLISH.profile, EMBELLISH.offer, EMBELLISH.clean);
check('sortie honnête : aucun faux positif', clean.ok, clean.ok ? '' : JSON.stringify([...clean.languages, ...clean.qualifiers].map((f) => f.value)));

console.log(fail ? `\n✗ ${fail} échec(s)` : '\n✓ tout passe');
process.exit(fail ? 1 : 0);
