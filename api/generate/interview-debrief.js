export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, withTimeout, getCurrentUser } from '../_lib/auth.js';

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
  if (!user.plan || user.plan === 'free') return new Response(JSON.stringify({ error: 'Abonnement Pro requis' }), { status: 403, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'interview-debrief', 15, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });
  const userRl = await checkRateLimit(`user:${user.email}`, 'interview-debrief', 10, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const jobTitle       = sanitizeString(body.jobTitle       || '', 300);
  const notes          = sanitizeString(body.notes          || '', 5000);
  const jobDescription = sanitizeString(body.jobDescription || '', 3000);

  if (!jobTitle) return new Response(JSON.stringify({ error: 'Poste requis' }), { status: 400, headers: H });
  if (!notes)    return new Response(JSON.stringify({ error: 'Notes d\'entretien requises' }), { status: 400, headers: H });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  const prompt = `Tu es un coach en recrutement expert du marché français. Analyse cet entretien et fournis un bilan constructif.

POSTE : ${jobTitle}
${jobDescription ? `\nFICHE DE POSTE :\n${jobDescription}` : ''}

NOTES / RESSENTI DU CANDIDAT :
${notes}

Génère un bilan structuré et bienveillant pour aider le candidat à progresser.

Réponds UNIQUEMENT en JSON valide :
{
  "score": 7,
  "scoreComment": "Commentaire bref sur le score global (1 phrase)",
  "strengths": [
    "Point fort identifié 1 — sois précis et encourageant",
    "Point fort 2",
    "Point fort 3"
  ],
  "improvements": [
    "Axe d'amélioration concret 1 — formule de manière constructive avec conseil actionnable",
    "Axe 2",
    "Axe 3"
  ],
  "keyAnswers": [
    {
      "question": "Question difficile ou moment clé de l'entretien identifié dans les notes",
      "betterAnswer": "Ce qu'il aurait été optimal de répondre, avec la méthode STAR si pertinent"
    },
    {
      "question": "Autre moment clé",
      "betterAnswer": "Réponse optimale"
    }
  ],
  "thankYouEmail": "Email de remerciement post-entretien complet — professionnel et chaleureux, rappelle 1-2 points forts de l'échange, réaffirme la motivation, propose la prochaine étape. Adapté au contexte français.",
  "nextSteps": [
    "Action concrète à faire dans les 24-48h (ex: envoyer l'email de remerciement)",
    "Préparation pour un éventuel 2e entretien",
    "Compétence à travailler pour la prochaine fois"
  ]
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
        max_tokens: 2000,
        system: [{ type: 'text', text: 'Tu es un coach en recrutement expert du marché français. Tu fournis des bilans d\'entretien constructifs et actionnables. Réponds uniquement en JSON valide.', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      }),
    }), 28000);

    if (!res.ok) return new Response(JSON.stringify({ error: 'Erreur API' }), { status: 502, headers: H });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    let result;
    try { result = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { result = JSON.parse(m[0]); } catch {} }

    if (!result?.strengths) return new Response(JSON.stringify({ error: 'Réponse invalide' }), { status: 500, headers: H });
    return new Response(JSON.stringify(result), { status: 200, headers: H });
  } catch {
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H });
  }
}
