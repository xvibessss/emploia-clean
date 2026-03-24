import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser, incrementGenerations, FREE_LIMIT } from "../_lib/auth.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Non authentifié" });

    if (user.plan === "free" && user.generationsUsed >= FREE_LIMIT) {
      return res.status(402).json({ error: "Limite gratuite atteinte" });
    }

    const { jobOffer, profile } = req.body;
    if (!jobOffer || !profile) {
      return res.status(400).json({ error: "Offre et profil requis" });
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      messages: [
        {
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
        },
      ],
    });

    const result = response.content[0].type === "text" ? response.content[0].text : "";
    await incrementGenerations(user);
    return res.json({ result });
  } catch (err) {
    console.error("CV generation error:", err);
    return res.status(500).json({ error: "Erreur lors de la génération" });
  }
}
