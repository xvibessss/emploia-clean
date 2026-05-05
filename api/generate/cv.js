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
          content: `Tu es un expert en rédaction de CV professionnels en France.

OFFRE D'EMPLOI:
${jobOffer}

PROFIL DU CANDIDAT:
${profile}

Génère un CV complet et professionnel en français, parfaitement adapté à cette offre. Le CV doit:
- Utiliser les mots-clés exacts de l'offre pour passer les filtres ATS
- Mettre en avant les compétences les plus pertinentes pour le poste
- Être structuré avec ces sections: En-tête (nom, email, téléphone, LinkedIn), Profil/Résumé (3-4 lignes), Expériences professionnelles, Formation, Compétences, Langues
- Utiliser des verbes d'action forts
- Être concis et percutant

Format: texte structuré clair avec des tirets et des sections bien délimitées.`,
        }],
      }),
    });

    if (!res.ok) {
      console.error("CV generation error:", res.status);
      return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 502, headers: H });
    }

    const data = await res.json();
    const result = data.content?.[0]?.type === "text" ? data.content[0].text : "";
    await incrementGenerations(user);
    return new Response(JSON.stringify({ result }), { status: 200, headers: H });
  } catch (err) {
    console.error("CV generation error:", err);
    return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 500, headers: H });
  }
}
