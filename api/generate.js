export const config = { runtime: 'edge' };

const PROMPTS = {
  cv: (jobOffer, userProfile) => `Tu es un expert RH français spécialisé dans la rédaction de CV optimisés ATS pour le marché du travail français.

OFFRE D'EMPLOI :
${jobOffer}

PROFIL DU CANDIDAT :
${userProfile}

Ta mission : Rédige un CV professionnel complet et optimisé ATS en français.

Format de réponse OBLIGATOIRE (respecte exactement cette structure) :

NOM PRÉNOM
Titre du poste ciblé
Email | Téléphone | Ville | LinkedIn

── PROFIL ──
[2-3 phrases percutantes qui correspondent exactement au poste]

── EXPÉRIENCES PROFESSIONNELLES ──
[Poste] | [Entreprise] | [Dates]
• [Réalisation quantifiée avec les mots-clés de l'offre]
• [Réalisation quantifiée]
• [Réalisation quantifiée]

── FORMATION ──
[Diplôme] | [École] | [Année]

── COMPÉTENCES ──
Techniques : [liste des compétences techniques de l'offre]
Outils : [liste des outils]
Langues : [langues]

── SCORE ATS ──
Score : [X]/100
Mots-clés intégrés : [liste des mots-clés de l'offre utilisés]
Points forts : [2-3 points]
À améliorer : [1-2 suggestions si besoin]

Adapte le contenu du profil candidat à l'offre. Quantifie les réalisations. Utilise les mots-clés exacts de l'offre.`,

  lettre: (jobOffer, userProfile) => `Tu es un expert en recrutement français qui rédige des lettres de motivation percutantes pour le marché français.

OFFRE D'EMPLOI :
${jobOffer}

PROFIL DU CANDIDAT :
${userProfile}

Ta mission : Rédige une lettre de motivation professionnelle, personnalisée et percutante en français.

Format OBLIGATOIRE :

[Ville], le [date du jour]

Objet : Candidature au poste de [titre exact de l'offre]

Madame, Monsieur,

[Accroche percutante qui montre que tu connais l'entreprise et le poste — 2-3 phrases]

[Paragraphe 1 - Pourquoi ce poste m'intéresse : lien entre le poste et ta motivation, 3-4 phrases]

[Paragraphe 2 - Ce que tu apportes : 2-3 réalisations concrètes et quantifiées du profil qui répondent aux besoins de l'offre]

[Paragraphe 3 - Pourquoi cette entreprise spécifiquement : montre que tu as fait des recherches, 2-3 phrases]

[Formule de politesse professionnelle]

[Prénom Nom]

La lettre doit faire environ 300-350 mots. Ton naturel, accrocheur, professionnel. Pas de formules creuses.`,

  ats: (jobOffer, userProfile) => `Tu es un expert ATS (Applicant Tracking System) spécialisé dans l'analyse de candidatures pour le marché français.

OFFRE D'EMPLOI :
${jobOffer}

CV / PROFIL DU CANDIDAT :
${userProfile}

Ta mission : Analyse la compatibilité ATS et fournis un rapport détaillé.

Format OBLIGATOIRE :

SCORE ATS GLOBAL : [X]/100

📊 ANALYSE DÉTAILLÉE

Mots-clés présents (✅) :
[liste des mots-clés de l'offre présents dans le profil]

Mots-clés manquants (❌) :
[liste des mots-clés importants de l'offre absents du profil]

📋 RAPPORT PAR CRITÈRE

Titre/Poste : [score /20] — [commentaire]
Compétences techniques : [score /25] — [commentaire]
Expérience requise : [score /25] — [commentaire]
Formation : [score /15] — [commentaire]
Mots-clés généraux : [score /15] — [commentaire]

🎯 RECOMMANDATIONS PRIORITAIRES

1. [Action concrète à faire en premier — la plus impactante]
2. [Deuxième action]
3. [Troisième action]
4. [Quatrième action si besoin]

💡 PHRASES À AJOUTER DANS LE CV
[2-3 exemples de phrases optimisées avec les mots-clés manquants]

Sois précis, actionnable, et bienveillant. Le candidat veut savoir exactement quoi changer.`
};

export default async function handler(req) {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers });
  }

  const { type, jobOffer, userProfile } = body;

  if (!type || !jobOffer || !userProfile) {
    return new Response(JSON.stringify({ error: 'Paramètres manquants : type, jobOffer, userProfile requis' }), { status: 400, headers });
  }

  if (!['cv', 'lettre', 'ats'].includes(type)) {
    return new Response(JSON.stringify({ error: 'Type invalide. Valeurs acceptées : cv, lettre, ats' }), { status: 400, headers });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Clé API non configurée' }), { status: 500, headers });
  }

  const prompt = PROMPTS[type](jobOffer.trim(), userProfile.trim());

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return new Response(JSON.stringify({ error: 'Erreur API Anthropic', details: err }), { status: 502, headers });
    }

    const data = await response.json();
    const result = data.content?.[0]?.text ?? '';

    return new Response(JSON.stringify({ success: true, result, type }), { status: 200, headers });

  } catch (err) {
    console.error('Fetch error:', err);
    return new Response(JSON.stringify({ error: 'Erreur réseau', details: String(err) }), { status: 500, headers });
  }
}
