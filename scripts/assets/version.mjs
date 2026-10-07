#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   EmploiA — empreinte de contenu sur shared.css et shared.js

   Pourquoi ce script existe. Les deux feuilles partagées étaient servies
   sans version dans leur URL, avec `max-age=604800, stale-while-revalidate=
   2592000`, pendant que le HTML qui en dépend repartait à chaque visite.
   Les deux ne se renouvelaient donc pas ensemble : un visiteur revenu dans
   les sept jours recevait le nouveau HTML avec l'ancienne feuille. Le 7
   octobre 2026, un titre ajouté à /profil et /dashboard s'est affiché en
   grand chez ces visiteurs-là, faute de la règle .sr-only qui le rendait
   discret. La panne était invisible depuis le dépôt : le HTML servi était
   bon, la feuille servie était bonne, c'est leur appariement qui ne l'était
   pas.

   Le remède : l'URL porte l'empreinte du contenu (`?v=<8 hex>`). Une feuille
   modifiée change d'URL, donc ne peut plus être servie depuis un cache ;
   une feuille inchangée garde la sienne, donc reste en cache. Le couple
   HTML/feuille devient cohérent par construction, et le cache peut alors
   passer à `immutable` sans risque — c'est le gain, pas un effet de bord.

   Le dépôt n'a pas d'étape de construction (`buildCommand: 'echo ok'`,
   `outputDirectory: '.'`) : ce qui est commité est ce qui est servi.
   L'empreinte est donc posée dans le HTML commité, et ci-guards vérifie
   qu'elle est à jour — sans quoi une modification de feuille sans nouveau
   stampage reproduirait exactement le bug d'origine, en silence.

     node scripts/assets/version.mjs           # pose les empreintes
     node scripts/assets/version.mjs --check   # signale les écarts, n'écrit rien
═══════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Huit hexadécimaux : assez court pour rester lisible dans une URL, assez
// long pour qu'une collision ne soit pas un sujet sur deux fichiers.
const HASH_LENGTH = 8;

// Les dossiers qui ne contiennent jamais de page servie.
const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', 'scripts']);

export const ASSETS = [
  { file: 'shared.css', attr: 'href' },
  { file: 'shared.js', attr: 'src' },
];

const hashOf = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, HASH_LENGTH);

export const currentHashes = () =>
  Object.fromEntries(ASSETS.map(({ file }) => [file, hashOf(file)]));

const htmlFiles = (dir = '.', out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
};

// Le motif n'attrape que les attributs : shared.css et shared.js sont aussi
// cités en toutes lettres dans des commentaires, qu'il ne faut pas réécrire.
// Le `\/?` normalise au passage les quelques références relatives — `src=
// "shared.js"` résout correctement depuis /profil mais donnerait un 404
// depuis /emploi/lyon, et rien ne garantit qu'une page ne déménage pas.
const referencePattern = ({ file, attr }) =>
  new RegExp(`${attr}="\\/?${file.replace('.', '\\.')}(\\?v=[0-9a-f]+)?"`, 'g');

export const stampHtml = (source, hashes) =>
  ASSETS.reduce(
    (text, asset) =>
      text.replace(referencePattern(asset), `${asset.attr}="/${asset.file}?v=${hashes[asset.file]}"`),
    source,
  );

// Le service worker garde sa propre copie des feuilles, sous une troisième
// couche de cache. Il reçoit donc les mêmes empreintes : son nom de cache en
// dérive, et son éviction à l'activation fait le reste toute seule.
const SW_FILE = 'sw.js';
const SW_PATTERN = /^const ASSETS = \{[^}]*\};$/m;

export const stampServiceWorker = (source, hashes) => {
  const entries = ASSETS.map(({ file }) => `'/${file}': '${hashes[file]}'`).join(', ');
  return source.replace(SW_PATTERN, `const ASSETS = { ${entries} };`);
};

/** Pose les empreintes partout. `write: false` se contente de les comparer. */
export function stampAll({ write = true } = {}) {
  const hashes = currentHashes();
  const stale = [];

  for (const file of [...htmlFiles(), SW_FILE]) {
    const before = fs.readFileSync(file, 'utf8');
    const after = file === SW_FILE ? stampServiceWorker(before, hashes) : stampHtml(before, hashes);
    if (after === before) continue;
    stale.push(file);
    if (write) fs.writeFileSync(file, after);
  }

  return { hashes, stale };
}

// ── Ligne de commande ──────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const { hashes, stale } = stampAll({ write: !check });
  const versions = ASSETS.map(({ file }) => `${file} → ${hashes[file]}`).join(' · ');

  if (!stale.length) {
    console.log(`✅ empreintes à jour — ${versions}`);
    process.exit(0);
  }
  if (check) {
    console.error(`❌ ${stale.length} fichier(s) portent une empreinte périmée — ${versions}`);
    for (const f of stale.slice(0, 20)) console.error(`   ${f}`);
    if (stale.length > 20) console.error(`   … et ${stale.length - 20} autre(s)`);
    console.error('\n   Corriger avec : npm run assets:version');
    process.exit(1);
  }
  console.log(`✅ ${stale.length} fichier(s) réestampillés — ${versions}`);
}
