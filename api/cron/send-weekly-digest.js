export const config = { runtime: 'edge' };
import { kvGet, htmlEscape } from '../_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

// Fetch trending jobs from Arbeitnow (free, no key)
async function fetchTrendingJobs() {
  try {
    const res = await fetch('https://www.arbeitnow.com/api/job-board-api?search=développeur+manager+marketing+data', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).slice(0, 6).map(j => ({
      title: j.title || '',
      company: j.company_name || '',
      location: j.location || 'France',
      url: (j.url && /^https?:\/\//i.test(j.url)) ? j.url : `${BASE_URL}/jobs`,
      remote: !!j.remote,
    }));
  } catch { return []; }
}

// Latest blog articles (static — update when new articles are added)
const RECENT_ARTICLES = [
  { slug: 'reseaux-sociaux-recherche-emploi', title: 'Réseaux sociaux et recherche d\'emploi : guide 2026',           emoji: '🌐' },
  { slug: 'preparer-entretien-technique',     title: 'Préparer un entretien technique en 48h',                        emoji: '💻' },
  { slug: 'email-candidature-parfait',        title: "L'email de candidature parfait — structure + exemples",         emoji: '✉️' },
  { slug: 'secteurs-qui-recrutent-2026',      title: 'Les 10 secteurs qui recrutent le plus en 2026',                emoji: '📈' },
  { slug: 'ia-et-emploi-2026',               title: 'IA et emploi 2026 : ce qui change pour les candidats',          emoji: '🤖' },
];

function jobRow(job) {
  const loc = [htmlEscape(job.location), job.remote ? 'Télétravail' : ''].filter(Boolean).join(' · ');
  return `<a href="${htmlEscape(job.url)}" style="display:flex;align-items:center;gap:14px;padding:12px 14px;background:#f8fafc;border-radius:10px;text-decoration:none;margin-bottom:8px;border:1px solid #e2e8f0">
  <div style="flex:1;min-width:0">
    <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${htmlEscape(job.title)}</div>
    <div style="font-size:11px;color:#64748b">${htmlEscape(job.company)} · ${loc}</div>
  </div>
  <span style="color:#6366f1;font-size:13px;flex-shrink:0">→</span>
</a>`;
}

function articleRow(article) {
  return `<a href="${BASE_URL}/blog/${article.slug}" style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:10px;text-decoration:none;margin-bottom:8px">
  <span style="font-size:20px;flex-shrink:0">${article.emoji}</span>
  <div style="font-size:13px;font-weight:700;color:#0f172a">${htmlEscape(article.title)}</div>
</a>`;
}

export default async function handler(req) {
  // Vercel injects Authorization: Bearer <CRON_SECRET> for scheduled calls
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return new Response(JSON.stringify({ error: 'No RESEND_API_KEY' }), { status: 500 });

  const [subscribers, jobs] = await Promise.all([
    kvGet('newsletter_subscribers'),
    fetchTrendingJobs(),
  ]);

  if (!Array.isArray(subscribers) || !subscribers.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no_subscribers' }), { status: 200 });
  }

  const week = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const articles = RECENT_ARTICLES.slice(0, 3);

  const jobsSection = jobs.length
    ? `<div style="margin-bottom:28px">
         <p style="font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:.5px;margin:0 0 12px">🔥 Offres de la semaine</p>
         ${jobs.map(jobRow).join('')}
         <a href="${BASE_URL}/jobs" style="font-size:12px;color:#6366f1;text-decoration:none;font-weight:600">Voir toutes les offres →</a>
       </div>`
    : '';

  const articlesSection = `<div style="margin-bottom:28px">
    <p style="font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:.5px;margin:0 0 12px">📚 Guides de la semaine</p>
    ${articles.map(articleRow).join('')}
  </div>`;

  const TIPS = [
    'Personnalisez le premier paragraphe de chaque lettre de motivation avec un fait précis sur l\'entreprise. Les recruteurs lisent les 3 premières lignes avant de décider de continuer.',
    'Relancez votre candidature après 10-14 jours sans réponse. 80 % des recruteurs apprécient un suivi professionnel et 30 % y répondent favorablement.',
    'Ajoutez des chiffres concrets à votre CV : "augmenté le CA de 23 %", "géré 12 projets simultanés". Les CV chiffrés ont 40 % de chances d\'être rappelés en plus.',
    'Vérifiez le score ATS de votre CV avant d\'envoyer. Un CV sans les bons mots-clés n\'atteint jamais les yeux d\'un recruteur — Emploia le fait en 30 secondes.',
    'Avant un entretien, préparez 3 questions sur l\'équipe, le poste et les 90 premiers jours. Les candidats qui posent des questions pertinentes sont mémorisés.',
    'Optimisez votre titre LinkedIn : intégrez le nom exact du poste que vous cherchez. C\'est le premier champ que les recruteurs utilisent pour vous trouver.',
  ];
  const tip = TIPS[new Date().getDay() % TIPS.length];
  const tipSection = `<div style="background:#f0f9ff;border-left:4px solid #6366f1;padding:16px;border-radius:0 12px 12px 0;margin-bottom:28px">
    <p style="font-size:12px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.5px;margin:0 0 6px">💡 Conseil de la semaine</p>
    <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0">${tip}</p>
  </div>`;

  // Process in batches of 80 to stay within Edge timeout and Resend limits
  const batch = subscribers.slice(0, 80);
  let sent = 0;

  for (const sub of batch) {
    const email = sub.email;
    if (!email) continue;

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(6000),
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Emploia <noreply@emploia.fr>',
          to: [email],
          subject: `📬 Emploia Hebdo — Semaine du ${week}`,
          html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:580px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px;display:flex;align-items:center;justify-content:space-between">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff">Emploia</div>
      <div style="color:rgba(255,255,255,.8);font-size:12px">${week}</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 6px">Votre récap emploi de la semaine</h1>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 28px">Offres, guides et conseils sélectionnés pour vous</p>
      ${jobsSection}
      ${articlesSection}
      ${tipSection}
      <a href="${BASE_URL}/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:14px;padding:14px 28px;border-radius:11px;text-decoration:none">Ouvrir Emploia →</a>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">
    © ${new Date().getFullYear()} Emploia ·
    <a href="${BASE_URL}/jobs" style="color:#94a3b8">Offres</a> ·
    <a href="${BASE_URL}/blog" style="color:#94a3b8">Blog</a> ·
    <a href="${BASE_URL}/api/newsletter?unsubscribe=${encodeURIComponent(email)}" style="color:#94a3b8">Se désabonner</a>
  </p>
</div>
</body></html>`,
        }),
      });
      sent++;
    } catch { /* continue */ }
  }

  return new Response(JSON.stringify({
    ok: true,
    sent,
    total: batch.length,
    remaining: Math.max(0, subscribers.length - 80),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
