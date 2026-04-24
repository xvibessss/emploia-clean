export const config = { runtime: 'edge' };

const SYSTEM_DEFAULT = `Tu es Orion, le copilote IA d'Emploia — le seul assistant de recherche d'emploi 100% spécialisé sur le marché français.

Ton expertise couvre :
- Optimisation CV et lettres pour les ATS français (SAP SuccessFactors, Talentsoft, Workday)
- Préparation aux entretiens (STAR, pitch, questions pièges)
- Négociation salariale selon les grilles françaises (APEC, conventions collectives)
- Marché du travail : secteurs qui recrutent, codes RH français, CDI/CDD/alternance/stage
- LinkedIn et personal branding pour le marché français
- Reconversion professionnelle et bilan de compétences

Style : bienveillant, direct, concret. Donne des conseils actionnables immédiatement.
Tu réponds TOUJOURS en français, en moins de 200 mots sauf si on te demande quelque chose de long.
Si la question porte sur la génération d'un CV ou d'une lettre complète, invite à utiliser l'outil dans /app.`;

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

  const { messages, system_override } = body;
  if (!Array.isArray(messages) || !messages.length)
    return new Response(JSON.stringify({ error: 'messages[] requis' }), { status: 400, headers: H });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY manquante' }), { status: 500, headers: H });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: system_override || SYSTEM_DEFAULT,
        messages: messages.slice(-12),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: 'Erreur API', details: err.slice(0,200) }), { status: 502, headers: H });
    }

    const data = await res.json();
    const reply = data.content?.[0]?.text ?? '';
    return new Response(JSON.stringify({ reply }), { status: 200, headers: H });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur réseau', details: String(err).slice(0,200) }), { status: 500, headers: H });
  }
}
