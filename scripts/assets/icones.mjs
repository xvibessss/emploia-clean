#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   EmploiA — rasterisation des icônes d'application

   Pourquoi ce script existe. `apple-touch-icon` désignait `favicon.svg`.
   iOS n'accepte pas le SVG pour cette balise : Safari exige du PNG. Un
   candidat qui ajoute EmploiA à son écran d'accueil — le geste naturel
   pour un outil qu'on rouvre chaque jour pendant une recherche — n'y
   trouvait donc pas le logo, mais une vignette générée par le système.

   `manifest.json` ne déclarait lui aussi que des SVG. Chrome accepte
   `sizes="any"` depuis quelques versions, mais les PNG 192 et 512 sont
   ce que tous les consommateurs de manifeste savent lire, Windows et
   Samsung Internet compris. Ils sont donc ajoutés À CÔTÉ du SVG, qui
   reste en tête : un vectoriel reste meilleur là où il est accepté.

   Même logique que `og-image.mjs` : le SVG est la source, les PNG en
   dérivent, et l'empreinte enregistrée dans `icones.hash` permet au
   garde [16] de détecter une dérive sans avoir besoin de Chrome en CI.

   Utilisation : npm run assets:icones
═══════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const SOURCE = 'favicon.svg';
export const HASH = 'icones.hash';
// 180 est la taille qu'iOS retient pour l'écran d'accueil ; 192 et 512
// sont les deux seuils des critères d'installation d'une application web.
export const CIBLES = [
  { fichier: 'apple-touch-icon.png', taille: 180 },
  { fichier: 'icon-192.png', taille: 192 },
  { fichier: 'icon-512.png', taille: 512 },
];

export const empreinteSource = () =>
  crypto.createHash('sha256').update(fs.readFileSync(SOURCE)).digest('hex').slice(0, 16);

const CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

function rasteriser(taille, destination) {
  const chrome = CHROMES.find((p) => fs.existsSync(p));
  if (!chrome) {
    console.error('✗ aucun Chrome trouvé. Cherché :\n  ' + CHROMES.join('\n  '));
    process.exit(1);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emploia-icone-'));
  fs.copyFileSync(SOURCE, path.join(tmp, 'source.svg'));
  // Fond opaque : iOS n'applique pas la transparence sur l'écran d'accueil, il
  // la remplit de noir. Le dégradé du logo porte déjà sa propre couleur, mais
  // les coins arrondis du SVG laissent passer le fond — d'où ce blanc.
  fs.writeFileSync(path.join(tmp, 'page.html'),
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:${taille}px;height:${taille}px;`
    + `overflow:hidden;background:#fff}img{display:block;width:${taille}px;height:${taille}px}</style>`
    + `<img src="source.svg" width="${taille}" height="${taille}">`);
  const sortie = path.join(tmp, 'out.png');
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${taille},${taille}`,
    `--screenshot=${sortie}`,
    'file://' + path.join(tmp, 'page.html'),
  ], { stdio: 'ignore' });
  fs.copyFileSync(sortie, destination);
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const { fichier, taille } of CIBLES) {
    rasteriser(taille, fichier);
    console.log(`  ${fichier} — ${taille}×${taille}, ${(fs.statSync(fichier).size / 1024).toFixed(0)} Ko`);
  }
  const h = empreinteSource();
  fs.writeFileSync(HASH, h + '\n');
  console.log(`✅ ${CIBLES.length} icônes régénérées depuis ${SOURCE} (${h})`);
}
