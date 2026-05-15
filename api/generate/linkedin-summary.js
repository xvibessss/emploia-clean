export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, withTimeout, getCurrentUser, incrementGenerations, getGenerationsUsed, FREE_LIMIT } from '../_lib/auth.js';

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
  const rl = await checkRateLimit(`ip:${ip}`, 'linkedin-summary', 20, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });
  const userRl = await checkRateLimit(`user:${user.email}`, 'linkedin-summary', 15, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const profile     = sanitizeString(body.profile     || '', 4000);
  const targetRole  = sanitizeString(body.targetRole  || '', 200);
  const tone        = body.tone === 'expert' ? 'expert et sobre' : body.tone === 'creative' ? 'créatif et humain' : 'professionnel et accessible';

  if (!profile) return new Response(JSON.stringify({ error: 'Profil requis' }), { status: 400, headers: H });

  if (user.plan === 'free') {
    const used = await getGenerationsUsed(user.email) ?? user.generationsUsed;
    if (used >= FREE_LIMIT) return new Response(JSON.stringify({ error: 'Limite gratuite atteinte' }), { status: 402, headers: H });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  const prompt = `Tu es un expert en personal branding et en optimisation de profils LinkedIn pour le marché français. Génère un profil LinkedIn percutant.

PROFIL / CV DU CANDIDAT :
${profile}
${targetRole ? `\nPOSTE CIBLE : ${targetRole}` : ''}
TON SOUHAITÉ : ${tone}

Règles LinkedIn :
- Section "À propos" : 3-4 paragraphes, max 2600 caractères, commence par une accroche forte (jamais "Je m'appelle")
- Titre LinkedIn : max 220 caractères, combine rôle + valeur ajoutée + mot-clé principal
- Compétences : les 10 plus recherchées par les recruteurs pour ce profil
- Mots-clés ATS LinkedIn : les termes que les recruteurs tapent vraiment dans la barre de recherche

Réponds UNIQUEMENT en JSON valide :
{
  "about": "Section À propos complète (3-4 paragraphes, accroche forte, expériences clés, valeur ajoutée, call-to-action de fin)",
  "headline": "Titre LinkedIn optimisé (≤220 car.)",
  "skills": ["Compétence 1", "Compétence 2", "Compétence 3", "Compétence 4", "Compétence 5", "Compétence 6", "Compétence 7", "Compétence 8", "Compétence 9", "Compétence 10"],
  "keywords": ["mot-clé recruteur 1", "mot-clé recruteur 2", "mot-clé recruteur 3", "mot-clé recruteur 4", "mot-clé recruteur 5"],
  "tips": ["Conseil pour optimiser davantage le profil 1", "Conseil 2"]
}`;

  try {
    const res = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: [{ type: 'text', text: 'Tu es un expert LinkedIn et personal branding pour le marché français. Tu génères des profils LinkedIn qui attirent les recruteurs. Réponds uniquement en JSON valide.', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      }),
    }), 25000);

    if (!res.ok) return new Response(JSON.stringify({ error: 'Erreur API' }), { status: 502, headers: H });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    let result;
    try { result = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { result = JSON.parse(m[0]); } catch {} }

    if (!result?.about) return new Response(JSON.stringify({ error: 'Réponse invalide' }), { status: 500, headers: H });

    if (user.plan === 'free') await incrementGenerations(user);
    return new Response(JSON.stringify(result), { status: 200, headers: H });
  } catch {
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H });
  }
}
