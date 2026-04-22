export const config = { runtime: 'edge' };

const PROMPTS = {
  cv: (jobOffer, userProfile) => `Tu es un expert RH français spécialisé dans la rédaction de CV optimisés ATS pour le marché du travail français.

OFFRE D'EMPLOI :
${jobOffer}

PROFIL DU CANDIDAT :
${userProfile}

Ta mission : Rédige un CV professionnel complet et optimisé ATS en français.

Format OBLIGATOIRE :

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
Mots-clés intégrés : [liste]
Points forts : [2-3 points]
À améliorer : [1-2 suggestions]

Adapte tout le contenu à l'offre. Quantifie les réalisations. Utilise les mots-clés exacts.`,

  lettre: (jobOffer, userProfile) => `Tu es un expert en recrutement français qui rédige des lettres de motivation percutantes.

OFFRE D'EMPLOI :
${jobOffer}

PROFIL DU CANDIDAT :
${userProfile}

Rédige une lettre de motivation professionnelle et percutante en français.

Format OBLIGATOIRE :

[Ville], le ${new Date().toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'})}

Objet : Candidature au poste de [titre exact de l'offre]

Madame, Monsieur,

[Accroche percutante — 2-3 phrases qui montrent que tu connais l'entreprise et le poste]

[Paragraphe 1 - Pourquoi ce poste : lien entre le poste et ta motivation, 3-4 phrases]

[Paragraphe 2 - Ce que tu apportes : 2-3 réalisations concrètes et quantifiées]

[Paragraphe 3 - Pourquoi cette entreprise : recherches faites, culture, mission, 2-3 phrases]

Dans l'attente de vous rencontrer, je reste à votre disposition pour tout entretien.

Cordialement,
[Prénom Nom]

~300-350 mots. Ton naturel et professionnel. Zéro formule creuse.`,

  ats: (jobOffer, userProfile) => `Tu es un expert ATS spécialisé dans l'analyse de candidatures pour le marché français.

OFFRE D'EMPLOI :
${jobOffer}

CV / PROFIL :
${userProfile}

Analyse la compatibilité ATS et fournis un rapport détaillé.

Format OBLIGATOIRE :

SCORE ATS GLOBAL : [X]/100

📊 ANALYSE DÉTAILLÉE

Mots-clés présents (✅) :
[liste des mots-clés de l'offre présents dans le profil]

Mots-clés manquants (❌) :
[liste des mots-clés importants absents du profil]

📋 RAPPORT PAR CRITÈRE

Titre/Poste : [score /20] — [commentaire]
Compétences techniques : [score /25] — [commentaire]
Expérience requise : [score /25] — [commentaire]
Formation : [score /15] — [commentaire]
Mots-clés généraux : [score /15] — [commentaire]

🎯 RECOMMANDATIONS PRIORITAIRES

1. [Action concrète — la plus impactante]
2. [Deuxième action]
3. [Troisième action]
4. [Quatrième action si besoin]

💡 PHRASES À AJOUTER DANS LE CV
[2-3 exemples de phrases optimisées avec les mots-clés manquants]

Sois précis, actionnable, et bienveillant.`,

  linkedin: (jobOffer, userProfile) => `Tu es un expert LinkedIn et personal branding pour le marché français.

PROFIL DU CANDIDAT :
${userProfile}

POSTE CIBLÉ :
${jobOffer}

Rédige un profil LinkedIn complet et optimisé.

Format OBLIGATOIRE :

🎯 TITRE LINKEDIN
[Titre accrocheur 120 caractères max — poste + valeur ajoutée + mots-clés]

📝 RÉSUMÉ (About)
[3-4 paragraphes percutants, 2000 caractères max]
- Paragraphe 1 : Qui tu es et ta valeur unique
- Paragraphe 2 : Tes réalisations clés quantifiées  
- Paragraphe 3 : Ce que tu recherches / ta vision
- Appel à l'action final

🔑 COMPÉTENCES TOP 5
[5 compétences LinkedIn à ajouter en priorité pour ce secteur]

💬 ACCROCHE MESSAGE DE CONNEXION
[Message de connexion de 300 caractères max, naturel et personnalisé]

📌 CONSEILS PERSONNALISÉS
[3 conseils spécifiques pour optimiser le profil pour ce poste]`
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers }); }

  const { type, jobOffer, userProfile } = body;
  if (!type || !jobOffer || !userProfile) return new Response(JSON.stringify({ error: 'Paramètres manquants' }), { status: 400, headers });
  if (!['cv', 'lettre', 'ats', 'linkedin'].includes(type)) return new Response(JSON.stringify({ error: 'Type invalide' }), { status: 400, headers });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Clé API manquante — configure ANTHROPIC_API_KEY dans Vercel' }), { status: 500, headers });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: PROMPTS[type](jobOffer.trim(), userProfile.trim()) }],
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
