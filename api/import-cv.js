export const config = { runtime: 'edge' };
import { checkRateLimit, getAllowedOrigin } from './_lib/auth.js';

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

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'import-cv', 5, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. 5 imports/heure max.' }), { status: 429, headers: H });

  const bodyText = await req.text();
  if (bodyText.length > 4_500_000) return new Response(JSON.stringify({ error: 'Fichier trop volumineux (max 3 MB)' }), { status: 413, headers: H });

  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }
  if (!body?.pdfBase64) return new Response(JSON.stringify({ error: 'pdfBase64 requis' }), { status: 400, headers: H });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: body.pdfBase64 },
            },
            {
              type: 'text',
              text: `Extrais les informations de ce CV. Réponds UNIQUEMENT en JSON valide sans markdown ni backtick :
{"firstName":"","lastName":"","email":"","phone":"","title":"","location":"","summary":"","skills":[""],"experience":[{"title":"","company":"","period":"","description":""}],"education":[{"degree":"","school":"","year":""}],"languages":[""],"linkedin":"","portfolio":""}
Règles : ne laisse aucun champ vide si l'info est présente. Max 3 expériences, 3 formations, 12 compétences. summary en français, 2-3 phrases max.`,
            },
          ],
        }],
      }),
    });

    if (!res.ok) return new Response(JSON.stringify({ error: 'Erreur analyse PDF' }), { status: 502, headers: H });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    let result;
    try { result = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) try { result = JSON.parse(m[0]); } catch {}
    }

    if (!result) return new Response(JSON.stringify({ error: 'Impossible de parser le CV' }), { status: 500, headers: H });
    return new Response(JSON.stringify(result), { status: 200, headers: H });

  } catch (err) {
    console.error('import-cv error:', err);
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H });
  }
}
