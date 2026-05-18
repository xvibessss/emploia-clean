export const config = { runtime: 'edge' };
import { kvGet, kvSet, kvSmembers, htmlEscape } from '../_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

// Every Sunday at 8am: send each active user a short progress recap.
// "Active" = has at least 1 application OR at least 1 generation.
// Cursor-based so large user bases are processed across multiple runs.

export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return new Response(JSON.stringify({ error: 'No RESEND_API_KEY' }), { status: 500 });

  const allUsers = (await kvSmembers('all_users')) || [];
  const total = allUsers.length;

  const BATCH_SIZE = 60;
  const rawCursor = await kvGet('weekly_report_cursor') || 0;
  const cursor = typeof rawCursor === 'number' ? rawCursor : 0;
  const start = cursor % Math.max(total, 1);
  const batch = allUsers.slice(start, start + BATCH_SIZE);
  const nextCursor = (start + BATCH_SIZE >= total) ? 0 : start + BATCH_SIZE;
  await kvSet('weekly_report_cursor', nextCursor, 86400 * 14);

  const today = new Date().toISOString().split('T')[0];
  const now = Date.now();
  const oneWeek = 7 * 86400000;

  let sent = 0;
  let skipped = 0;

  for (const email of batch) {
    const alreadySent = await kvGet(`wreport:${email}:${today.slice(0, 7)}`);
    if (alreadySent) { skipped++; continue; }

    const [user, apps] = await Promise.all([
      kvGet(`user:${email}`),
      kvGet(`apps:${email}`),
    ]);
    if (!user) { skipped++; continue; }

    const appList = Array.isArray(apps) ? apps : [];
    const genCount = user.generationsUsed || 0;

    // Only email users who have done something
    if (appList.length === 0 && genCount === 0) { skipped++; continue; }

    const thisWeekApps = appList.filter(a => now - (a.createdAt || 0) < oneWeek);
    const interviews = appList.filter(a => a.status === 'interview' || a.status === 'offer').length;
    const overdueRelances = appList.filter(a => a.status === 'applied' && now - (a.updatedAt || a.createdAt || 0) > 14 * 86400000).length;
    const interviewRate = appList.length > 0 ? Math.round((interviews / appList.length) * 100) : 0;

    const firstNameRaw = (user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || '';
    const firstName = htmlEscape(firstNameRaw || 'là');

    // Build stat rows
    const statRows = [
      appList.length > 0 ? `<tr><td style="padding:8px 0;color:#64748b;font-size:13px">Candidatures totales</td><td style="padding:8px 0;font-size:14px;font-weight:700;color:#0f172a;text-align:right">${appList.length}</td></tr>` : '',
      thisWeekApps.length > 0 ? `<tr><td style="padding:8px 0;color:#64748b;font-size:13px">Envoyées cette semaine</td><td style="padding:8px 0;font-size:14px;font-weight:700;color:#6366f1;text-align:right">+${thisWeekApps.length}</td></tr>` : '',
      interviews > 0 ? `<tr><td style="padding:8px 0;color:#64748b;font-size:13px">Entretiens obtenus</td><td style="padding:8px 0;font-size:14px;font-weight:700;color:#22c55e;text-align:right">${interviews}</td></tr>` : '',
      appList.length > 0 ? `<tr><td style="padding:8px 0;color:#64748b;font-size:13px">Taux d'entretien</td><td style="padding:8px 0;font-size:14px;font-weight:700;color:#0f172a;text-align:right">${interviewRate}%</td></tr>` : '',
      genCount > 0 ? `<tr><td style="padding:8px 0;color:#64748b;font-size:13px">CV générés</td><td style="padding:8px 0;font-size:14px;font-weight:700;color:#0f172a;text-align:right">${genCount}${user.plan === 'free' ? ` / 5` : ''}</td></tr>` : '',
    ].filter(Boolean).join('');

    const actionHtml = overdueRelances > 0
      ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:20px"><p style="font-size:13px;font-weight:700;color:#92400e;margin:0 0 4px">⏰ ${overdueRelances} relance${overdueRelances > 1 ? 's' : ''} à faire</p><p style="font-size:12px;color:#92400e;margin:0">${overdueRelances > 1 ? 'Ces candidatures' : 'Cette candidature'} n'ont pas eu de réponse depuis +14 jours. Relancez maintenant !</p></div>`
      : thisWeekApps.length === 0
      ? `<div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:20px"><p style="font-size:13px;font-weight:700;color:#166534;margin:0 0 4px">🎯 Objectif de la semaine</p><p style="font-size:12px;color:#166534;margin:0">Visez 5 nouvelles candidatures cette semaine — la régularité est la clé.</p></div>`
      : '';

    const upgradeHtml = user.plan === 'free' && (user.generationsUsed || 0) >= 3
      ? `<div style="margin-top:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px 20px"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 6px">🚀 Passez Pro pour aller plus loin</p><p style="font-size:12px;color:#64748b;margin:0 0 12px">Générations illimitées · Alertes avancées · Coaching entretien illimité</p><a href="${BASE_URL}/#pricing" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:700;font-size:13px;padding:10px 20px;border-radius:9px;text-decoration:none">Essai gratuit 7 jours →</a></div>`
      : '';

    const headline = interviews > 0
      ? `🏆 Vous avez décroché ${interviews} entretien${interviews > 1 ? 's' : ''} !`
      : thisWeekApps.length > 0
      ? `📊 +${thisWeekApps.length} candidature${thisWeekApps.length > 1 ? 's' : ''} cette semaine`
      : `📊 Votre bilan de la semaine`;

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Emploia <noreply@emploia.fr>',
          to: [email],
          subject: `${headline} — Bilan Emploia`,
          html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 6px">${headline}</h1>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 24px">Semaine du ${new Date(now - 7 * 86400000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} — ${new Date(now).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      ${statRows ? `<table style="width:100%;border-collapse:collapse;margin-bottom:24px;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9">${statRows}</table>` : ''}
      ${actionHtml}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a href="${BASE_URL}/dashboard" style="flex:1;min-width:120px;display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:700;font-size:13px;padding:11px 16px;border-radius:10px;text-decoration:none;text-align:center">Mon dashboard →</a>
        <a href="${BASE_URL}/jobs" style="flex:1;min-width:120px;display:inline-block;background:var(--s3,#f8fafc);color:#0f172a;font-weight:700;font-size:13px;padding:11px 16px;border-radius:10px;text-decoration:none;text-align:center;border:1px solid #e2e8f0">Voir les offres</a>
      </div>
      ${upgradeHtml}
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">
    © ${new Date().getFullYear()} Emploia ·
    <a href="${BASE_URL}/dashboard" style="color:#94a3b8">Mon espace</a> ·
    <a href="${BASE_URL}/api/newsletter?unsubscribe=${encodeURIComponent(email)}" style="color:#94a3b8">Se désabonner</a>
  </p>
</div>
</body></html>`,
        }),
      });

      // One report per user per month — key by year-month
      await kvSet(`wreport:${email}:${today.slice(0, 7)}`, true, 86400 * 35);
      sent++;
    } catch { /* continue */ }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped, processed: batch.length, totalUsers: total, nextCursor }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
