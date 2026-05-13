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
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: `Tu es un expert ATS (Applicant Tracking System) et en recrutement en France.

OFFRE D'EMPLOI:
${jobOffer}

CV DU CANDIDAT:
${cvText}

Analyse ce CV par rapport à cette offre d'emploi et fournis:

1. **SCORE ATS: XX/100** - Score global de compatibilité

2. **Points forts** (ce qui correspond bien à l'offre):
   - Liste des éléments positifs

3. **Points à améliorer** (ce qui manque ou est à renforcer):
   - Liste des lacunes

4. **Mots-clés manquants** (présents dans l'offre, absents du CV):
   - Liste des mots-clés importants à ajouter

5. **Recommandations concrètes**:
   - Actions spécifiques pour améliorer le score

Sois précis et actionnable dans tes recommandations.`,
        }],
      }),
    }), 30000);

    if (!res.ok) {
      console.error("ATS score error:", res.status);
      return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 502, headers: H });
    }

    const data = await res.json();
    const result = data.content?.[0]?.type === "text" ? data.content[0].text : "";
    await incrementGenerations(user);
    return new Response(JSON.stringify({ result }), { status: 200, headers: H });
  } catch (err) {
    console.error("ATS score error:", err);
    return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 500, headers: H });
  }
}
