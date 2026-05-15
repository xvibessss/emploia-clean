export const config = { runtime: 'edge' };
import { getCurrentUser, incrementGenerations, getGenerationsUsed, FREE_LIMIT, sanitizeString, getAllowedOrigin, checkRateLimit, withTimeout } from "../_lib/auth.js";

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...H, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'generate-ats', 20, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de générations. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: H });

  const userRl = await checkRateLimit(`user:${user.email}`, 'generate-ats', 15, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Limite de génération atteinte. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers: H }); }

  const cvText = sanitizeString(body.cvText, 8000);
  const jobOffer = sanitizeString(body.jobOffer, 8000);
  if (!cvText || !jobOffer) {
    return new Response(JSON.stringify({ error: "CV et offre requis" }), { status: 400, headers: H });
  }

  if (user.plan === "free") {
    const freshCount = await getGenerationsUsed(user.email);
    const used = freshCount !== null ? freshCount : user.generationsUsed;
    if (used >= FREE_LIMIT) return new Response(JSON.stringify({ error: "Limite gratuite atteinte" }), { status: 402, headers: H });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "Service temporairement indisponible" }), { status: 500, headers: H });

  try {
    const res = await withTimeout(fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        system: [{ type: "text", text: "Tu es un expert ATS et recruteur senior en France. Tu analyses des CVs par rapport à des offres d'emploi et fournis un score détaillé avec des recommandations actionnables. Réponds uniquement en JSON valide.", cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          content: `OFFRE D'EMPLOI:\n${jobOffer}\n\nCV DU CANDIDAT:\n${cvText}\n\nAnalyse ce CV par rapport à cette offre. Réponds UNIQUEMENT en JSON valide (sans markdown, sans backtick) :
{
  "score": 72,
  "bars": [
    {"name": "Mots-clés", "val": 68},
    {"name": "Format", "val": 90},
    {"name": "Expérience", "val": 75},
    {"name": "Compétences", "val": 65},
    {"name": "Lisibilité", "val": 85}
  ],
  "recommendations": "<ul style=\\"margin-left:18px\\"><li>Intégrez les mots-clés exacts de l'offre</li><li>Quantifiez vos résultats avec des chiffres</li></ul>",
  "keywords": ["mot-clé manquant 1", "mot-clé manquant 2", "mot-clé manquant 3"],
  "strengths": ["Point fort 1", "Point fort 2"],
  "improvements": ["Amélioration 1", "Amélioration 2"]
}

Règles : score entre 40 et 97. recommendations en HTML (<ul><li>). 3-5 items par liste.`,
        }],
      }),
    }), 30000);

    if (!res.ok) {
      console.error("ATS score error:", res.status);
      return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 502, headers: H });
    }

    const data = await res.json();
    const text = data.content?.[0]?.type === "text" ? data.content[0].text : "";

    let result;
    try { result = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { result = JSON.parse(m[0]); } catch {} }

    if (!result?.score) return new Response(JSON.stringify({ error: "Réponse invalide" }), { status: 500, headers: H });

    await incrementGenerations(user);
    return new Response(JSON.stringify(result), { status: 200, headers: H });
  } catch (err) {
    console.error("ATS score error:", err);
    return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 500, headers: H });
  }
}
