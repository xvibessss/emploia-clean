#!/usr/bin/env node
// Bench qualité des générations IA.
//
//   node scripts/bench/run.mjs          → garde-fous des prompts + auto-test des
//                                          détecteurs sur les golden samples
//                                          (aucune clé requise, CI-safe).
//   node scripts/bench/run.mjs --live   → génère chaque CASE avec les prompts EXACTS
//                                          de prod (api/_lib/prompts-candidature.js),
//                                          offre gratuite (Haiku) et Pro (Sonnet),
//                                          puis vérifie l'absence de données inventées
//                                          ou gonflées (ANTHROPIC_API_KEY requise).
import { findFabrications, report } from './fabrication-check.mjs';
import { findEmbellishments } from './embellishment-check.mjs';
import { CASES, EMBELLISH, GOLDEN } from './fixtures.mjs';
import {
  ANTI_EMBELLISSEMENT, CV_SYSTEM, LETTER_SYSTEM, buildCvUserPrompt, buildLetterUserPrompt, dateDuJour,
} from '../../api/_lib/prompts-candidature.js';

// Same models as api/generate/cv.js, per plan.
const MODELS = { free: 'claude-haiku-4-5-20251001', pro: 'claude-sonnet-4-6' };
let fail = 0;
const check = (label, ok) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) fail++; };

// ── 1. Garde-fous : les règles doivent rester dans les prompts produits ──
console.log('\n▶ Garde-fous des prompts (api/_lib/prompts-candidature.js)');
for (const [name, system] of [['CV', CV_SYSTEM], ['lettre', LETTER_SYSTEM]]) {
  check(`${name} : règle d'honnêteté anti-fabrication présente`, /HONN[ÊE]TET[ÉE]/i.test(system) && /n['’]invente/i.test(system));
  check(`${name} : règle anti-embellissement présente`, system.includes(ANTI_EMBELLISSEMENT));
}
const prompts = ['free', 'pro'].flatMap((plan) => [
  buildCvUserPrompt({ jobOffer: 'O', profile: 'P', plan }),
  buildLetterUserPrompt({ jobOffer: 'O', profile: 'P', plan }),
]);
// The 22/10 regression: an unconditional "keywords verbatim" order beat the honesty rule.
check('aucune consigne « mots-clés verbatim » sans condition « là où le profil les justifie »',
  prompts.every((p) => !/verbatim|mots-clés exacts|termes exacts/i.test(p) || /là où le profil les justifie/.test(p)));
check('chaque prompt demande la section « À PRÉCISER AVANT D\'ENVOYER »', prompts.every((p) => p.includes("À PRÉCISER AVANT D'ENVOYER")));
check('la lettre reçoit la date du jour', buildLetterUserPrompt({ jobOffer: 'O', profile: 'P', plan: 'free' }).includes(dateDuJour()));
check('date du jour au format français', /^\d{1,2} [a-zéû]+ \d{4}$/.test(dateDuJour(new Date('2026-10-22T10:00:00Z'))));

// ── 2. Auto-test des détecteurs sur les golden samples ──
console.log('\n▶ Auto-test du détecteur de fabrication (golden samples)');
{
  const clean = report('sortie propre', GOLDEN.profile, GOLDEN.clean);
  console.log(clean.text);
  if (!clean.r.ok) { console.log('    ↳ ATTENDU : 0 — le détecteur a des faux positifs.'); fail++; }
  const planted = report('sortie avec fabrications', GOLDEN.profile, GOLDEN.planted);
  console.log(planted.text);
  if (planted.r.ok) { console.log('    ↳ ATTENDU : >0 — le détecteur a raté des fabrications.'); fail++; }
}
console.log("\n▶ Auto-test du détecteur d'embellissement (cas réel du 22/10)");
check('sortie embellie signalée', !findEmbellishments(EMBELLISH.profile, EMBELLISH.offer, EMBELLISH.planted).ok);
check('sortie honnête sans faux positif', findEmbellishments(EMBELLISH.profile, EMBELLISH.offer, EMBELLISH.clean).ok);
for (const c of CASES) {
  check(`golden « ${c.name} » : le profil seul ne déclenche rien`, findEmbellishments(c.profile, c.offer, c.profile).ok);
}

// ── 3. Mode live : génération réelle avec les prompts de prod ──
if (process.argv.includes('--live')) {
  console.log('\n▶ Génération live via Anthropic (prompts de prod) + vérification');
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log('  ⚠ ANTHROPIC_API_KEY absente — mode live sauté.');
  } else {
    const liveCases = [...CASES, { name: 'Embellissement — cas réel 22/10', profile: EMBELLISH.profile, offer: EMBELLISH.offer }];
    for (const plan of ['free', 'pro']) {
      for (const c of liveCases) {
        for (const kind of ['cv', 'lettre']) {
          const label = `${c.name} · ${kind} · ${plan}`;
          try {
            const out = await generate(key, plan, kind, c);
            const fab = findFabrications(c.profile, out);
            const emb = findEmbellishments(c.profile, c.offer, out);
            console.log(report(label, c.profile, out).text);
            for (const f of [...emb.languages, ...emb.qualifiers]) console.log(`    • gonflé « ${f.value} » — ${f.snippet}`);
            if (!fab.ok || !emb.ok) fail++;
          } catch (e) {
            console.log(`  ✗ ${label} : ${e.message}`); fail++;
          }
        }
      }
    }
  }
} else {
  console.log('\n  (mode live désactivé — lance avec --live et ANTHROPIC_API_KEY pour tester des générations réelles)');
}

async function generate(key, plan, kind, c) {
  const args = { jobOffer: c.offer, profile: c.profile, profileHint: '', plan };
  const system = kind === 'cv' ? CV_SYSTEM : LETTER_SYSTEM;
  const user = kind === 'cv' ? buildCvUserPrompt(args) : buildLetterUserPrompt(args);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODELS[plan], max_tokens: 4096, temperature: 0,
      system: [{ type: 'text', text: system }],
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  return data.content?.map((b) => b.text || '').join('') || '';
}

console.log(`\n${fail === 0 ? '✓ BENCH OK' : '✗ BENCH : ' + fail + ' échec(s)'}\n`);
process.exit(fail === 0 ? 0 : 1);
