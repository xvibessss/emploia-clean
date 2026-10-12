#!/usr/bin/env node
/**
 * Ajoute le bloc JSON-LD manquant sur les 10 pages identifiees par la spec
 * .bones/evidence/stage3-spec.md (pipeline bones "jsonld-metiers").
 *
 * Idempotent : une page qui contient deja un bloc application/ld+json est
 * laissee intacte. Relancer le script ne duplique rien.
 *
 * Aucune valeur inventee : name derive du <title>, description et url sont
 * recopiees mot pour mot depuis la meta description et le canonical de la
 * page. Si l'une des trois manque, le fichier est refuse plutot que balise
 * partiellement.
 *
 * Usage : node scripts/seo/add-jsonld.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from 'node:fs';

// Perimetre figé : la liste est codee en dur, pas decouverte, pour qu'elle
// reste exactement celle que Hugo a signee au stage 3.
const TARGETS = [
  ['metier/btp.html',           'CollectionPage'],
  ['metier/communication.html', 'CollectionPage'],
  ['metier/ingenieur.html',     'CollectionPage'],
  ['metier/logistique.html',    'CollectionPage'],
  ['metier/sante.html',         'CollectionPage'],
  ['emploi.html',               'CollectionPage'],
  ['metier.html',               'CollectionPage'],
  ['cv-builder.html',           'WebApplication'],
  ['contact.html',              'ContactPage'],
  ['sous-traitants.html',       'WebPage'],
];

const SITE = { '@type': 'WebSite', name: 'Emploia', url: 'https://emploia.eu' };
const BRAND_SUFFIX = /\s*[—·|-]\s*Emploi[Aa]\s*$/;

const dryRun = process.argv.includes('--dry-run');

/** Extrait un attribut en respectant le delimiteur d'ouverture.
 *  Le piege : content="Offres d'emploi ..." tronque a l'apostrophe si on
 *  accepte n'importe quelle quote de fermeture. */
function attr(html, re) {
  const m = html.match(re);
  return m ? m[m.length - 1].replace(/\s+/g, ' ').trim() : '';
}

function readMeta(html) {
  const title = attr(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    attr(html, /<meta[^>]+name=(["'])description\1[^>]+content=(["'])([\s\S]*?)\2/i) ||
    attr(html, /<meta[^>]+content=(["'])([\s\S]*?)\1[^>]+name=(["'])description\3/i);
  const url = attr(html, /<link[^>]+rel=(["'])canonical\1[^>]+href=(["'])([\s\S]*?)\2/i);
  return { title, description, url };
}

/** Google recommande d'echapper ces caracteres dans du JSON-LD inline :
 *  une valeur contenant </script> casserait sinon la page entiere. */
function safeJson(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function blockFor(type, meta) {
  const node = {
    '@context': 'https://schema.org',
    '@type': type,
    name: meta.title.replace(BRAND_SUFFIX, '').trim(),
    description: meta.description,
    url: meta.url,
  };
  // Coherence avec le SoftwareApplication d'index.html. Pas d'`offers` :
  // inscrire un prix non verifie sur un produit payant serait du balisage
  // mensonger (decision du stage 4).
  if (type === 'WebApplication') {
    node.applicationCategory = 'BusinessApplication';
    node.operatingSystem = 'Web';
  }
  node.isPartOf = SITE;
  return `<script type="application/ld+json">\n${safeJson(node)}\n</script>\n`;
}

let added = 0, skipped = 0, failed = 0;

for (const [file, type] of TARGETS) {
  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch {
    console.error(`FAIL ${file} — illisible`);
    failed++;
    continue;
  }

  if (/application\/ld\+json/i.test(html)) {
    console.log(`skip ${file} — bloc deja present`);
    skipped++;
    continue;
  }

  const closes = (html.match(/<\/head>/gi) || []).length;
  if (closes !== 1) {
    console.error(`FAIL ${file} — ${closes} occurrence(s) de </head>, 1 attendue`);
    failed++;
    continue;
  }

  const meta = readMeta(html);
  const missing = ['title', 'description', 'url'].filter((k) => !meta[k]);
  if (missing.length) {
    console.error(`FAIL ${file} — manque ${missing.join(', ')}`);
    failed++;
    continue;
  }

  const out = html.replace(/<\/head>/i, `${blockFor(type, meta)}</head>`);
  if (!dryRun) writeFileSync(file, out, 'utf8');
  console.log(`${dryRun ? 'dry ' : 'ok  '} ${file} — ${type}`);
  added++;
}

console.log(`\n${added} ajout(s), ${skipped} ignore(s), ${failed} echec(s)`);
process.exit(failed ? 1 : 0);
