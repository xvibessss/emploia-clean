export const config = { runtime: 'edge' };

const SYSTEM = `Tu es un expert RH français senior avec 15 ans d'expérience en recrutement. Tu maîtrises parfaitement les ATS utilisés en France (SAP SuccessFactors, Talentsoft, Workday, Greenhouse), les codes du marché du travail français, et la rédaction de documents de candidature percutants. Tu réponds toujours en français.`;

const PROMPTS = {
  cv: (job, profile) => `OFFRE D'EMPLOI :
${job}

PROFIL CANDIDAT :
${profile}

Rédige un CV professionnel complet, ATS-optimisé pour ce poste précis.

FORMAT OBLIGATOIRE (respecte exactement cette structure) :

═══════════════════════════════════════
[PRÉNOM NOM]
[Titre du poste ciblé — max 80 caractères]
📧 email@exemple.com | 📱 06 XX XX XX XX | 📍 Ville | 💼 linkedin.com/in/profil
═══════════════════════════════════════

▌ PROFIL PROFESSIONNEL
[2-3 phrases d'accroche ultra-ciblées qui reprennent exactement les termes de l'offre. Quantifie si possible.]

▌ EXPÉRIENCES PROFESSIONNELLES

[Intitulé exact du poste] | [Entreprise] | [Ville] | [MM/AAAA – MM/AAAA]
• [Réalisation 1 quantifiée avec verbe d'action fort + chiffre + contexte]
• [Réalisation 2 avec mots-clés de l'offre]
• [Réalisation 3 impactante]

[Poste précédent] | [Entreprise] | [Ville] | [MM/AAAA – MM/AAAA]
• [Réalisation quantifiée]
• [Réalisation]

▌ FORMATION
[Diplôme + spécialité] | [École/Université] | [Ville] | [Année]
[Certifications, formations complémentaires si pertinentes]

▌ COMPÉTENCES CLÉS
Techniques : [liste séparée par " · " — reprendre les compétences de l'offre]
Outils : [outils logiciels mentionnés dans l'offre]
Soft skills : [3-4 compétences comportementales clés pour ce poste]
Langues : [Français (natif), Anglais (niveau), ...]

▌ SCORE ATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Score global : [X]/100
━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Mots-clés présents : [liste des mots-clés de l'offre intégrés]
📋 Recommandations : [2 points d'amélioration concrets]`,

  lettre: (job, profile) => `OFFRE D'EMPLOI :
${job}

PROFIL CANDIDAT :
${profile}

Rédige une lettre de motivation professionnelle, percutante et personnalisée.

FORMAT OBLIGATOIRE :

[Prénom Nom]
[Ville], le ${new Date().toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}

Objet : Candidature au poste de [titre exact de l'offre] — Réf. [ref si mentionnée]

Madame, Monsieur,

[ACCROCHE — 1-2 phrases qui montrent que tu as fait tes recherches sur l'entreprise et que tu sais exactement pourquoi ce poste t'intéresse. Sois spécifique, jamais générique.]

[PARAGRAPHE 1 — POURQUOI VOUS ? 3-4 phrases. Présente ta valeur ajoutée unique pour CE poste précis. Cite 1-2 réalisations concrètes et chiffrées directement liées aux missions de l'offre.]

[PARAGRAPHE 2 — POURQUOI EUX ? 2-3 phrases. Montre ta connaissance de l'entreprise : un projet récent, leur culture, leur mission, ce qui t'attire vraiment. Sois précis.]

[PARAGRAPHE 3 — PROJECTION. 2 phrases. Comment tu vas contribuer concrètement dès les premiers mois.]

Dans l'attente de vous rencontrer pour échanger sur ma candidature, je reste disponible pour tout entretien à votre convenance.

Cordialement,
[Prénom Nom]
📱 [téléphone] | 📧 [email]

[285-320 mots. Ton naturel, professionnel, jamais robot. Zéro formule creuse.]`,

  ats: (job, profile) => `OFFRE D'EMPLOI :
${job}

CV / PROFIL DU CANDIDAT :
${profile}

Analyse la compatibilité ATS en détail et fournis un rapport complet.

FORMAT OBLIGATOIRE :

┌─────────────────────────────────────┐
│  SCORE ATS GLOBAL : [X]/100         │
│  [████████░░] Niveau : [Bon/Moyen]  │
└─────────────────────────────────────┘

📊 ANALYSE PAR CRITÈRE

Titre/Intitulé de poste    [XX]/20  [████████░░]
Compétences techniques     [XX]/25  [██████████]
Expérience requise         [XX]/20  [████░░░░░░]
Formation & diplômes       [XX]/15  [████████░░]
Mots-clés & vocabulaire    [XX]/20  [██████░░░░]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ MOTS-CLÉS PRÉSENTS (points forts)
[Liste des mots-clés de l'offre déjà dans le profil]

❌ MOTS-CLÉS MANQUANTS (à ajouter en priorité)
[Liste des mots-clés importants absents]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 ACTIONS PRIORITAIRES

1. [Action la plus impactante — formulation exacte à utiliser dans le CV]
2. [Deuxième action avec exemple concret]
3. [Troisième action]
4. [Quatrième action]

💡 PHRASES OPTIMISÉES À COPIER-COLLER

"[Phrase 1 avec les mots-clés manquants intégrés naturellement]"
"[Phrase 2]"
"[Phrase 3]"

⚡ VERDICT
[3-4 phrases de conclusion bienveillante avec les 2 points les plus urgents à corriger]`,

  linkedin: (job, profile) => `POSTE CIBLÉ :
${job}

PROFIL CANDIDAT :
${profile}

Génère un profil LinkedIn complet et optimisé pour ce secteur.

FORMAT OBLIGATOIRE :

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TITRE LINKEDIN (max 220 caractères)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Titre accrocheur : Fonction | Spécialité | Valeur ajoutée | Secteur]
Exemple de format : "Product Manager | Growth & Data Analytics | SaaS B2B | Open to work"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 RÉSUMÉ "À PROPOS" (max 2 000 caractères)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Accroche — 1 phrase forte qui résume ta valeur unique]

[Paragraphe 1 — Qui tu es, ton expertise clé, ton secteur. 2-3 phrases.]

[Paragraphe 2 — Tes 2-3 réalisations les plus impressionnantes, chiffrées.]

[Paragraphe 3 — Ce que tu recherches et ce que tu apportes.]

🔑 Compétences clés : [mot-clé 1] · [mot-clé 2] · [mot-clé 3] · [mot-clé 4] · [mot-clé 5]

📩 Parlons-en : [email ou "Message LinkedIn"]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 TOP 10 COMPÉTENCES À AJOUTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Liste numérotée des 10 compétences LinkedIn les plus pertinentes pour ce secteur]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 MESSAGE DE CONNEXION (max 300 caractères)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Message naturel, personnalisé, qui donne envie de répondre]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 3 CONSEILS PERSONNALISÉS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. [Conseil spécifique à ce profil/secteur]
2. [Conseil]
3. [Conseil]`
};

const H = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const { type, jobOffer, userProfile } = body;
  if (!type || !jobOffer?.trim() || !userProfile?.trim())
    return new Response(JSON.stringify({ error: 'Paramètres manquants : type, jobOffer, userProfile requis' }), { status: 400, headers: H });
  if (!['cv','lettre','ats','linkedin'].includes(type))
    return new Response(JSON.stringify({ error: 'Type invalide. Valeurs : cv, lettre, ats, linkedin' }), { status: 400, headers: H });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY manquante dans les variables Vercel' }), { status: 500, headers: H });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2500,
        system: SYSTEM,
        messages: [{ role: 'user', content: PROMPTS[type](jobOffer.trim(), userProfile.trim()) }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: 'Erreur Anthropic API', details: err.slice(0,300) }), { status: 502, headers: H });
    }

    const data = await res.json();
    const result = data.content?.[0]?.text ?? '';
    if (!result) return new Response(JSON.stringify({ error: 'Réponse vide de l\'IA' }), { status: 502, headers: H });

    return new Response(JSON.stringify({ success: true, result, type }), { status: 200, headers: H });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur réseau', details: String(err).slice(0,200) }), { status: 500, headers: H });
  }
}
