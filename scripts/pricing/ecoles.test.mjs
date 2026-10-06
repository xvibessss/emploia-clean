// Sonde de la grille tarifaire B2B.
//
// Les trois exemples de la grille Écoles sont des engagements commerciaux
// affichés à un acheteur institutionnel, pas des valeurs d'affichage : une
// dérive silencieuse se découvrirait au moment de facturer. Cette sonde
// exécute le calculateur **réellement servi** — le bloc <script> est extrait
// d'ecoles.html et évalué tel quel — plutôt qu'une copie de sa logique, qui
// resterait verte en divergeant de la page.
//
// Elle vérifie aussi que le JSON-LD et le tableau HTML portent les mêmes
// montants que le JS : trois sources d'un même prix sur une page, c'est trois
// occasions de se contredire devant un DPO.
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../ecoles.html', import.meta.url), 'utf8');

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// ── 1. Extraire et exécuter le calculateur tel qu'il est servi ──────────────
// Le dernier bloc <script> inline de la page est le calculateur. On le repère
// par sa signature plutôt que par sa position, pour qu'un futur script ajouté
// en fin de page ne fasse pas passer la sonde à côté de sa cible.
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const calcSrc = inlineScripts.find((s) => s.includes('__ecQuote'));
if (!calcSrc) {
  console.error("  ✗ calculateur introuvable dans ecoles.html (window.__ecQuote absent)");
  process.exit(1);
}

// DOM minimal : uniquement ce que le calculateur touche. Un id non prévu lève
// plutôt que de renvoyer null — un `$('ecTotal')` devenu silencieusement nul
// ferait passer la sonde sur un calculateur mort.
const KNOWN_IDS = [
  'ecSeats', 'ecRange', 'ecAdvisor', 'ecModeField',
  'ecSeatsLabel', 'ecAdvisorLabel',
  'ecTotal', 'ecTotalUnit', 'ecTierHint',
  'ecPerMonthK', 'ecPerMonth', 'ecPctK', 'ecPct', 'ecDaysK', 'ecDays', 'ecBadge',
];
const nodes = new Map();
function node(id) {
  return {
    id,
    value: id === 'ecSeats' || id === 'ecRange' ? '400' : (id === 'ecAdvisor' ? '42000' : ''),
    textContent: '', hidden: false, min: '1', max: '3000', step: '10',
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
  };
}
for (const id of KNOWN_IDS) nodes.set(id, node(id));

const document = {
  getElementById(id) {
    if (!nodes.has(id)) throw new Error(`le calculateur lit un id non prévu par la sonde : ${id}`);
    return nodes.get(id);
  },
  querySelectorAll() { return []; },
};
const sandbox = { document, window: {}, console };
sandbox.window.document = document;
vm.createContext(sandbox);
vm.runInContext(calcSrc, sandbox);

const quote = sandbox.window.__ecQuote;
check('le calculateur expose son devis', typeof quote === 'function');
if (typeof quote !== 'function') { console.error('\n❌ sonde tarifaire : calculateur non exécutable\n'); process.exit(1); }

// ── 2. Les montants de la grille ────────────────────────────────────────────
console.log('\n[A] Barème Écoles, CFA — tranches + forfait plateforme');
check('400 sièges → 11 300 €', quote('ecole', 'usage', 400) === 11300, `${quote('ecole', 'usage', 400)} €`);
check('800 sièges → 18 600 €', quote('ecole', 'usage', 800) === 18600, `${quote('ecole', 'usage', 800)} €`);
check('2 000 sièges → 34 000 €', quote('ecole', 'usage', 2000) === 34000, `${quote('ecole', 'usage', 2000)} €`);
check('un CFA est facturé comme une école', quote('cfa', 'usage', 400) === 11300, `${quote('cfa', 'usage', 400)} €`);

console.log('\n[B] Les tranches se cumulent, elles ne se substituent pas');
check('500 sièges = 500 × 22 €', quote('ecole', 'usage', 500) === 500 * 22 + 2500, `${quote('ecole', 'usage', 500)} €`);
check('501 sièges = 500 × 22 € + 1 × 17 €', quote('ecole', 'usage', 501) === 500 * 22 + 17 + 2500, `${quote('ecole', 'usage', 501)} €`);
check('1 000 sièges = 500 × 22 € + 500 × 17 €', quote('ecole', 'usage', 1000) === 500 * 22 + 500 * 17 + 2500, `${quote('ecole', 'usage', 1000)} €`);
check('1 001 sièges ajoutent un siège à 12 €', quote('ecole', 'usage', 1001) === 500 * 22 + 500 * 17 + 12 + 2500, `${quote('ecole', 'usage', 1001)} €`);

// C'est l'invariant qui justifie le barème par tranches plutôt qu'un taux
// unique par palier : ce dernier rendait 500 sièges 2 478 € moins chers que
// 499. Un acheteur qui le repère a intérêt à surdéclarer son effectif, et il
// perd confiance dans toute la grille. Cette boucle est la raison d'être du
// modèle — ne pas l'assouplir.
let monotone = true, witness = null;
for (let n = 1; n <= 4000; n++) {
  if (quote('ecole', 'usage', n + 1) < quote('ecole', 'usage', n)) { monotone = false; witness = n; break; }
}
check('le total ne décroît jamais quand l’effectif monte', monotone,
  witness ? `inversion à ${witness} sièges` : 'strictement croissant de 1 à 4 000 sièges');

// Le coût moyen par siège, lui, doit bien décroître : c'est la promesse
// commerciale de la dégressivité.
check('le coût moyen par siège décroît avec l’effectif',
  quote('ecole', 'usage', 2000) / 2000 < quote('ecole', 'usage', 800) / 800
  && quote('ecole', 'usage', 800) / 800 < quote('ecole', 'usage', 400) / 400);

console.log('\n[C] Plancher de facturation : 3 500 €');
check('1 siège est facturé au plancher', quote('ecole', 'usage', 1) === 3500, `${quote('ecole', 'usage', 1)} €`);
check('45 sièges sont facturés au plancher', quote('ecole', 'usage', 45) === 3500, `${quote('ecole', 'usage', 45)} €`);
// 46 × 22 + 2500 = 3512 : le premier effectif qui dépasse le plancher.
check('46 sièges dépassent le plancher', quote('ecole', 'usage', 46) === 3512, `${quote('ecole', 'usage', 46)} €`);
check('le plancher s’applique aussi à l’outplacement', quote('outpl', 'usage', 5) === 3500, `${quote('outpl', 'usage', 5)} €`);

console.log('\n[C bis] Le seuil des 40 000 € HT');
// La page affirme que le barème ne franchit le seuil qu'à partir de 2 500
// sièges. Cette affirmation est opposable par un acheteur : elle doit sortir
// du calcul, pas d'une estimation de rédaction.
let crossing = null;
for (let n = 1; n <= 8000; n++) {
  if (quote('ecole', 'usage', n) >= 40000) { crossing = n; break; }
}
check('le seuil de 40 000 € est franchi à 2 500 sièges', crossing === 2500, `${crossing} sièges`);
check('2 499 sièges restent sous le seuil', quote('ecole', 'usage', 2499) < 40000, `${quote('ecole', 'usage', 2499)} €`);

console.log('\n[D] Outplacement — deux modèles');
check('60 candidats à l’usage → 11 400 €', quote('outpl', 'usage', 60) === 11400, `${quote('outpl', 'usage', 60)} €`);
check('l’outplacement est linéaire, sans tranche', quote('outpl', 'usage', 1000) === 190000, `${quote('outpl', 'usage', 1000)} €`);
check('4 consultants en licence → 6 000 €', quote('outpl', 'licence', 4) === 6000, `${quote('outpl', 'licence', 4)} €`);
check('aucun forfait plateforme sur l’usage', quote('outpl', 'usage', 100) === 19000, `${quote('outpl', 'usage', 100)} €`);

// ── 3. La page ne se contredit pas elle-même ────────────────────────────────
console.log('\n[E] JSON-LD, tableau et JS portent les mêmes montants');
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const priceOf = (name) => {
  const o = (ld.offers || []).find((x) => x.name.includes(name));
  return o ? Number(o.price) : null;
};
check('JSON-LD : les 500 premiers → 22 €', priceOf('les 500 premiers') === 22, String(priceOf('les 500 premiers')));
check('JSON-LD : de 501 à 1 000 → 17 €', priceOf('de 501 à 1 000') === 17, String(priceOf('de 501 à 1 000')));
check('JSON-LD : au-delà de 1 000 → 12 €', priceOf('au-delà de 1 000') === 12, String(priceOf('au-delà de 1 000')));
check('JSON-LD : forfait plateforme → 2 500 €', priceOf('Forfait plateforme') === 2500, String(priceOf('Forfait plateforme')));
check('JSON-LD : outplacement à l’usage → 190 €', priceOf("à l'usage") === 190, String(priceOf("à l'usage")));
check('JSON-LD : licence consultant → 1 500 €', priceOf('licence consultant') === 1500, String(priceOf('licence consultant')));

for (const example of ['11 300 €', '18 600 €', '34 000 €', '11 400 €', '6 000 €']) {
  check(`le tableau affiche ${example}`, html.includes(example));
}

// ── 4. Les promesses retirées ne reviennent pas ─────────────────────────────
console.log('\n[F] Affirmations retirées');
check("aucun tarif « 9 € » ne subsiste", !/\b9\s?€/.test(html));
check("la taxe d'apprentissage n'est plus présentée comme mobilisable", !/taxe d'apprentissage/i.test(html));
check('le plancher de 900 € a disparu', !html.includes('900 €'));

if (failed) { console.error(`\n❌ sonde tarifaire : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde tarifaire : ${passed} vérifications OK\n`);
