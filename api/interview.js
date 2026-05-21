export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser } from './_lib/auth.js';

const LEVEL_LABELS = {
  junior: 'débutant (0-2 ans d\'expérience)',
  mid: 'confirmé (3-5 ans d\'expérience)',
  senior: 'senior (6+ ans d\'expérience)',
  lead: 'lead / manager',
};

function buildSystem(role, company, level) {
  const lvl = LEVEL_LABELS[level] || LEVEL_LABELS.mid;
  const context = company
    ? `pour le poste de ${role} chez ${company}`
    : `pour le poste de ${role}`;

  return `Tu es un recruteur RH senior qui conduit un entretien d'embauche en France ${context}, niveau ${lvl}.

Ta façon de procéder :
1. Commence par accueillir chaleureusement le candidat et poser une première question de présentation.
2. Après chaque réponse du candidat, donne un feedback court et constructif (1-2 phrases max, en italique).
3. Enchaîne immédiatement avec la question suivante pertinente.
4. Varie les types de questions : comportementales (méthode STAR), techniques, motivationnelles, situationnelles.
5. Adapte ton niveau d'exigence au profil ${lvl}.
6. Au bout de 6-8 échanges, propose un bilan de session.

Règles absolues :
- TOUJOURS en français
- Maximum 150 mots par réponse
- Une seule question à la fois
- Feedback en italique (_..._), question suivante en gras (**...**)
- Ton : professionnel, bienveillant, exigeant mais encourageant`;
}

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H_JSON = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
  const H_STREAM = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H_JSON, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H_JSON });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H_JSON });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'interview', 60, 3600);
  if (!rl.allowed) return new Response(
    JSON.stringify({ error: 'Trop de messages. Réessayez dans 1 heure.' }),
    { status: 429, headers: { ...H_JSON, 'Retry-After': '3600' } }
  );
  const userRl = await checkRateLimit(`user:${user.email}`, 'interview', 40, 3600);
  if (!userRl.allowed) return new Response(
    JSON.stringify({ error: 'Trop de messages. Réessayez dans 1 heure.' }),
    { status: 429, headers: { ...H_JSON, 'Retry-After': '3600' } }
  );

  const bodyText = await req.text();
  if (bodyText.length > 30000) return new Response(JSON.stringify({ error: 'Message trop long' }), { status: 413, headers: H_JSON });

  let body;
  try { body = JSON.parse(bodyText); }
  catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H_JSON }); }

  const role    = sanitizeString(body.role    || 'un poste', 150);
  const company = sanitizeString(body.company || '', 150);
  const level   = LEVEL_LABELS[body.level] ? body.level : 'mid';

  if (!Array.isArray(body.messages) || !body.messages.length)
    return new Response(JSON.stringify({ error: 'messages[] requis' }), { status: 400, headers: H_JSON });

  const messages = body.messages
    .slice(-20)
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: sanitizeString(String(m.content || ''), 4000),
    }))
    .filter(m => m.content);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service temporairement indisponible' }), { status: 500, headers: H_JSON });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: user.plan === 'free' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
        max_tokens: user.plan === 'free' ? 512 : 1024,
        stream: true,
        system: [{ type: 'text', text: buildSystem(role, company, level), cache_control: { type: 'ephemeral' } }],
        messages,
      }),
    });

    if (!res.ok) {
      console.error('Interview API error:', res.status);
      return new Response(JSON.stringify({ error: 'Erreur API' }), { status: 502, headers: H_JSON });
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
            try {
              const parsed = JSON.parse(line.slice(6));
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
    console.error('Interview error:', err);
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H_JSON });
  }
}
