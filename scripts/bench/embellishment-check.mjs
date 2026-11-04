// Détecteur d'embellissement pour les générations de CV / lettres.
// Complète fabrication-check.mjs : là où celui-ci traque les chiffres inventés,
// celui-ci traque les faits *gonflés* avec les mots de l'offre :
//   - un niveau de langue supérieur à celui du profil (B2 → « courant ») ;
//   - un qualificatif tiré de l'offre et absent du profil (« B2B », « grands comptes »).
// La section finale de notes au candidat (« À préciser », « Écarts avec l'offre »…)
// est ignorée : y citer une exigence de l'offre est exactement le bon comportement.
//
// findEmbellishments(profile, offer, output) -> { languages, qualifiers, total, ok }

const LANGUAGES = ['anglais', 'espagnol', 'allemand', 'italien', 'portugais', 'neerlandais', 'chinois', 'arabe', 'japonais', 'russe'];

// Higher = stronger claim. "courant" and "professionnel" sit at C1.
const LEVELS = [
  [/\b(notions?|debutant|a1)\b/, 1],
  [/\b(scolaire|a2)\b/, 2],
  [/\b(intermediaire|b1)\b/, 3],
  [/\b(b2)\b/, 4],
  [/\b(courant|professionnel|fluent|c1|operationnel)\b/, 5],
  [/\b(bilingue|c2)\b/, 6],
  [/\b(natif|native|maternelle)\b/, 7],
];

// Words that change what the candidate did, not just how it is phrased.
const QUALIFIERS = ['b2b', 'b2c', 'grands comptes', 'grand compte', 'portefeuille', 'management', 'manager', 'encadrement', 'encadre', 'senior', 'lead', 'expert', 'bilingue'];

const NOTES_HEADING = /^[#*\s-]*(a preciser|notes? pour le candidat|ecarts? avec l.offre|points? a verifier)/m;
const LEVEL_WINDOW = 30;

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function stripPlaceholders(s) {
  return s.replace(/\[[^\]]*\]/g, ' ');
}
function claimsOnly(output) {
  const text = stripPlaceholders(norm(output));
  const cut = text.search(NOTES_HEADING);
  return cut === -1 ? text : text.slice(0, cut);
}
function levelIn(text) {
  let best = 0;
  for (const [re, rank] of LEVELS) if (re.test(text)) best = Math.max(best, rank);
  return best;
}
// The level that follows a language name, up to the next separator: "anglais : courant",
// "anglais (B2)". Never what precedes it, or "français (natif), anglais B2" reads as native English.
function levelAfter(text, idx, lang) {
  const tail = text.slice(idx + lang.length, idx + lang.length + LEVEL_WINDOW);
  return levelIn(tail.split(/[,;\n]/)[0]);
}
function snippet(text, idx, len) {
  const start = Math.max(0, idx - 30);
  return text.slice(start, Math.min(text.length, idx + len + 30)).replace(/\s+/g, ' ').trim();
}

/** Strongest level the profile states for `lang`, or 0 if the language is absent. */
function profileLevel(profile, lang) {
  let best = 0;
  for (const m of profile.matchAll(new RegExp(`\\b${lang}\\b`, 'g'))) {
    best = Math.max(best, levelAfter(profile, m.index, lang));
  }
  return best;
}

export function findEmbellishments(profileRaw, offerRaw, outputRaw) {
  const profile = norm(profileRaw);
  const offer = norm(offerRaw);
  const output = claimsOnly(outputRaw);
  const languages = [];
  const qualifiers = [];

  for (const lang of LANGUAGES) {
    const stated = profileLevel(profile, lang);
    for (const m of output.matchAll(new RegExp(`\\b${lang}\\b`, 'g'))) {
      const claimed = levelAfter(output, m.index, lang);
      if (claimed > stated) {
        languages.push({ value: `${lang} (profil ${stated || 'absent'} → sortie ${claimed})`, snippet: snippet(output, m.index, lang.length) });
        break;
      }
    }
  }

  for (const q of QUALIFIERS) {
    const re = new RegExp(`\\b${q}\\b`);
    if (!re.test(offer) || re.test(profile)) continue;
    const m = output.match(re);
    if (m) qualifiers.push({ value: q, snippet: snippet(output, m.index, q.length) });
  }

  const total = languages.length + qualifiers.length;
  return { languages, qualifiers, total, ok: total === 0 };
}
