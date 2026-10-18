#!/usr/bin/env node
/**
 * Assertions d'acceptance pour le fil d'Ariane du blog.
 *
 * Accepte les DEUX formes volontairement : le bloc BreadcrumbList autonome
 * pose par add-blog-breadcrumbs.mjs, et la propriete `breadcrumb` nichee dans
 * l'Article sur les 2 pages de mai 2026. Exiger une seule forme obligerait a
 * reecrire ces deux pages sans aucun gain.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SITE = 'https://emploia.eu';
const DIR = 'blog';
const EXPECTED_PAGES = 70;
const TOOLING = new Set([
  'scripts/seo/add-blog-breadcrumbs.mjs',
  'scripts/seo/verify-blog-breadcrumbs.mjs',
  'scripts/seo/blog-breadcrumb-labels.json',
  'check-blog-breadcrumbs.sh',
]);

let fails = 0;
const fail = (m) => { console.error(`  FAIL ${m}`); fails++; };
const ok = (m) => console.log(`  ok   ${m}`);
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

/** Cherche un BreadcrumbList, en bloc autonome ou en propriete nichee. */
function findCrumb(html) {
  const raws = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const raw of raws) {
    let node;
    try { node = JSON.parse(raw); } catch { return { error: 'JSON-LD illisible' }; }
    const candidates = node['@graph'] ? [node, ...node['@graph']] : [node];
    for (const c of candidates) {
      if (c['@type'] === 'BreadcrumbList') return { crumb: c, raw, standalone: true };
      if (c.breadcrumb && c.breadcrumb['@type'] === 'BreadcrumbList') return { crumb: c.breadcrumb, raw, standalone: false };
    }
  }
  return { error: 'aucun BreadcrumbList' };
}

function visibleSteps(html) {
  const m = html.match(/<div class="breadcrumb">([\s\S]*?)<\/div>/);
  if (!m) return null;
  return m[1].split('›').map((p) => unesc(p.replace(/<[^>]+>/g, '')).trim()).filter(Boolean);
}

// --- Assertion 1 : le compte.
const files = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();
if (files.length !== EXPECTED_PAGES) fail(`${files.length} pages blog, ${EXPECTED_PAGES} attendues`);
else ok(`perimetre: ${EXPECTED_PAGES} pages blog`);

let standalone = 0, nested = 0;
for (const name of files) {
  const file = `${DIR}/${name}`;
  const before = fails;
  const html = readFileSync(file, 'utf8');

  const found = findCrumb(html);
  if (found.error) { fail(`${file}: ${found.error}`); continue; }
  found.standalone ? standalone++ : nested++;

  // --- Assertion 2 : echappement defensif, sur les blocs que l'on genere.
  if (found.standalone && /[<>&]/.test(found.raw)) fail(`${file}: caractere < > ou & non echappe`);

  // --- Assertion 3 : trois etapes, positions 1..3.
  const items = found.crumb.itemListElement || [];
  if (items.length !== 3) { fail(`${file}: ${items.length} etapes, 3 attendues`); continue; }
  items.forEach((it, i) => {
    if (it['@type'] !== 'ListItem') fail(`${file}: etape ${i + 1} n'est pas un ListItem`);
    if (it.position !== i + 1) fail(`${file}: etape ${i + 1} porte position ${it.position}`);
    if (!it.name || !it.name.trim()) fail(`${file}: etape ${i + 1} sans nom`);
  });

  // --- Assertion 4 : le chemin designe les bonnes URLs.
  const canonical = (html.match(/<link[^>]+rel=(["'])canonical\1[^>]+href=(["'])([\s\S]*?)\2/i) || [])[3];
  if (!/^https:\/\/emploia\.eu\/?$/.test(items[0].item)) fail(`${file}: racine = ${items[0].item}`);
  if (items[1].item !== `${SITE}/blog`) fail(`${file}: parent = ${items[1].item}`);
  if (!canonical) fail(`${file}: canonical absent`);
  else if (items[2].item !== canonical) fail(`${file}: feuille ${items[2].item} ≠ canonical ${canonical}`);

  // --- Assertion 5 : le fil visible existe et porte les memes libelles.
  const vis = visibleSteps(html);
  if (!vis) { fail(`${file}: aucun fil visible`); continue; }
  const marked = items.map((it) => it.name);
  if (vis.join(' › ') !== marked.join(' › ')) {
    fail(`${file}: visible « ${vis.join(' › ')} » ≠ balise « ${marked.join(' › ')} »`);
  }

  if (fails === before) ok(`${file} — ${marked.join(' › ')}`);
}
ok(`formes: ${standalone} bloc(s) autonome(s), ${nested} propriete(s) nichee(s)`);

// --- Assertion 6 : tout libelle du fichier correspond a une page orpheline reelle.
const labels = JSON.parse(readFileSync('scripts/seo/blog-breadcrumb-labels.json', 'utf8')).labels;
const unused = Object.keys(labels).filter((s) => !files.includes(`${s}.html`));
if (unused.length) fail(`libelles sans page: ${unused.join(', ')}`);
else ok(`${Object.keys(labels).length} libelles valides, tous rattaches a une page`);

// --- Assertion 7 : aucune derive de perimetre.
try {
  const changed = execSync('git diff --name-only', { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const extra = changed.filter((f) => !f.startsWith(`${DIR}/`) && !TOOLING.has(f));
  if (extra.length) fail(`fichiers modifies hors perimetre: ${extra.join(', ')}`);
  else ok(`git diff: ${changed.length} fichier(s), tous dans le perimetre`);
} catch (e) { fail(`git diff indisponible: ${e.message}`); }

console.log(fails ? `\n${fails} assertion(s) en echec` : '\nToutes les assertions passent');
process.exit(fails ? 1 : 0);
