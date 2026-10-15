#!/usr/bin/env node
/**
 * Ajoute un fil d'Ariane — visible ET balise en BreadcrumbList — sur les
 * pages des deux sections hierarchiques du site : metier/ (37) et emploi/ (48).
 *
 * Pourquoi visible ET balise. Les regles de Google sur les donnees
 * structurees demandent de ne pas baliser ce que le visiteur ne voit pas.
 * Un BreadcrumbList pose sur une page sans fil d'Ariane visible est une zone
 * grise ; on pose donc les deux, et le libelle affiche est EXACTEMENT celui
 * du balisage, puisqu'ils viennent de la meme variable.
 *
 * Idempotent : une page qui porte deja un fil est laissee intacte.
 *
 * Aucune valeur inventee. Le libelle de la page vient de son <title>, via
 * une liste de motifs ordonnee ; une page dont le titre ne correspond a aucun
 * motif est REFUSEE, jamais devinee. Les libelles parents viennent du <h1>
 * reel de /metier et /emploi. Seul « Accueil » est conventionnel : le <h1>
 * de la racine est un slogan marketing, inutilisable comme etape de chemin.
 *
 * Usage : node scripts/seo/add-breadcrumbs.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const SITE = 'https://emploia.eu';

// Perimetre : derive des repertoires, mais le compte attendu est fige. Lister
// 85 chemins en dur serait illisible ; sans le compte, le perimetre pourrait
// grossir en silence au prochain fichier depose. L'assertion garde les dents.
const SECTIONS = [
  { dir: 'metier', expected: 37, parentPath: '/metier', parentLabel: 'Emploi par métier' },
  { dir: 'emploi', expected: 48, parentPath: '/emploi', parentLabel: 'Emploi par ville' },
];

const ROOT_LABEL = 'Accueil';

// Ordonnee : le premier motif qui correspond gagne. Les trois couvrent les 85
// pages (verifie), et un titre hors motif fait echouer le fichier.
const LABEL_PATTERNS = [
  /^Emploi à (.+?) — /,
  /^Offres d'emploi (.+?) — /,
  /^Emploi (.+?) en France\b/,
];

const dryRun = process.argv.includes('--dry-run');

/** Google recommande d'echapper ces caracteres dans du JSON-LD inline :
 *  une valeur contenant </script> casserait sinon la page entiere. */
function safeJson(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** « Remote & Télétravail » doit sortir en « Remote &amp; Télétravail ». */
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

function labelFrom(title) {
  for (const rx of LABEL_PATTERNS) {
    const m = title.match(rx);
    if (m) return m[1].trim();
  }
  return '';
}

function readCanonical(html) {
  const m = html.match(/<link[^>]+rel=(["'])canonical\1[^>]+href=(["'])([\s\S]*?)\2/i);
  return m ? m[3].trim() : '';
}

/** Les 3 etapes du chemin, source unique du visible et du balisage. */
function trailFor(section, label, url) {
  return [
    { name: ROOT_LABEL, url: `${SITE}/` },
    { name: section.parentLabel, url: SITE + section.parentPath },
    { name: label, url },
  ];
}

function visibleHtml(trail) {
  const items = trail.map((step, i) => {
    const isLast = i === trail.length - 1;
    const inner = isLast
      ? `<span aria-current="page">${escapeHtml(step.name)}</span>`
      : `<a href="${step.url.replace(SITE, '') || '/'}">${escapeHtml(step.name)}</a>`;
    return `<li>${inner}</li>`;
  }).join('');
  return `  <nav class="emp-breadcrumb" aria-label="Fil d'Ariane"><ol>${items}</ol></nav>\n`;
}

function jsonLdBlock(trail) {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      item: step.url,
    })),
  };
  return `<script type="application/ld+json">\n${safeJson(node)}\n</script>\n`;
}

const ANCHOR = /(<div class="seo-layout[^"]*">\s*)(<div class="seo-hero)/;

function filesOf(section) {
  const found = readdirSync(section.dir)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => `${section.dir}/${f}`);
  if (found.length !== section.expected) {
    throw new Error(`${section.dir}/ : ${found.length} pages, ${section.expected} attendues — perimetre non valide`);
  }
  return found;
}

let added = 0, skipped = 0, failed = 0;

for (const section of SECTIONS) {
  for (const file of filesOf(section)) {
    const html = readFileSync(file, 'utf8');

    if (html.includes('emp-breadcrumb') || html.includes('BreadcrumbList')) {
      console.log(`skip ${file} — fil deja present`);
      skipped++;
      continue;
    }

    const errs = [];
    const title = readTitle(html);
    const label = labelFrom(title);
    const url = readCanonical(html);
    if (!label) errs.push(`titre hors motif : « ${title} »`);
    if (!url) errs.push('canonical absent');
    if (!ANCHOR.test(html)) errs.push('ancre seo-layout → seo-hero introuvable');
    if ((html.match(/<\/head>/gi) || []).length !== 1) errs.push('</head> absent ou multiple');

    if (errs.length) {
      console.error(`FAIL ${file} — ${errs.join(' · ')}`);
      failed++;
      continue;
    }

    const trail = trailFor(section, label, url);
    const out = html
      .replace(/<\/head>/i, `${jsonLdBlock(trail)}</head>`)
      .replace(ANCHOR, (_, open, hero) => `${open}${visibleHtml(trail)}${hero}`);

    if (!dryRun) writeFileSync(file, out, 'utf8');
    console.log(`${dryRun ? 'dry ' : 'ok  '} ${file} — ${trail.map((s) => s.name).join(' › ')}`);
    added++;
  }
}

console.log(`\n${added} ajout(s), ${skipped} ignore(s), ${failed} echec(s)`);
process.exit(failed ? 1 : 0);
