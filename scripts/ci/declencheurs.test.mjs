// Garde des déclencheurs de workflow — le test de la détection elle-même.
//
// Le garde [20] de scripts/ci-guards.mjs refuse qu'un `pull_request` soit
// restreint par `branches:`, parce qu'un tel filtre porte sur la branche CIBLE
// et laisse toute PR empilée sans aucun des quatre jobs (la panne de la PR 83,
// mergée avec un garde tarifaire que le job `guards` n'a jamais exécuté).
//
// La détection lit du YAML sans parseur YAML, comme le garde [15]. Le risque
// n'est donc pas qu'elle rate un `branches:`, c'est qu'elle en voie un là où il
// n'y en a pas : `.github/workflows/ci.yml` EXPLIQUE en commentaire pourquoi il
// n'a plus de filtre, et les trois autres workflows expliquent en commentaire
// pourquoi ils n'ont pas de `pull_request` du tout. Un `grep branches:` les
// accuserait tous les quatre. Un garde qui naît rouge est désarmé la semaine
// suivante — d'où ce test, et d'où les cas « cité en commentaire ».
//
// Les extraits sont construits à la main : on éprouve des formes de YAML qu'on
// ne veut surtout pas commiter dans .github/workflows.
//
// Lancer localement : npm run test:declencheurs
import fs from 'node:fs';
import {
  analyserDeclencheurs, filtresDeBranches, aDeclencheurPullRequest,
} from './declencheurs.mjs';

const ROOT = new URL('../../', import.meta.url);
const lire = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');

let passed = 0, failed = 0;
const ok = (label, detail) => { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); };
const ko = (label, detail) => { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); };

// ── Les quatre cas du cahier des charges, plus les formes voisines ─────────
// `attendus` : les filtres que la détection doit relever, [] quand le workflow
// est légitime. La clé est nommée, pas seulement comptée : relever un
// `branches:` en l'attribuant au mauvais déclencheur serait un message faux.
const CAS = [
  {
    nom: '`pull_request` nu',
    attendus: [],
    pourquoi: 'le cas correct — toute PR, empilée ou non, déclenche les jobs',
    yaml: `name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  guards:
    runs-on: ubuntu-latest
`,
  },
  {
    nom: '`pull_request` filtré par `branches:`',
    attendus: [{ declencheur: 'pull_request', cle: 'branches' }],
    pourquoi: 'la panne elle-même : filtre sur la branche cible, PR empilées sans jobs',
    yaml: `name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  guards:
    runs-on: ubuntu-latest
`,
  },
  {
    nom: '`branches:` cité uniquement en commentaire',
    attendus: [],
    pourquoi: 'la forme exacte de ci.yml après la PR 86 — un grep naïf échouerait ici',
    yaml: `name: CI
on:
  push:
    branches: [main]

  # Pas de filtre \`branches:\` ici, et c'est tout le correctif. Avec
  # \`branches: [main]\`, une PR empilée ne déclenchait aucun job.
  pull_request:

jobs:
  guards:
    runs-on: ubuntu-latest
`,
  },
  {
    nom: '`push` filtré, `pull_request` nu',
    attendus: [],
    pourquoi: 'le filtre légitime : sans lui, chaque poussée de branche relancerait tout',
    yaml: `name: CI
on:
  pull_request:
  push:
    branches: [main]
`,
  },
  {
    nom: '`pull_request_target` filtré par `branches-ignore:`',
    attendus: [{ declencheur: 'pull_request_target', cle: 'branches-ignore' }],
    pourquoi: 'même trou par l\'autre déclencheur et l\'autre clé',
    yaml: `name: CI
on:
  pull_request_target:
    branches-ignore: [experimental]
`,
  },
  {
    nom: '`branches:` sous `types:`, plus profond',
    attendus: [{ declencheur: 'pull_request', cle: 'branches' }],
    pourquoi: 'l\'ordre des clés filles ne change rien à la restriction',
    yaml: `name: CI
on:
  pull_request:
    types: [opened, synchronize]
    branches:
      - main
      - 'release/**'
`,
  },
  {
    nom: '`on: [push, pull_request]` sur une ligne',
    attendus: [],
    pourquoi: 'la forme en ligne ne peut porter aucun filtre',
    yaml: `name: CI
on: [push, pull_request]
`,
  },
  {
    nom: '`on: {push: {branches: [main]}, pull_request: {}}` en ligne',
    attendus: [],
    pourquoi: 'le filtre en ligne appartient à `push` — ne pas en accuser le voisin',
    yaml: `name: CI
on: {push: {branches: [main]}, pull_request: {}}
`,
  },
  {
    nom: '`on: {pull_request: {branches: [main]}}` en ligne',
    attendus: [{ declencheur: 'pull_request', cle: 'branches' }],
    pourquoi: 'la même panne écrite en mapping de flux',
    yaml: `name: CI
on: {pull_request: {branches: [main]}}
`,
  },
  {
    nom: 'séquence `- pull_request`',
    attendus: [],
    pourquoi: 'une séquence de déclencheurs ne porte pas de filtre',
    yaml: `name: CI
on:
  - push
  - pull_request
`,
  },
  {
    nom: 'clé `on` citée, `pull_request` filtré',
    attendus: [{ declencheur: 'pull_request', cle: 'branches' }],
    pourquoi: '`"on":` est la parade des linters YAML 1.1 — elle ne doit pas masquer le filtre',
    yaml: `name: CI
"on":
  pull_request:
    branches: [main]
`,
  },
  {
    nom: '`branches:` d\'un job, hors du bloc `on:`',
    attendus: [],
    pourquoi: 'le bloc `on:` se ferme à la première clé de premier niveau',
    yaml: `name: CI
on:
  pull_request:

jobs:
  deploy:
    runs-on: ubuntu-latest
    with:
      branches: [main]
`,
  },
  {
    nom: 'aucun déclencheur `pull_request`',
    attendus: [],
    pourquoi: 'les audits planifiés (lighthouse, link-check, seo-regression)',
    yaml: `name: Lighthouse
# Aucun déclencheur \`pull_request\`, et ce n'est pas un oubli de filtre.
on:
  schedule:
    - cron: '0 8 * * 1'
  workflow_dispatch:
`,
  },
];

console.log('\n[A] extraits construits à la main');
for (const cas of CAS) {
  const trouves = filtresDeBranches(cas.yaml);
  const attendu = JSON.stringify(cas.attendus.map(({ declencheur, cle }) => ({ declencheur, cle })));
  const obtenu = JSON.stringify(trouves.map(({ declencheur, cle }) => ({ declencheur, cle })));
  if (attendu === obtenu) {
    ok(cas.nom, cas.attendus.length ? `relevé : ${obtenu}` : cas.pourquoi);
  } else {
    ko(cas.nom, `attendu ${attendu}, obtenu ${obtenu} — ${cas.pourquoi}`);
  }
}

// Un filtre relevé doit nommer sa ligne : le message du garde envoie le lecteur
// à l'endroit du YAML, pas au fichier entier.
console.log('\n[B] les constats nomment leur ligne');
const avecFiltre = filtresDeBranches(`name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
`);
if (avecFiltre.length === 1 && avecFiltre[0].ligne === 6) {
  ok('la ligne du `branches:` fautif est rapportée', 'ligne 6');
} else {
  ko('ligne du `branches:` fautif', `obtenu ${JSON.stringify(avecFiltre)} — attendu une seule entrée en ligne 6`);
}

// ── Les workflows réels du dépôt ───────────────────────────────────────────
// Le cahier des charges demande de le vérifier explicitement : le garde doit
// passer sur le ci.yml d'aujourd'hui, commentaires piégeux compris.
console.log('\n[C] workflows réels de .github/workflows');
const WF = '.github/workflows';
let workflows = [];
try {
  workflows = fs.readdirSync(new URL(WF, ROOT)).filter((n) => /\.ya?ml$/.test(n));
} catch (e) { ko('lecture de .github/workflows impossible', e.message); }

if (!workflows.length) ko('aucun workflow trouvé', 'motif à revoir — le garde [20] n\'aurait rien à contrôler');
for (const w of workflows) {
  const trouves = filtresDeBranches(lire(`${WF}/${w}`));
  if (!trouves.length) ok(`${WF}/${w}`, 'aucun pull_request restreint');
  else ko(`${WF}/${w}`, `${trouves.length} filtre(s) relevé(s) : ${JSON.stringify(trouves)}`);
}

// ci.yml doit non seulement n'être pas filtré, mais se déclencher.
try {
  const ci = lire(`${WF}/ci.yml`);
  if (aDeclencheurPullRequest(ci)) ok('ci.yml se déclenche sur pull_request', 'les quatre jobs tournent sur toute PR');
  else ko('ci.yml ne se déclenche pas sur pull_request', 'les quatre jobs ne tourneraient sur aucune PR');
  const { pullRequest } = analyserDeclencheurs(ci);
  if (pullRequest.length === 1) ok('ci.yml déclare un seul déclencheur de PR', `ligne ${pullRequest[0].ligne}`);
  else ko('ci.yml : nombre de déclencheurs de PR inattendu', JSON.stringify(pullRequest));
} catch (e) { ko('lecture de ci.yml impossible', e.message); }

if (failed) {
  console.error(`\n❌ garde des déclencheurs : ${failed} échec(s) — ` +
    'un `pull_request` restreint par `branches:` laisse les PR empilées sans aucun job, ' +
    'et un job qui ne se déclenche pas ne vire jamais au rouge\n');
  process.exit(1);
}
console.log(`\n✅ garde des déclencheurs : ${passed} vérifications OK\n`);
