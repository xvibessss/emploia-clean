#!/usr/bin/env node
/**
 * Assertions d'acceptance pour la slice A du pipeline bones "jsonld-metiers".
 * Exit 0 seulement si TOUTES passent. Appele par ./check-jsonld.sh.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

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

let fails = 0;
const fail = (m) => { console.error(`  FAIL ${m}`); fails++; };
const ok   = (m) => console.log(`  ok   ${m}`);

function attr(html, re) {
  const m = html.match(re);
  return m ? m[m.length - 1].replace(/\s+/g, ' ').trim() : '';
}

// --- Assertion 1 : le compte. Un check qui passerait sur un repertoire vide
// ne prouve rien, donc on exige exactement 10 cibles.
if (TARGETS.length !== 10) fail(`perimetre: ${TARGETS.length} cibles, 10 attendues`);
else ok('perimetre: 10 cibles');

for (const [file, expectedType] of TARGETS) {
  let html;
  try { html = readFileSync(file, 'utf8'); }
  catch { fail(`${file}: illisible`); continue; }

  // Assertion 1 (suite) : exactement un bloc
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  if (blocks.length !== 1) { fail(`${file}: ${blocks.length} bloc(s), 1 attendu`); continue; }

  // Assertion 2 : JSON valide
  const body = blocks[0].replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
  let node;
  try { node = JSON.parse(body); }
  catch (e) { fail(`${file}: JSON invalide — ${e.message}`); continue; }

  // Assertion 3 : contexte et type
  if (node['@context'] !== 'https://schema.org') fail(`${file}: @context = ${node['@context']}`);
  if (node['@type'] !== expectedType) fail(`${file}: @type = ${node['@type']}, attendu ${expectedType}`);

  // Assertion 4 : url identique au canonical de la page
  const canonical = attr(html, /<link[^>]+rel=(["'])canonical\1[^>]+href=(["'])([\s\S]*?)\2/i);
  if (!canonical) fail(`${file}: pas de canonical`);
  else if (node.url !== canonical) fail(`${file}: url "${node.url}" != canonical "${canonical}"`);

  // Assertion 5 : name et description non vides, sur une seule ligne
  for (const k of ['name', 'description']) {
    const v = node[k];
    if (!v || !String(v).trim()) fail(`${file}: ${k} vide`);
    else if (/[\r\n]/.test(v)) fail(`${file}: ${k} contient un retour a la ligne`);
  }

  // Assertion 6 : description identique a la meta de la page
  const meta = attr(html, /<meta[^>]+name=(["'])description\1[^>]+content=(["'])([\s\S]*?)\2/i);
  if (meta && node.description !== meta) {
    fail(`${file}: description != meta\n        json: ${String(node.description).slice(0,70)}\n        meta: ${meta.slice(0,70)}`);
  }

  // isPartOf conserve
  if (!node.isPartOf || node.isPartOf.url !== 'https://emploia.eu') {
    fail(`${file}: isPartOf absent ou incorrect`);
  }

  // Assertion 2bis : l'echappement defensif est bien applique
  if (/[<>&]/.test(body)) fail(`${file}: caractere < > ou & non echappe dans le JSON inline`);

  if (!fails) ok(`${file} — ${expectedType}`);
}

// --- Assertion 7 : aucune derive de perimetre
try {
  const changed = execSync('git diff --name-only', { encoding: 'utf8' })
    .split('\n').map(s => s.trim()).filter(Boolean);
  const expected = new Set(TARGETS.map(([f]) => f));
  const extra = changed.filter(f => !expected.has(f));
  if (extra.length) fail(`fichiers modifies hors perimetre: ${extra.join(', ')}`);
  else ok(`git diff: ${changed.length} fichier(s), tous dans le perimetre`);
} catch (e) {
  fail(`git diff indisponible: ${e.message}`);
}

// --- Assertion 8 : les pages hors perimetre sont intactes.
// La version initiale comptait les blocs et traitait >1 comme un doublon.
// C'etait FAUX : schema.org autorise plusieurs blocs par page, et les pages
// villes en ont legitimement deux (CollectionPage + FAQPage). Ce que l'on
// veut verifier n'est pas le nombre de blocs mais qu'aucune page hors
// perimetre n'a ete touchee.
try {
  const changed = execSync('git diff --name-only', { encoding: 'utf8' })
    .split('\n').map(s => s.trim()).filter(Boolean);
  const expected = new Set(TARGETS.map(([f]) => f));
  const touchedOutside = changed.filter(
    f => (f.startsWith('metier/') || f.startsWith('emploi/')) && !expected.has(f)
  );
  if (touchedOutside.length) {
    fail(`pages metier//emploi/ hors perimetre modifiees: ${touchedOutside.join(', ')}`);
  } else {
    ok('aucune page metier//emploi/ hors perimetre modifiee');
  }
} catch (e) {
  fail(`verification hors-perimetre impossible: ${e.message}`);
}

console.log(fails ? `\n${fails} assertion(s) en echec` : '\nToutes les assertions passent');
process.exit(fails ? 1 : 0);
