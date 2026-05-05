export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin } from './_lib/auth.js';

const SYSTEM = `Tu es Orion, le copilote IA d'Emploia — le seul assistant de candidature 100% spécialisé sur le marché français.

Ton expertise :
- Optimisation CV et lettres pour ATS français (SAP SuccessFactors, Talentsoft, Workday, Greenhouse)
- Préparation entretiens : méthode STAR, pitch 2 minutes, questions pièges, cas pratiques
- Négociation salariale selon grilles françaises (APEC, conventions collectives, secteurs)
- Marché emploi FR : secteurs porteurs, codes RH, CDI/CDD/alternance/stage/freelance
- LinkedIn et personal branding pour recruteurs français
- Reconversion, bilan de compétences, VAE

Style : bienveillant, direct, concret, jamais condescendant. Conseils actionnables immédiatement.
Réponds TOUJOURS en français. Réponds en moins de 180 mots sauf si tu génères un document complet.
Format : utilise des listes à puces pour les points clés, du gras pour l'essentiel.
Si on demande un CV/lettre complet : invite à utiliser /app pour un résultat optimisé ATS.`;

function getHeaders(req, stream=false) {
  const origin = getAllowedOrigin(req);
  const base = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' };
  return stream
    ? { ...base, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' }
    : { ...base, 'Content-Type': 'application/json' };
}
let H_STREAM = {}, H_JSON = {};

export default async function handler(req) {
  H_STREAM = getHeaders(req, true);
  H_JSON = getHeaders(req, false);
  const origin = getAllowedOrigin(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H_JSON });

  // Body size limit (20KB max for chat)
  const bodyText = await req.text();
  if (bodyText.length > 20000)
    return new Response(JSON.stringify({ error: 'Message trop long' }), { status: 413, headers: H_JSON });
  let body;
  try { body = JSON.parse(bodyText); }
  catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H_JSON }); }

  // Rate limit: 30 messages/hour per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'chat', 30, 3600);
  if (!rl.allowed)
    return new Response(JSON.stringify({ error: 'Trop de messages. Réessayez dans 1 heure.' }), {
      status: 429, headers: { ...H_JSON, 'Retry-After': '3600' }
    });

  const { system_override } = body;
  const rawMessages = body.messages;
  if (!Array.isArray(rawMessages) || !rawMessages.length)
    return new Response(JSON.stringify({ error: 'messages[] requis' }), { status: 400, headers: H_JSON });

  // Sanitize messages — max 16 messages, each truncated to 4000 chars
  const messages = rawMessages.slice(-16).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: sanitizeString(String(m.content || ''), 4000),
  })).filter(m => m.content);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service temporairement indisponible' }), { status: 500, headers: H_JSON });

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
        max_tokens: 1024,
        stream: true,
        system: system_override || SYSTEM,
        messages: messages.slice(-16),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: 'Erreur API', details: err.slice(0, 200) }), { status: 502, headers: H_JSON });
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ chunk: parsed.delta.text })}\n\n`));
              }
              if (parsed.type === 'message_stop') {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              }
            } catch {}
          }
        }
      } finally {
        await writer.close().catch(() => {});
      }
    })();

    return new Response(readable, { status: 200, headers: H_STREAM });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur réseau', details: String(err).slice(0, 200) }), { status: 500, headers: H_JSON });
  }
}
