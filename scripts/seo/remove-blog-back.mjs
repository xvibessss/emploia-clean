#!/usr/bin/env node
/**
 * Retire le bouton « ← Retour au blog » des pages blog qui portent desormais
 * un fil d'Ariane. Le fil contient deja le lien vers /blog : le bouton fait
 * doublon, meme couleur et meme taille, empile juste au-dessus.
 *
 * Ne touche QUE les pages qui ont un fil. Retirer le bouton d'une page sans
 * fil la priverait de tout retour vers la section — le script refuse.
 *
 * Reporte aussi la marge basse du bouton (32px) sur le fil : sans elle, le
 * fil se collerait a la pastille de categorie. Retirer un element ne doit pas
 * deplacer le reste de la page.
 *
 * Usage : node scripts/seo/remove-blog-back.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const DIR = 'blog';
const EXPECTED = 11;
const SPACING = '32px';   // la marge que .blog-back fournissait

const dryRun = process.argv.includes('--dry-run');

const LINK = /[ \t]*<a href="\/blog" class="blog-back">[^<]*<\/a>\n/;
// Les deux variantes de formatage rencontrees : avec et sans espace avant {.
const RULES = /[ \t]*\.blog-back\s*\{[^}]*\}\n[ \t]*\.blog-back:hover\s*\{[^}]*\}\n/;
const CRUMB_RULE = /(\.breadcrumb\{padding:20px 0 0;)/;

let done = 0, skipped = 0, failed = 0;
const targets = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort()
  .filter((f) => readFileSync(`${DIR}/${f}`, 'utf8').includes('blog-back'));

// Idempotent : plus aucune page a nettoyer est un etat valide, pas une erreur.
// Un compte intermediaire l'est en revanche : il signale un nettoyage partiel.
if (targets.length === 0) {
  console.log('rien a faire — aucune page ne porte plus blog-back.');
  process.exit(0);
}
if (targets.length !== EXPECTED) {
  console.error(`FAIL perimetre — ${targets.length} pages avec blog-back, ${EXPECTED} ou 0 attendues`);
  process.exit(1);
}

for (const name of targets) {
  const file = `${DIR}/${name}`;
  const html = readFileSync(file, 'utf8');
  const errs = [];

  if (!html.includes('<div class="breadcrumb">')) errs.push('aucun fil d\'Ariane — retirer le bouton priverait la page de tout retour');
  if (!LINK.test(html)) errs.push('lien blog-back introuvable sous la forme attendue');
  if (!RULES.test(html)) errs.push('regles CSS .blog-back introuvables sous la forme attendue');
  if (!CRUMB_RULE.test(html)) errs.push('regle .breadcrumb introuvable');

  if (errs.length) { console.error(`FAIL ${file} — ${errs.join(' · ')}`); failed++; continue; }

  const out = html
    .replace(LINK, '')
    .replace(RULES, '')
    .replace(CRUMB_RULE, `$1margin-bottom:${SPACING};`);

  if (out.includes('blog-back')) { console.error(`FAIL ${file} — une reference a blog-back subsiste`); failed++; continue; }

  if (!dryRun) writeFileSync(file, out, 'utf8');
  console.log(`${dryRun ? 'dry ' : 'ok  '} ${file}`);
  done++;
}

console.log(`\n${done} nettoyee(s), ${skipped} ignoree(s), ${failed} echec(s)`);
process.exit(failed ? 1 : 0);
