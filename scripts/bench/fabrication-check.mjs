// Détecteur de fabrication pour les générations de CV / lettres.
// Vérifie qu'une sortie n'introduit AUCUN chiffre clé (pourcentage, montant,
// multiplicateur, année, effectif) absent du profil fourni par le candidat.
// Heuristique haute précision : on ne signale que des motifs à fort signal de
// "résultat inventé". Les marqueurs [à compléter …] sont attendus, jamais signalés.
//
// findFabrications(profile, output) -> { figures, years, counts, ok }

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function norm(s) {
  return stripAccents(String(s || '').toLowerCase()).replace(/\s+/g, ' ');
}
// Numeric core, comparable across "1 200", "1.200", "1200".
function numCore(s) {
  return String(s).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
}
// Remove [à compléter …] placeholders — those are the *correct* behaviour.
function stripPlaceholders(s) {
  return String(s || '').replace(/\[[^\]]*\]/g, ' ');
}

function profileNumbers(profile) {
  const set = new Set();
  const p = norm(profile);
  for (const m of p.matchAll(/\d[\d .,]*/g)) {
    const c = numCore(m[0]);
    if (c) set.add(c);
  }
  return set;
}

function snippet(text, idx, len) {
  const start = Math.max(0, idx - 32);
  const end = Math.min(text.length, idx + len + 32);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

export function findFabrications(profile, outputRaw) {
  const known = profileNumbers(profile);
  const output = stripPlaceholders(outputRaw);
  const figures = [], years = [], counts = [];
  const seen = new Set();
  const flag = (bucket, value, idx, len) => {
    const key = bucket.name + numCore(value);
    if (seen.has(key)) return;
    seen.add(key);
    bucket.push({ value: value.trim(), snippet: snippet(output, idx, len) });
  };
  figures.name = 'figures'; years.name = 'years'; counts.name = 'counts';

  // Percentages: "30 %", "30%"
  for (const m of output.matchAll(/\b(\d{1,3})\s?%/g)) {
    if (!known.has(numCore(m[1]))) flag(figures, m[0], m.index, m[0].length);
  }
  // Money: "200 k€", "1,2 M€", "50 000 €". No trailing \b — "€" is non-word and would break it.
  for (const m of output.matchAll(/\b\d[\d  .,]*\s?(?:k€|m€|k eur|keur|meur|€)/gi)) {
    if (!known.has(numCore(m[0]))) flag(figures, m[0], m.index, m[0].length);
  }
  // Multipliers: "x3", "3x", "×2"
  for (const m of output.matchAll(/\b(?:x|×)\s?(\d+(?:[.,]\d+)?)\b|\b(\d+(?:[.,]\d+)?)\s?(?:x|×)\b/gi)) {
    const num = m[1] || m[2];
    if (!known.has(numCore(num))) flag(figures, m[0], m.index, m[0].length);
  }
  // Years: 1980–2099 (dates of experience / diplomas)
  for (const m of output.matchAll(/\b(19[8-9]\d|20\d\d)\b/g)) {
    if (!known.has(numCore(m[1]))) flag(years, m[0], m.index, m[0].length);
  }
  // Headcount / volumes: "équipe de 12", "12 personnes/collaborateurs/clients/utilisateurs"
  const unit = 'personnes?|collaborateurs?|collaboratrices?|clients?|utilisateurs?|employes?|salaries?|membres?';
  for (const m of output.matchAll(new RegExp(`\\b(?:equipe de|team de)\\s?(\\d+)`, 'gi'))) {
    if (!known.has(numCore(m[1]))) flag(counts, m[0], m.index, m[0].length);
  }
  for (const m of stripAccents(output).matchAll(new RegExp(`\\b(\\d+)\\s?(?:${unit})\\b`, 'gi'))) {
    if (!known.has(numCore(m[1]))) flag(counts, m[0], m.index, m[0].length);
  }

  const total = figures.length + years.length + counts.length;
  return { figures, years, counts, total, ok: total === 0 };
}

export function report(name, profile, output) {
  const r = findFabrications(profile, output);
  const lines = [];
  const push = (label, arr) => arr.forEach(f => lines.push(`    • ${label} « ${f.value} » — ${f.snippet}`));
  if (r.ok) {
    lines.push(`  ✓ ${name} : aucune donnée non fournie détectée`);
  } else {
    lines.push(`  ✗ ${name} : ${r.total} donnée(s) potentiellement inventée(s)`);
    push('chiffre', r.figures); push('année', r.years); push('effectif', r.counts);
  }
  return { r, text: lines.join('\n') };
}
