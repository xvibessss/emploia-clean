#!/usr/bin/env node
// Bench qualité des générations IA.
//
//   node scripts/bench/run.mjs          → auto-test du détecteur sur les golden
//                                          samples + garde-fou anti-régression du
//                                          prompt (aucune clé requise, CI-safe).
//   node scripts/bench/run.mjs --live   → génère chaque CASE via l'API Anthropic
//                                          (ANTHROPIC_API_KEY requise) avec le
//                                          prompt système EXACT de cv.js, puis
//                                          vérifie l'absence de données inventées.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFabrications, report } from './fabrication-check.mjs';
import { CASES, GOLDEN } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CV = path.join(HERE, '..', '..', 'api', 'generate', 'cv.js');
let fail = 0;

// ── 1. Garde-fou : la règle d'honnêteté doit rester dans le prompt produit ──
function extractSystemPrompt() {
  const src = fs.readFileSync(CV, 'utf8');
  const m = src.match(/type:\s*"text",\s*\n\s*text:\s*("(?:[^"\\]|\\.)*")/);
  if (!m) throw new Error("Prompt système introuvable dans cv.js");
  return JSON.parse(m[1]);
}
console.log('\n▶ Garde-fou du prompt (cv.js)');
let SYSTEM = '';
try {
  SYSTEM = extractSystemPrompt();
  const hasRule = /HONN[ÊE]TET[ÉE]/i.test(SYSTEM) && /n['’]invente/i.test(SYSTEM);
  if (hasRule) console.log("  ✓ règle d'honnêteté anti-fabrication présente");
  else { console.log("  ✗ règle d'honnêteté ABSENTE du prompt système !"); fail++; }
} catch (e) { console.log('  ✗ ' + e.message); fail++; }

// ── 2. Auto-test du détecteur sur les golden samples ──
console.log('\n▶ Auto-test du détecteur (golden samples)');
{
  const clean = report('sortie propre', GOLDEN.profile, GOLDEN.clean);
  console.log(clean.text);
  if (!clean.r.ok) { console.log('    ↳ ATTENDU : 0 — le détecteur a des faux positifs.'); fail++; }

  const planted = report('sortie avec fabrications', GOLDEN.profile, GOLDEN.planted);
  console.log(planted.text);
  if (planted.r.ok) { console.log('    ↳ ATTENDU : >0 — le détecteur a raté des fabrications.'); fail++; }
}

// ── 3. Mode live : génération réelle + vérification ──
if (process.argv.includes('--live')) {
  console.log('\n▶ Génération live via Anthropic + vérification');
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log('  ⚠ ANTHROPIC_API_KEY absente — mode live sauté.');
  } else {
    for (const c of CASES) {
      try {
        const out = await generate(key, SYSTEM, c);
        const { text } = report(c.name, c.profile, out);
        console.log(text);
        if (!findFabrications(c.profile, out).ok) fail++;
      } catch (e) {
        console.log(`  ✗ ${c.name} : ${e.message}`); fail++;
      }
    }
  }
} else {
  console.log('\n  (mode live désactivé — lance avec --live et ANTHROPIC_API_KEY pour tester des générations réelles)');
}

async function generate(key, system, c) {
  const userPrompt = `OFFRE D'EMPLOI:\n${c.offer}\n\nPROFIL DU CANDIDAT:\n${c.profile}\n\nGénère un CV professionnel en français adapté à cette offre. N'utilise que les faits du profil ; pour toute donnée manquante, insère « [à compléter : … ] ». Démarre directement par le CV.`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 2500, temperature: 0,
      system: [{ type: 'text', text: system }],
      messages: [{ role: 'user', content: userPrompt }],
    }),
    signal: AbortSignal.timeout(40000),
  });
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  return data.content?.map(b => b.text || '').join('') || '';
}

console.log(`\n${fail === 0 ? '✓ BENCH OK' : '✗ BENCH : ' + fail + ' échec(s)'}\n`);
process.exit(fail === 0 ? 0 : 1);
