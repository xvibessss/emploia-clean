export const config = { runtime: 'edge' };
import { getAllowedOrigin, getCurrentUser, kvGet, withTimeout, checkRateLimit } from './_lib/auth.js';

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
    headers: { ...H, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: H });

  const rl = await checkRateLimit(`user:${user.email}`, 'weekly-report', 5, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const rawApps = await kvGet(`apps:${user.email}`);
  const apps = Array.isArray(rawApps) ? rawApps : [];

  const now = Date.now();
  const oneWeek = 7 * 86400000;
  const thisWeekApps = apps.filter(a => now - (a.createdAt || 0) < oneWeek);
  const totalApps = apps.length;
  const interviews = apps.filter(a => a.status === 'interview' || a.status === 'offer').length;
  const offers = apps.filter(a => a.status === 'offer').length;
  const pending = apps.filter(a => a.status === 'applied').length;
  const overdueRelances = apps.filter(a => a.status === 'applied' && now - (a.updatedAt || a.createdAt || 0) > 14 * 86400000).length;
  const rejections = apps.filter(a => a.status === 'rejected').length;
  const interviewRate = totalApps > 0 ? Math.round((interviews / totalApps) * 100) : 0;
  const responseRate = totalApps > 0 ? Math.round(((interviews + rejections) / totalApps) * 100) : 0;
  const topCompanies = [...new Set(apps.map(a => a.company).filter(Boolean))].slice(0, 3);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  const prompt = `Tu es un coach emploi expert bienveillant. Génère un rapport de recherche d'emploi hebdomadaire pour un candidat français.

DONNÉES :
- Total candidatures : ${totalApps}
- Nouvelles cette semaine : ${thisWeekApps.length}
- Entretiens obtenus : ${interviews}
- Offres reçues : ${offers}
- En attente de réponse : ${pending}
- Relances à faire (>14j) : ${overdueRelances}
- Taux d'entretien : ${interviewRate}%
- Taux de réponse : ${responseRate}%
- Refus reçus : ${rejections}
${topCompanies.length ? `- Entreprises ciblées : ${topCompanies.join(', ')}` : ''}

Génère un rapport hebdomadaire motivant avec des conseils actionnables.

Réponds UNIQUEMENT en JSON valide :
{
  "headline": "Titre accrocheur (max 12 mots, commence par un emoji)",
  "summary": "Résumé bienveillant en 2 phrases concrètes",
  "highlights": ["point positif 1", "point positif 2"],
  "actions": ["action prioritaire 1 (verbe d'action)", "action prioritaire 2", "action prioritaire 3"],
  "motivation": "Message motivant d'une phrase (style coach personnel)",
  "nextWeekGoal": "Objectif SMART concret pour la semaine prochaine"
}`;

  try {
    const res = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system: [{ type: 'text', text: 'Tu es un coach carrière expert et motivant. Tu analyses les candidatures de la semaine et fournis un bilan personnalisé. Réponds uniquement en JSON valide.', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      }),
    }), 20000);

    if (!res.ok) throw new Error('api_error');
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    let result;
    try { result = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { result = JSON.parse(m[0]); } catch {} }

    if (!result?.summary) throw new Error('no_result');

    return new Response(JSON.stringify({
      ...result,
      stats: { totalApps, thisWeek: thisWeekApps.length, interviews, offers, pending, overdueRelances, interviewRate, responseRate, rejections },
      generatedAt: new Date().toISOString(),
    }), { status: 200, headers: H });

  } catch {
    // Graceful fallback without AI
    return new Response(JSON.stringify({
      headline: `📊 ${thisWeekApps.length > 0 ? `+${thisWeekApps.length} candidatures cette semaine` : 'Votre bilan hebdomadaire'}`,
      summary: `Vous avez ${totalApps} candidature${totalApps !== 1 ? 's' : ''} au total${interviews > 0 ? ` avec ${interviews} entretien${interviews !== 1 ? 's' : ''} obtenus` : ''}. ${thisWeekApps.length > 0 ? 'Continuez sur cette dynamique !' : 'Chaque candidature compte.'}`,
      highlights: [
        interviews > 0 ? `${interviews} entretien${interviews !== 1 ? 's' : ''} décrochés` : 'Profil en cours de construction',
        thisWeekApps.length > 0 ? `+${thisWeekApps.length} envoyées cette semaine` : 'Continuez à postuler activement',
      ],
      actions: [
        overdueRelances > 0 ? `Relancer ${overdueRelances} candidature${overdueRelances !== 1 ? 's' : ''} sans réponse depuis +14 jours` : 'Identifier de nouvelles offres ciblées',
        'Préparer l\'entretien avec le simulateur IA Emploia',
        'Mettre à jour votre profil LinkedIn cette semaine',
      ],
      motivation: 'La régularité est la clé — chaque candidature vous rapproche du bon poste !',
      nextWeekGoal: `Viser ${Math.max(5, thisWeekApps.length + 2)} nouvelles candidatures et ${Math.max(1, overdueRelances)} relance${overdueRelances !== 1 ? 's' : ''}`,
      stats: { totalApps, thisWeek: thisWeekApps.length, interviews, offers, pending, overdueRelances, interviewRate, responseRate, rejections },
      generatedAt: new Date().toISOString(),
    }), { status: 200, headers: H });
  }
}
