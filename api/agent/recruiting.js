export const config = { runtime: 'edge' };
import { kvGet, kvSet, kvSmembers, htmlEscape } from '../_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

const SYSTEM = `Tu es un agent de recrutement IA d'Emploia. Pour chaque candidat, tu analyses son profil et les offres d'emploi disponibles pour identifier les meilleures correspondances.

Pour chaque offre pertinente, génère une phrase de match personnalisée (max 20 mots) qui explique pourquoi cette offre correspond au profil du candidat. Sois concret et spécifique (compétences, secteur, niveau).

Réponds UNIQUEMENT avec un JSON valide, aucun texte avant ou après :
{
  "jobs": [
    { "index": 0, "score": 8.5, "reason": "Correspond à votre expérience React et votre recherche de startup SaaS" },
    ...
  ]
}
Les scores vont de 0 à 10. N'inclus que les offres avec score ≥ 6.`;

async function fetchJobsForProfile(profile) {
  const keywords = [
    profile.targetRole || profile.jobTitle || '',
    profile.skills?.slice(0, 2).join(' ') || '',
  ].filter(Boolean).join(' ').trim() || 'développeur';

  try {
    const params = new URLSearchParams({ search: keywords });
    if (profile.location) params.set('location', profile.location);
    const res = await fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).slice(0, 10).map((j, i) => ({
      index: i,
      title: j.title || '',
      company: j.company_name || '',
      location: j.location || '',
      url: j.url || `${BASE_URL}/jobs`,
      remote: !!j.remote,
      description: (j.description || '').slice(0, 200),
    }));
  } catch { return []; }
}

async function scoreJobsWithClaude(profile, jobs, apiKey) {
  if (!jobs.length) return [];

  const profileSummary = [
    profile.targetRole && `Poste recherché : ${profile.targetRole}`,
    profile.experience && `Expérience : ${profile.experience} ans`,
    profile.skills?.length && `Compétences : ${profile.skills.slice(0, 5).join(', ')}`,
    profile.sector && `Secteur : ${profile.sector}`,
    profile.location && `Ville : ${profile.location}`,
  ].filter(Boolean).join('\n');

  const jobsList = jobs.map(j =>
    `[${j.index}] ${j.title} chez ${j.company} (${j.location}${j.remote ? ', télétravail' : ''}) — ${j.description}`
  ).join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `PROFIL CANDIDAT :\n${profileSummary}\n\nOFFRES À ANALYSER :\n${jobsList}`,
        }],
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    const parsed = JSON.parse(text);
    return parsed.jobs || [];
  } catch { return []; }
}

function jobEmailCard(job, reason) {
  const loc = [htmlEscape(job.location), job.remote ? '🏠 Télétravail' : ''].filter(Boolean).join(' · ');
  return `
<a href="${htmlEscape(job.url)}" style="display:block;padding:16px;background:#f8fafc;border-radius:12px;text-decoration:none;margin-bottom:10px;border:1px solid #e2e8f0;transition:all .2s">
  <div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:3px">${htmlEscape(job.title)}</div>
  <div style="font-size:13px;color:#64748b;margin-bottom:8px">${htmlEscape(job.company)} · ${loc}</div>
  <div style="font-size:12px;color:#6366f1;font-weight:600;background:rgba(99,102,241,.08);padding:5px 10px;border-radius:6px;display:inline-block">
    ✨ ${htmlEscape(reason)}
  </div>
</a>`;
}

export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!apiKey || !resendKey) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500 });
  }

  const allUsers = (await kvSmembers('all_users')) || [];
  const BATCH = 20;
  let sent = 0, skipped = 0;

  for (const email of allUsers.slice(0, BATCH)) {
    const [user, profile, optedOut] = await Promise.all([
      kvGet(`user:${email}`),
      kvGet(`profile:${email}`),
      kvGet(`optout:${email}`),
    ]);

    if (optedOut || !user || !profile) { skipped++; continue; }

    // Only run for users who have a meaningful profile
    if (!profile.targetRole && !profile.jobTitle && !profile.skills?.length) { skipped++; continue; }

    // Throttle: skip if sent this week
    const sentKey = `recruitingAgent:sent:${email}`;
    const alreadySent = await kvGet(sentKey);
    if (alreadySent) { skipped++; continue; }

    const jobs = await fetchJobsForProfile(profile);
    if (!jobs.length) { skipped++; continue; }

    const scored = await scoreJobsWithClaude(profile, jobs, apiKey);
    const topJobs = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => ({ ...jobs[s.index], reason: s.reason }))
      .filter(j => j.title);

    if (!topJobs.length) { skipped++; continue; }

    const firstName = htmlEscape((user.name || '').split(' ')[0] || 'là');
    const cardsHtml = topJobs.map(j => jobEmailCard(j, j.reason)).join('');

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Orion IA · Emploia <noreply@emploia.fr>',
          to: [email],
          subject: `🎯 ${topJobs.length} offres sélectionnées pour vous cette semaine`,
          html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:580px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6E48BE,#4f46e5);padding:28px 32px">
      <div style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-.5px">Emploia</div>
      <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px">Votre copilote de candidature IA</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 6px">Bonjour ${firstName} 👋</h1>
      <p style="color:#64748b;font-size:14px;margin:0 0 24px">Orion a analysé le marché et sélectionné <strong>${topJobs.length} offres</strong> qui correspondent à votre profil :</p>
      ${cardsHtml}
      <div style="margin-top:24px;padding:16px;background:rgba(110,72,190,.06);border-radius:12px;border:1px solid rgba(110,72,190,.15)">
        <div style="font-size:13px;color:#6E48BE;font-weight:600;margin-bottom:8px">✨ Postulez avec Emploia</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:12px">Copiez l'URL d'une offre → Emploia génère un CV et une lettre personnalisés en 30 secondes.</div>
        <a href="${BASE_URL}/app" style="display:inline-block;background:linear-gradient(135deg,#6E48BE,#4f46e5);color:#fff;font-weight:700;font-size:13px;padding:10px 20px;border-radius:9px;text-decoration:none">Générer ma candidature →</a>
      </div>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">
    © ${new Date().getFullYear()} Emploia ·
    <a href="${BASE_URL}/profil" style="color:#94a3b8">Mon profil</a> ·
    <a href="${BASE_URL}/api/newsletter?unsubscribe=${encodeURIComponent(email)}" style="color:#94a3b8">Se désabonner</a>
  </p>
</div>
</body></html>`,
        }),
      });

      if (emailRes.ok) {
        await kvSet(sentKey, true, 6 * 86400); // 6 days TTL
        sent++;
      }
    } catch { skipped++; }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped, total: allUsers.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
