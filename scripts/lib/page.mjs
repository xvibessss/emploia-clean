// Une page « telle qu'elle s'exécute » : son HTML, avec ses scripts de page
// remis en place.
//
// Depuis le retrait des scripts en ligne (CSP sans 'unsafe-inline'), le
// JavaScript d'une page vit dans js/pages/… et le HTML n'en porte plus que la
// référence. Les sondes qui lisaient « jobs.html » pour y vérifier un rendu,
// ou qui extrayaient un bloc <script> pour l'exécuter (le calculateur de
// /ecoles), ne trouveraient plus rien. Cette fonction leur rend la page
// complète : chaque <script src="/js/…"> est remplacé par le contenu du
// fichier qu'il désigne. Les scripts tiers et shared.js restent des
// références — les sondes ne les lisaient pas par ce chemin.
import fs from 'node:fs';

const RACINE = new URL('../../', import.meta.url);

export function pageAvecScripts(html) {
  return html.replace(
    /<script([^>]*)\bsrc="\/(js\/[^"?]+\.js)(?:\?v=[0-9a-f]+)?"([^>]*)><\/script>/g,
    (balise, avant, fichier) => {
      let source;
      try { source = fs.readFileSync(new URL(fichier, RACINE), 'utf8'); } catch { return balise; }
      return `<script>\n${source}</script>`;
    },
  );
}

/** Lit une page du dépôt (chemin relatif à la racine) avec ses scripts. */
export function lirePage(relatif) {
  return pageAvecScripts(fs.readFileSync(new URL(relatif, RACINE), 'utf8'));
}
