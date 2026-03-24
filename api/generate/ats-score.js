import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser, incrementGenerations, FREE_LIMIT } from "../_lib/auth.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  if (user.plan === "free" && user.generationsUsed >= FREE_LIMIT) {
    return res.status(402).json({ error: "Limite gratuite atteinte" });
  }

  const { cvText, jobOffer } = req.body;
  if (!cvText || !jobOffer) {
    return res.status(400).json({ error: "CV et offre requis" });
  }

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8192,
    messages: [
      {
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
      },
    ],
  });

  const result = response.content[0].type === "text" ? response.content[0].text : "";
  await incrementGenerations(user);
  return res.json({ result });
}
