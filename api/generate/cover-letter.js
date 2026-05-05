export const config = { runtime: 'edge' };
import { getCurrentUser, incrementGenerations, FREE_LIMIT, sanitizeString, getAllowedOrigin } from "../_lib/auth.js";

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...H, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: H });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: H });

  if (user.plan === "free" && user.generationsUsed >= FREE_LIMIT) {
    return new Response(JSON.stringify({ error: "Limite gratuite atteinte" }), { status: 402, headers: H });
  }

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers: H }); }

  const jobOffer = sanitizeString(body.jobOffer, 8000);
  const profile = sanitizeString(body.profile, 8000);
  if (!jobOffer || !profile) {
    return new Response(JSON.stringify({ error: "Offre et profil requis" }), { status: 400, headers: H });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "Service temporairement indisponible" }), { status: 500, headers: H });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: `Tu es un expert en rédaction de lettres de motivation en France.

OFFRE D'EMPLOI:
${jobOffer}

PROFIL DU CANDIDAT:
${profile}

Génère une lettre de motivation professionnelle et personnalisée en français. Elle doit:
- Commencer par les coordonnées du candidat, la date, les coordonnées de l'entreprise et l'objet
- Avoir une accroche percutante qui montre que tu connais l'entreprise
- Développer 3 arguments forts qui montrent pourquoi le candidat est parfait pour CE poste
- Utiliser les termes exacts de l'offre d'emploi
- Être authentique et ne pas ressembler à une lettre générique
- Se terminer par une phrase de conclusion professionnelle et une signature
- Faire entre 300 et 400 mots
- Utiliser le vouvoiement

Commence directement par la lettre, sans commentaires.`,
        }],
      }),
    });

    if (!res.ok) {
      console.error("Cover letter error:", res.status);
      return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 502, headers: H });
    }

    const data = await res.json();
    const result = data.content?.[0]?.type === "text" ? data.content[0].text : "";
    await incrementGenerations(user);
    return new Response(JSON.stringify({ result }), { status: 200, headers: H });
  } catch (err) {
    console.error("Cover letter error:", err);
    return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 500, headers: H });
  }
}
