export const config = { runtime: 'edge' };
import { getCurrentUser, incrementGenerations, getGenerationsUsed, FREE_LIMIT, sanitizeString, getAllowedOrigin, checkRateLimit } from "../_lib/auth.js";

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H_JSON = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" };
  const H_STREAM = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...H_JSON, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: H_JSON });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'generate-lm', 20, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de générations. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H_JSON, 'Retry-After': '3600' } });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: H_JSON });

  const userRl = await checkRateLimit(`user:${user.email}`, 'generate-lm', 15, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Limite de génération atteinte. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H_JSON, 'Retry-After': '3600' } });

  const bodyText = await req.text();
  if (bodyText.length > 20000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H_JSON });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers: H_JSON }); }

  const jobOffer = sanitizeString(body.jobOffer, 8000);
  const profile = sanitizeString(body.profile, 8000);
  if (!jobOffer || !profile) return new Response(JSON.stringify({ error: "Offre et profil requis" }), { status: 400, headers: H_JSON });

  const profileHints = {
    'jeune-diplome': 'Le candidat est un jeune diplômé. Mets en avant sa formation, ses projets académiques et sa motivation.',
    'experience': 'Le candidat est en poste et cherche discrètement. Valorise ses réalisations chiffrées et son expertise.',
    'reconversion': 'Le candidat est en reconversion. Montre les compétences transférables et l\'enthousiasme pour le nouveau domaine.',
    'recherche': 'Le candidat est en recherche active. Optimise la lettre pour un impact maximum dès la première lecture.',
  };
  const profileHint = profileHints[body.profileType] || '';

  if (user.plan === "free") {
    const freshCount = await getGenerationsUsed(user.email);
    const used = freshCount !== null ? freshCount : user.generationsUsed;
    if (used >= FREE_LIMIT) return new Response(JSON.stringify({ error: "Limite gratuite atteinte" }), { status: 402, headers: H_JSON });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "Service temporairement indisponible" }), { status: 500, headers: H_JSON });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(40000),
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "prompt-caching-2024-07-31" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        stream: true,
        system: [{ type: 'text', text: "Tu es un expert en rédaction de lettres de motivation professionnelles pour le marché français. Tu génères des lettres percutantes, personnalisées et authentiques.", cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: "user",
          content: `Tu es un expert en rédaction de lettres de motivation en France.

OFFRE D'EMPLOI:
${jobOffer}

PROFIL DU CANDIDAT:
${profile}${profileHint ? `\n\nCONTEXTE CANDIDAT: ${profileHint}` : ''}

Génère une lettre de motivation professionnelle et personnalisée en français. Elle doit:
- Commencer par les coordonnées du candidat, la date, les coordonnées de l'entreprise et l'objet
- Avoir une accroche percutante qui montre que tu connais l'entreprise
- Développer 3 arguments forts qui montrent pourquoi le candidat est parfait pour CE poste
- Utiliser les termes exacts de l'offre d'emploi
- Être authentique et ne pas ressembler à une lettre générique
- Se terminer par une phrase de conclusion professionnelle et une signature
- Faire entre 300 et 400 mots
- Utiliser le vouvoiement

Commence directement par la lettre, sans commentaires.`,
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Cover letter error:", res.status, err.slice(0, 200));
      return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 502, headers: H_JSON });
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
                await incrementGenerations(user);
                await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              }
            } catch {}
          }
        }
      } catch (err) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'Erreur de génération' })}\n\n`)).catch(() => {});
      } finally {
        await writer.close().catch(() => {});
      }
    })();

    return new Response(readable, { status: 200, headers: H_STREAM });
  } catch (err) {
    console.error("Cover letter error:", err);
    return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 500, headers: H_JSON });
  }
}
