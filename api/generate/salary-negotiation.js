export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, withTimeout, getCurrentUser } from '../_lib/auth.js';

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });
  if (!user.plan || user.plan === 'free') return new Response(JSON.stringify({ error: 'Abonnement Pro requis' }), { status: 403, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'salary-neg', 10, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });
  const userRl = await checkRateLimit(`user:${user.email}`, 'salary-neg', 8, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const jobTitle    = sanitizeString(body.jobTitle    || '', 200);
  const company     = sanitizeString(body.company     || '', 200);
  const offerAmount = Math.min(Math.max(parseInt(body.offerAmount) || 0, 0), 999999);
  const targetAmount = Math.min(Math.max(parseInt(body.targetAmount) || 0, 0), 999999);
  const experience  = sanitizeString(body.experience  || '', 1000);
  const senderName  = sanitizeString(body.senderName  || '', 100);

  if (!jobTitle) return new Response(JSON.stringify({ error: 'Poste requis' }), { status: 400, headers: H });
  if (targetAmount > 0 && offerAmount > 0 && targetAmount <= offerAmount) {
    return new Response(JSON.stringify({ error: 'Le salaire cible doit être supérieur à l\'offre' }), { status: 400, headers: H });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  const salaryContext = offerAmount > 0
    ? `Offre reçue : ${offerAmount.toLocaleString('fr-FR')}€ brut annuel${targetAmount > 0 ? `\nSalaire cible : ${targetAmount.toLocaleString('fr-FR')}€ brut annuel` : ''}`
    : 'Pas de montant précisé — génère un script générique pour aborder la négociation';

  const prompt = `Tu es un expert en négociation salariale sur le marché français. Aide ce candidat à négocier son salaire avec tact et efficacité.

CONTEXTE :
- Poste : ${jobTitle}
- Entreprise : ${company || 'Non précisée'}
- ${salaryContext}
- Expérience / arguments : ${experience || 'Non précisés'}
- Nom du candidat : ${senderName || '[Prénom Nom]'}

Génère un kit complet de négociation adapté au marché français (où la négociation salariale est culturellement plus délicate qu'aux USA).

Réponds UNIQUEMENT en JSON valide :
{
  "email": "Email de négociation complet — professionnel, confiant sans être agressif, avec arguments concrets. Commence par remercier pour l'offre, exprime l'enthousiasme pour le poste, présente la demande avec justification, propose un appel pour en discuter.",
  "script": "Script pour négocier en appel téléphonique ou en entretien — 4-5 répliques clés avec les tournures françaises appropriées",
  "arguments": ["Argument solide à mettre en avant 1", "Argument 2 (données marché, compétences rares, etc.)", "Argument 3"],
  "counterArguments": [
    {"objection": "Objection probable de l'employeur", "reponse": "Réponse tactique à donner"},
    {"objection": "Objection 2", "reponse": "Réponse 2"}
  ],
  "marketContext": "Contexte marché pour ce poste en France : fourchette habituelle, tension offre/demande, levier de négociation principal",
  "redLines": ["Ce qu'il ne faut surtout pas dire ou faire 1", "Point 2"],
  "alternatives": ["Si le salaire est bloqué, alternative à négocier 1 (ex: prime, télétravail, titre)", "Alternative 2"]
}`;

  try {
    const res = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1800,
        system: [{ type: 'text', text: 'Tu es un expert en négociation salariale pour le marché français. Tu aides les candidats à négocier leur salaire avec tact. Réponds uniquement en JSON valide.', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      }),
    }), 25000);

    if (!res.ok) return new Response(JSON.stringify({ error: 'Erreur API' }), { status: 502, headers: H });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    let result;
    try { result = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { result = JSON.parse(m[0]); } catch {} }

    if (!result?.email) return new Response(JSON.stringify({ error: 'Réponse invalide' }), { status: 500, headers: H });
    return new Response(JSON.stringify(result), { status: 200, headers: H });
  } catch {
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H });
  }
}
