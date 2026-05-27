export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser, withTimeout, incrementGenerations, FREE_LIMIT } from '../_lib/auth.js';

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'interview-questions', 20, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });
  const userRl = await checkRateLimit(`user:${user.email}`, 'interview-questions', 15, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const bodyText = await req.text();
  if (bodyText.length > 8000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const jobTitle       = sanitizeString(body.jobTitle       || '', 200);
  const company        = sanitizeString(body.company        || '', 200);
  const level          = ['junior','mid','senior','manager'].includes(body.level) ? body.level : 'mid';
  const jobDescription = sanitizeString(body.jobDescription || '', 4000);

  if (!jobTitle) return new Response(JSON.stringify({ error: 'Poste requis' }), { status: 400, headers: H });

  if (user.plan === 'free') {
    const newCount = await incrementGenerations(user);
    if (newCount !== null && newCount > FREE_LIMIT) {
      return new Response(JSON.stringify({ error: 'Limite gratuite atteinte' }), { status: 402, headers: H });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  const levelLabel = { junior: 'junior (0-3 ans)', mid: 'confirmé (3-6 ans)', senior: 'senior (6+ ans)', manager: 'manager / lead' }[level];

  const prompt = `Tu es un expert RH et coach en entretien pour le marché français. Génère une liste de questions d'entretien personnalisées.

CONTEXTE :
- Poste : ${jobTitle}${company ? ` chez ${company}` : ''}
- Niveau : ${levelLabel}
${jobDescription ? `\nFICHE DE POSTE :\n${jobDescription}` : ''}

Génère des questions PRÉCISES et PERTINENTES pour ce poste et ce niveau. Évite les questions génériques.

Pour chaque question comportementale et technique, ajoute un tip court (1-2 phrases) sur comment bien répondre en France.

Réponds UNIQUEMENT en JSON valide :
{
  "behavioral": [
    { "q": "Question comportementale 1 (méthode STAR)", "tip": "Conseil de réponse concis" },
    { "q": "Question comportementale 2", "tip": "Conseil" },
    { "q": "Question comportementale 3", "tip": "Conseil" },
    { "q": "Question comportementale 4", "tip": "Conseil" },
    { "q": "Question comportementale 5", "tip": "Conseil" }
  ],
  "technical": [
    { "q": "Question technique spécifique au poste 1", "tip": "Conseil de réponse" },
    { "q": "Question technique 2", "tip": "Conseil" },
    { "q": "Question technique 3", "tip": "Conseil" },
    { "q": "Question technique 4", "tip": "Conseil" },
    { "q": "Question technique 5", "tip": "Conseil" }
  ],
  "motivation": [
    { "q": "Question de motivation / fit culturel 1" },
    { "q": "Question de motivation 2" },
    { "q": "Question de motivation 3" }
  ],
  "toAsk": [
    { "q": "Question pertinente à poser au recruteur 1" },
    { "q": "Question à poser 2" },
    { "q": "Question à poser 3" }
  ]
}`;

  try {
    const res = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' },
      body: JSON.stringify({
        model: user.plan === 'free' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
        max_tokens: user.plan === 'free' ? 1200 : 2000,
        system: [{ type: 'text', text: 'Tu es un expert RH et coach en recrutement pour le marché français. Tu génères des questions d\'entretien précises, adaptées au poste et au niveau du candidat. Tu connais les différences entre entretiens en France (plus formels, méthode STAR moins répandue) et aux US. Réponds uniquement en JSON valide, sans markdown.', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      }),
    }), 20000);

    if (!res.ok) return new Response(JSON.stringify({ error: 'Erreur API' }), { status: 502, headers: H });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    let result;
    try { result = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { result = JSON.parse(m[0]); } catch {} }

    if (!result?.behavioral) return new Response(JSON.stringify({ error: 'Réponse invalide' }), { status: 500, headers: H });
    return new Response(JSON.stringify(result), { status: 200, headers: H });
  } catch {
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H });
  }
}
