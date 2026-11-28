export const config = { runtime: 'edge', regions: ['cdg1'] };
import { trackEvent } from '../_lib/track.js';
import { getCurrentUser, claimFreeGeneration, refundGeneration, sanitizeString, getAllowedOrigin, checkRateLimit, withTimeout } from '../_lib/auth.js';
import { nomDe } from '../_lib/competences.js';
import { SYSTEME, messageUtilisateur, lireReponse, validerSuggestions, questionsPour, motifsOffre, score } from '../_lib/adaptation.js';

// Adaptation guidée du CV (page /adapter) : des suggestions une par une, que
// le candidat accepte ou refuse. Les suggestions de l'IA ne sont montrées
// qu'après vérification par `validerSuggestions` (voir _lib/adaptation.js).

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' };
  const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { ...H, ...extra } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'adaptation-guidee', 20, 3600);
  if (!rl.allowed) return json({ error: 'Trop de demandes. Réessaie dans une heure.' }, 429, { 'Retry-After': '3600' });
  const user = await getCurrentUser(req);
  if (!user) return json({ error: 'Non authentifié' }, 401);
  const userRl = await checkRateLimit(`user:${user.email}`, 'adaptation-guidee', 15, 3600);
  if (!userRl.allowed) return json({ error: 'Limite atteinte. Réessaie dans une heure.' }, 429, { 'Retry-After': '3600' });

  const texte = await req.text();
  if (texte.length > 20000) return json({ error: 'Requête trop longue' }, 413);
  let body;
  try { body = JSON.parse(texte); } catch { return json({ error: 'Corps invalide' }, 400); }
  const cv = sanitizeString(body.cv, 9000);
  const offre = sanitizeString(body.offre, 8000);
  if (!cv || cv.length < 120 || !offre || offre.length < 40) return json({ error: 'CV et offre requis' }, 400);

  const gen = await claimFreeGeneration(user);
  if (!gen.allowed) return json({ error: 'Limite gratuite atteinte' }, 402);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { await refundGeneration(user); return json({ error: 'Service temporairement indisponible' }, 500); }

  try {
    const res = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' },
      body: JSON.stringify({
        model: user.plan === 'free' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
        max_tokens: 2500,
        temperature: 0,
        system: [{ type: 'text', text: SYSTEME, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: messageUtilisateur(cv, offre) }],
      }),
    }), 30000);
    if (!res.ok) {
      console.error('adaptation-guidee: IA', res.status);
      await refundGeneration(user);
      return json({ error: 'Erreur lors de la génération' }, 502);
    }
    const data = await res.json();
    const brut = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
    const lu = lireReponse(brut);
    if (!lu) { await refundGeneration(user); return json({ error: 'Réponse illisible, réessaie' }, 502); }

    const { gardees, ecartees } = validerSuggestions(lu.suggestions, cv);
    if (ecartees.length) console.warn('adaptation-guidee: suggestions écartées', JSON.stringify(ecartees.map((e) => e.motif)));
    const questions = questionsPour(offre, cv);
    trackEvent('cv_guided_adaptation', { plan: user.plan }).catch(() => {});
    return json({
      intro: String(lu.intro || '').slice(0, 400),
      suggestions: gardees,
      ecartees: ecartees.length,
      questions: questions.map((id) => ({ id, nom: nomDe(id) })),
      motifs: motifsOffre(offre),
      score: score(offre, cv),
    });
  } catch (err) {
    console.error('adaptation-guidee:', err);
    await refundGeneration(user);
    return json({ error: 'Erreur lors de la génération' }, 500);
  }
}
