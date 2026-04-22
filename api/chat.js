export const config = { runtime: 'edge' };

const SYSTEM = `Tu es Orion, le copilote IA d'Emploia — l'assistant de recherche d'emploi 100% français.

Tu aides les candidats français à :
- Optimiser leur CV et le rendre ATS-ready
- Rédiger des lettres de motivation percutantes  
- Préparer leurs entretiens d'embauche
- Comprendre le marché du travail français
- Négocier leur salaire
- Optimiser leur profil LinkedIn
- Choisir entre plusieurs offres d'emploi
- Gérer le stress de la recherche d'emploi

Style : bienveillant, direct, actionnable. Tu donnes des conseils concrets et personnalisés. Tu connais parfaitement les codes du marché du travail français (APEC, France Travail, secteurs porteurs, codes RH, ATS comme SAP SuccessFactors et Talentsoft). Tu réponds toujours en français.

Si on te demande de générer un CV ou une lettre complète, redirige vers /app.`;

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

  const { messages } = body;
  if (!messages || !Array.isArray(messages)) return new Response(JSON.stringify({ error: 'messages requis' }), { status: 400, headers });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Clé API manquante' }), { status: 500, headers });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: SYSTEM,
        messages: messages.slice(-10), // keep last 10 messages for context
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: 'Erreur API', details: err }), { status: 502, headers });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text ?? '';
    return new Response(JSON.stringify({ reply }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers });
  }
}
