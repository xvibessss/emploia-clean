#!/usr/bin/env node
/**
 * Pose le fil d'Ariane sur les pages blog : bloc BreadcrumbList autonome,
 * plus le fil visible la ou il manque.
 *
 * Pourquoi un bloc autonome et non la propriete `breadcrumb` de l'Article,
 * qui est le precedent maison de mai 2026. Parce que cette forme ne
 * generalise pas :
 *   - 6 pages nichent leur Article dans un @graph ; y inserer une propriete
 *     en texte serait de la chirurgie fragile sur du JSON imbrique ;
 *   - blog/comment-faire-un-cv n'a aucun Article, elle porte un HowTo, et
 *     schema.org definit `breadcrumb` sur WebPage, pas sur CreativeWork :
 *     l'y nicher serait hors domaine.
 * Le bloc autonome est valide partout, documente par Google, et c'est deja
 * la forme des 85 pages metier et ville. Les 2 pages de mai gardent la leur.
 *
 * Trois cas :
 *   deja balise  — laisse intact.
 *   fil visible  — le libelle est LU dans le <div class="breadcrumb"> ecrit
 *                  a la main, jamais redefini.
 *   orpheline    — libelle pris dans blog-breadcrumb-labels.json, valide par
 *                  Hugo. Absente du fichier => REFUSEE, pas devinee.
 *
 * Usage : node scripts/seo/add-blog-breadcrumbs.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const SITE = 'https://emploia.eu';
const DIR = 'blog';
const EXPECTED_PAGES = 70;
const LABELS = JSON.parse(readFileSync('scripts/seo/blog-breadcrumb-labels.json', 'utf8')).labels;

// La CSS .breadcrumb vit en ligne dans chaque page blog, pas dans shared.css.
// On la recopie sur les orphelines plutot que de la centraliser : toucher
// shared.css imposerait de reestampiller 177 fichiers.
const CSS = `
    .breadcrumb{padding:20px 0 0;font-size:13px;color:var(--t3)}
    .breadcrumb a{color:var(--t3);text-decoration:none}
    .breadcrumb a:hover{color:var(--t2)}`;

const dryRun = process.argv.includes('--dry-run');

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Google recommande d'echapper ces caracteres dans du JSON-LD inline. */
const safeJson = (o) => JSON.stringify(o, null, 2)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/** Separateur en texte brut, comme sur les 45 pages majoritaires. */
const visibleHtml = (label) =>
  `  <div class="breadcrumb"><a href="/">Accueil</a> › <a href="/blog">Blog</a> › ${escHtml(label)}</div>\n`;

const jsonLdBlock = (label, url) => {
  const steps = [['Accueil', SITE], ['Blog', `${SITE}/blog`], [label, url]];
  return `<script type="application/ld+json">\n${safeJson({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: steps.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  })}\n</script>\n`;
};

function labelFromVisible(html) {
  const m = html.match(/<div class="breadcrumb">([\s\S]*?)<\/div>/);
  if (!m) return '';
  const steps = m[1].split('›').map((p) => p.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  return steps.length === 3 ? steps[2] : '';
}

let done = 0, skipped = 0, failed = 0;
const files = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();
if (files.length !== EXPECTED_PAGES) {
  console.error(`FAIL perimetre — ${files.length} pages blog, ${EXPECTED_PAGES} attendues`);
  process.exit(1);
}

for (const name of files) {
  const file = `${DIR}/${name}`;
  const slug = name.replace(/\.html$/, '');
  const html = readFileSync(file, 'utf8');

  if (html.includes('BreadcrumbList')) { console.log(`skip ${file} — deja balise`); skipped++; continue; }

  const url = (html.match(/<link[^>]+rel=(["'])canonical\1[^>]+href=(["'])([\s\S]*?)\2/i) || [])[3];
  if (!url) { console.error(`FAIL ${file} — canonical absent`); failed++; continue; }
  if ((html.match(/<\/head>/gi) || []).length !== 1) { console.error(`FAIL ${file} — </head> absent ou multiple`); failed++; continue; }

  const hasVisible = html.includes('<div class="breadcrumb">');
  const label = hasVisible ? labelFromVisible(html) : LABELS[slug];
  const source = hasVisible ? 'lu dans le fil visible' : 'fichier de libelles';
  if (!label) {
    console.error(`FAIL ${file} — ${hasVisible ? 'fil visible illisible' : 'absente de blog-breadcrumb-labels.json'}`);
    failed++;
    continue;
  }

  let out = html.replace(/<\/head>/i, `${jsonLdBlock(label, url)}</head>`);

  if (!hasVisible) {
    const anchor = /(<div class="blog-layout[^"]*">\s*)/;
    if (!anchor.test(out)) { console.error(`FAIL ${file} — ancre blog-layout introuvable`); failed++; continue; }
    out = out.replace(anchor, (_, open) => `${open}${visibleHtml(label)}`);

    const styleEnd = out.indexOf('</style>', out.indexOf('.blog-back'));
    if (styleEnd === -1) { console.error(`FAIL ${file} — bloc <style> contenant .blog-back introuvable`); failed++; continue; }
    out = out.slice(0, styleEnd) + CSS + '\n  ' + out.slice(styleEnd);
  }

  if (!dryRun) writeFileSync(file, out, 'utf8');
  console.log(`${dryRun ? 'dry ' : 'ok  '} ${file} — « ${label} » (${source})`);
  done++;
}

console.log(`\n${done} traitee(s), ${skipped} ignoree(s), ${failed} echec(s)`);
process.exit(failed ? 1 : 0);
