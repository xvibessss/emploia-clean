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
      model: "claude-haiku-4-5",
      max_tokens: 8192,
      messages: [
        {
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
        },
      ],
    });

    const result = response.content[0].type === "text" ? response.content[0].text : "";
    await incrementGenerations(user);
    return res.json({ result });
  } catch (err) {
    console.error("Cover letter error:", err);
    return res.status(500).json({ error: "Erreur lors de la génération" });
  }
}
