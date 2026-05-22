export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser, withTimeout, getGenerationsUsed, incrementGenerations, FREE_LIMIT } from '../_lib/auth.js';

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
  const rl = await checkRateLimit(`ip:${ip}`, 'follow-up', 20, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });
  const userRl = await checkRateLimit(`user:${user.email}`, 'follow-up', 15, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const bodyText = await req.text();
  if (bodyText.length > 5000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const jobTitle    = sanitizeString(body.jobTitle   || '', 200);
  const company     = sanitizeString(body.company    || '', 200);
  const daysAgo     = Math.min(Math.max(parseInt(body.daysAgo) || 14, 1), 365);
  const senderName  = sanitizeString(body.senderName || '', 100);
  const contactName = sanitizeString(body.contactName || '', 100);
  const tone        = body.tone === 'formal' ? 'très formel' : 'professionnel et chaleureux';

  if (!company && !jobTitle) return new Response(JSON.stringify({ error: 'Entreprise ou poste requis' }), { status: 400, headers: H });

  if (user.plan === 'free') {
    const freshCount = await getGenerationsUsed(user.email);
    const used = freshCount !== null ? freshCount : user.generationsUsed;
    if (used >= FREE_LIMIT) return new Response(JSON.stringify({ error: 'Limite gratuite atteinte' }), { status: 402, headers: H });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  const prompt = `Tu es un expert en candidature sur le marché français. Génère un email de relance professionnel pour une candidature sans réponse.

CONTEXTE :
- Poste postulé : ${jobTitle || 'Non précisé'}
- Entreprise : ${company || 'Non précisée'}
- Jours depuis la candidature : ${daysAgo} jours
- Nom du candidat : ${senderName || '[Votre Prénom Nom]'}
- Nom du contact (si connu) : ${contactName || 'Madame, Monsieur'}
- Ton souhaité : ${tone}

Génère 2 versions de l'email de relance :
1. Version courte (5-6 lignes) — directe et percutante
2. Version développée (8-10 lignes) — avec un rappel de motivation

Réponds UNIQUEMENT en JSON valide :
{
  "subject": "Objet de l'email",
  "short": "Version courte complète (incluant formule de politesse, commence par la salutation appropriée)",
  "long": "Version développée complète",
  "tips": ["Conseil pratique pour maximiser les chances de réponse 1", "Conseil 2"]
}`;

  try {
    const res = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' },
      body: JSON.stringify({
        model: user.plan === 'free' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
        max_tokens: user.plan === 'free' ? 1000 : 1800,
        system: [{ type: 'text', text: 'Tu es un expert en candidature et communication professionnelle pour le marché français. Tu maîtrises les codes de relance en France (plus délicats qu\'aux US). Tes emails de relance rouvrent la conversation sans paraître insistants — ils apportent de la valeur et rappellent discrètement la candidature. Réponds uniquement en JSON valide.', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      }),
    }), 20000);

    if (!res.ok) return new Response(JSON.stringify({ error: 'Erreur API' }), { status: 502, headers: H });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    let result;
    try { result = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { result = JSON.parse(m[0]); } catch {} }

    if (!result?.short) return new Response(JSON.stringify({ error: 'Réponse invalide' }), { status: 500, headers: H });
    if (user.plan === 'free') await incrementGenerations(user).catch(() => {});
    return new Response(JSON.stringify(result), { status: 200, headers: H });
  } catch {
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H });
  }
}
