#!/usr/bin/env node
/**
 * Assertions d'acceptance pour le fil d'Ariane (metier/ + emploi/).
 * Exit 0 seulement si TOUTES passent.
 *
 * La liste des cibles est redupliquee depuis add-breadcrumbs.mjs, et c'est
 * VOLONTAIRE : un verificateur qui importerait son perimetre depuis le script
 * verifie validerait un perimetre faux sans broncher.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SITE = 'https://emploia.eu';
const SECTIONS = [
  { dir: 'metier', expected: 37, parent: `${SITE}/metier`, parentLabel: 'Emploi par métier' },
  { dir: 'emploi', expected: 48, parent: `${SITE}/emploi`, parentLabel: 'Emploi par ville' },
];
const TOOLING = new Set([
  'scripts/seo/add-breadcrumbs.mjs',
  'scripts/seo/verify-breadcrumbs.mjs',
  'shared.css',
  'check-breadcrumbs.sh',
]);

let fails = 0;
const fail = (m) => { console.error(`  FAIL ${m}`); fails++; };
const ok   = (m) => console.log(`  ok   ${m}`);

const unescapeHtml = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"');

// --- Assertion 1 : le compte. Un check qui passerait sur un repertoire vide
// ne prouve rien, donc on exige exactement le perimetre signe.
const targets = [];
for (const s of SECTIONS) {
  const found = readdirSync(s.dir).filter((f) => f.endsWith('.html')).sort();
  if (found.length !== s.expected) fail(`${s.dir}/ : ${found.length} pages, ${s.expected} attendues`);
  for (const f of found) targets.push([`${s.dir}/${f}`, s]);
}
if (targets.length === 85) ok('perimetre: 85 cibles (37 metiers + 48 villes)');
else fail(`perimetre: ${targets.length} cibles, 85 attendues`);

for (const [file, section] of targets) {
  const before = fails;
  const html = readFileSync(file, 'utf8');

  // --- Assertion 2 : un seul BreadcrumbList, et il parse.
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]);
  const crumbs = [];
  for (const raw of blocks) {
    let node;
    try { node = JSON.parse(raw); } catch (e) { fail(`${file}: JSON-LD invalide — ${e.message}`); continue; }
    if (node['@type'] === 'BreadcrumbList') crumbs.push({ node, raw });
  }
  if (crumbs.length !== 1) { fail(`${file}: ${crumbs.length} BreadcrumbList, 1 attendu`); continue; }
  const { node, raw } = crumbs[0];

  // --- Assertion 3 : echappement defensif applique.
  if (/[<>&]/.test(raw)) fail(`${file}: caractere < > ou & non echappe dans le JSON inline`);

  // --- Assertion 4 : 3 etapes, positions 1..3 dans l'ordre.
  const items = node.itemListElement || [];
  if (items.length !== 3) { fail(`${file}: ${items.length} etapes, 3 attendues`); continue; }
  items.forEach((it, i) => {
    if (it['@type'] !== 'ListItem') fail(`${file}: etape ${i + 1} n'est pas un ListItem`);
    if (it.position !== i + 1) fail(`${file}: etape ${i + 1} porte position ${it.position}`);
    if (!it.name || !it.name.trim() || /[\r\n]/.test(it.name)) fail(`${file}: etape ${i + 1} sans nom exploitable`);
  });

  // --- Assertion 5 : le chemin designe les bonnes URLs.
  const canonical = (html.match(/<link[^>]+rel=(["'])canonical\1[^>]+href=(["'])([\s\S]*?)\2/i) || [])[3];
  if (items[0].item !== `${SITE}/`) fail(`${file}: racine = ${items[0].item}`);
  if (items[1].item !== section.parent) fail(`${file}: parent = ${items[1].item}, attendu ${section.parent}`);
  if (items[1].name !== section.parentLabel) fail(`${file}: libelle parent = « ${items[1].name} »`);
  if (!canonical) fail(`${file}: canonical absent`);
  else if (items[2].item !== canonical) fail(`${file}: feuille = ${items[2].item} ≠ canonical ${canonical}`);

  // --- Assertion 6 : LE point du dispositif. Le fil visible doit exister et
  // porter EXACTEMENT les memes libelles que le balisage. C'est ce qui sort
  // la page de la zone grise « donnees structurees non visibles ».
  const nav = html.match(/<nav class="emp-breadcrumb"[^>]*aria-label="[^"]+"[^>]*>([\s\S]*?)<\/nav>/);
  if (!nav) { fail(`${file}: aucun fil d'Ariane visible (ou sans aria-label)`); continue; }
  const visible = [...nav[1].matchAll(/<(?:a|span)[^>]*>([\s\S]*?)<\/(?:a|span)>/g)]
    .map((m) => unescapeHtml(m[1].trim()));
  const marked = items.map((it) => it.name);
  if (visible.join(' › ') !== marked.join(' › ')) {
    fail(`${file}: visible « ${visible.join(' › ')} » ≠ balise « ${marked.join(' › ')} »`);
  }
  if (!/aria-current="page"/.test(nav[1])) fail(`${file}: derniere etape sans aria-current="page"`);

  if (fails === before) ok(`${file} — ${marked.join(' › ')}`);
}

// --- Assertion 7 : aucune derive de perimetre.
try {
  const changed = execSync('git diff --name-only', { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const expected = new Set(targets.map(([f]) => f));
  const extra = changed.filter((f) => !expected.has(f) && !TOOLING.has(f));
  if (extra.length) fail(`fichiers modifies hors perimetre: ${extra.join(', ')}`);
  else ok(`git diff: ${changed.length} fichier(s), tous dans le perimetre`);
} catch (e) {
  fail(`git diff indisponible: ${e.message}`);
}

console.log(fails ? `\n${fails} assertion(s) en echec` : '\nToutes les assertions passent');
process.exit(fails ? 1 : 0);
