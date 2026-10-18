#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   EmploiA — rasterisation de l'image de partage

   Pourquoi ce script existe. `opengraph.svg` était désigné directement
   comme `og:image` par 165 pages, et `og-image.svg` — un fichier qui
   n'existe pas — par 4 autres, dont la page d'accueil. Les deux cas
   produisent la même carte : aucune image. Facebook, LinkedIn, X,
   WhatsApp, Slack et iMessage n'acceptent pas `image/svg+xml`, et le
   second chemin répondait 404 en production.

   Le SVG reste la source : c'est lui qu'on modifie. Le PNG servi en est
   dérivé par ce script. Comme rien ne lie mécaniquement les deux, la
   dérive est le risque réel — c'est elle qui a laissé l'image annoncer
   « Gratuit / 9€ » longtemps après les passages à 19 € puis 24 €, et
   afficher `emploia.fr`, un domaine qui n'a jamais appartenu au projet.

   Le remède : ce script enregistre l'empreinte du SVG dont le PNG est
   issu, dans `og-image.hash`. Le garde [15] de ci-guards compare cette
   empreinte au SVG courant. Modifier le SVG sans relancer ce script
   fait donc échouer l'intégration continue, qui nomme la commande.

   La comparaison est un simple hash : la CI n'a pas besoin de Chrome.

   Utilisation : npm run assets:og
═══════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const SVG = 'opengraph.svg';
export const PNG = 'og-image.png';
export const HASH = 'og-image.hash';
export const LARGEUR = 1200;
export const HAUTEUR = 630;

export const empreinteSvg = () =>
  crypto.createHash('sha256').update(fs.readFileSync(SVG)).digest('hex').slice(0, 16);

const CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

function rasteriser() {
  const chrome = CHROMES.find((p) => fs.existsSync(p));
  if (!chrome) {
    console.error('✗ aucun Chrome trouvé. Cherché :\n  ' + CHROMES.join('\n  '));
    process.exit(1);
  }
  // Le SVG est enveloppé dans une page sans marge : un document SVG seul se
  // rend avec les marges par défaut du navigateur, et le PNG sortirait décalé.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emploia-og-'));
  fs.copyFileSync(SVG, path.join(tmp, 'source.svg'));
  fs.writeFileSync(path.join(tmp, 'page.html'),
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:${LARGEUR}px;height:${HAUTEUR}px;overflow:hidden}`
    + `img{display:block;width:${LARGEUR}px;height:${HAUTEUR}px}</style>`
    + `<img src="source.svg" width="${LARGEUR}" height="${HAUTEUR}">`);
  const sortie = path.join(tmp, 'out.png');
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${LARGEUR},${HAUTEUR}`,
    `--screenshot=${sortie}`,
    'file://' + path.join(tmp, 'page.html'),
  ], { stdio: 'ignore' });
  fs.copyFileSync(sortie, PNG);
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  rasteriser();
  const h = empreinteSvg();
  fs.writeFileSync(HASH, h + '\n');
  const ko = (fs.statSync(PNG).size / 1024).toFixed(0);
  console.log(`✅ ${PNG} régénéré — ${LARGEUR}×${HAUTEUR}, ${ko} Ko, depuis ${SVG} (${h})`);
}
