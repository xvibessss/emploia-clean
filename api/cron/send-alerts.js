export const config = { runtime: 'edge' };
import { kvGet, kvSet, kvSmembers, htmlEscape } from '../_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

// Arbeitnow job_types values matching our contract types
const TYPE_MAP = {
  CDI: 'full_time',
  CDD: 'temporary',
  Stage: 'internship',
  Alternance: 'apprenticeship',
  Freelance: 'freelance',
};

async function fetchJobs(keywords, location, type) {
  try {
    const params = new URLSearchParams({ search: keywords });
    if (location) params.set('location', location);
    const res = await fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const targetType = TYPE_MAP[type];
    let jobs = (data.data || []);
    if (targetType) jobs = jobs.filter(j => (j.job_types || []).includes(targetType));
    return jobs.slice(0, 5).map(j => ({
      title: j.title || '',
      company: j.company_name || '',
      location: j.location || '',
      url: (j.url && /^https?:\/\//i.test(j.url)) ? j.url : `${BASE_URL}/jobs`,
      remote: !!j.remote,
    }));
  } catch { return []; }
}

function jobCard(job) {
  const loc = [htmlEscape(job.location), job.remote ? 'Télétravail' : ''].filter(Boolean).join(' · ');
  return `<a href="${htmlEscape(job.url)}" style="display:block;padding:14px;background:#f8fafc;border-radius:10px;text-decoration:none;margin-bottom:8px;border:1px solid #e2e8f0">
  <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px">${htmlEscape(job.title)}</div>
  <div style="font-size:12px;color:#64748b">${htmlEscape(job.company)} · ${loc}</div>
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

  const subscribers = (await kvSmembers('alert_subscribers')) || [];
  const today = new Date().toISOString().split('T')[0];

  let sent = 0;
  let skipped = 0;

  // Cursor-based pagination: rotate through all subscribers across cron runs
  // so no subscriber is permanently skipped when total > 60.
  const BATCH_SIZE = 60;
  const total = subscribers.length;
  const rawCursor = await kvGet('alert_cursor') || 0;
  const cursor = typeof rawCursor === 'number' ? rawCursor : 0;
  const start = cursor % Math.max(total, 1);
  const batch = subscribers.slice(start, start + BATCH_SIZE);
  // Advance cursor — wrap to 0 when we've covered all subscribers
  const nextCursor = (start + BATCH_SIZE >= total) ? 0 : start + BATCH_SIZE;
  await kvSet('alert_cursor', nextCursor, 86400 * 7);

  for (const email of batch) {
    const [alerts, user] = await Promise.all([
      kvGet(`alerts:${email}`),
      kvGet(`user:${email}`),
    ]);
    if (!user || !alerts?.length) continue;

    const activeAlerts = alerts.filter(a => a.active);
    if (!activeAlerts.length) continue;

    const firstName = htmlEscape((user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || 'là');

    // Parallel: check all sent-flags at once instead of sequentially
    const sentChecks = await Promise.all(activeAlerts.map(a => kvGet(`alertSent:${email}:${a.id}`)));
    const unsentAlerts = activeAlerts.filter((_, i) => !sentChecks[i]);
    skipped += activeAlerts.length - unsentAlerts.length;

    if (!unsentAlerts.length) continue;

    // Parallel: fetch jobs for all unsent alerts at once (each fetch can take up to 8s)
    const jobsResults = await Promise.allSettled(unsentAlerts.map(a => fetchJobs(a.keywords, a.location, a.type)));

    const sections = unsentAlerts
      .map((alert, i) => ({ alert, jobs: jobsResults[i].status === 'fulfilled' ? jobsResults[i].value : [] }))
      .filter(({ jobs }) => jobs.length > 0);

    if (!sections.length) continue;

    const firstKeywords = htmlEscape(sections[0].alert.keywords);
    const bodyHtml = sections.map(({ alert, jobs }) => `
      <div style="margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">
          🔔 ${htmlEscape(alert.keywords)}${alert.location ? ` · ${htmlEscape(alert.location)}` : ''}${alert.type !== 'all' ? ` · ${htmlEscape(alert.type)}` : ''}
        </div>
        ${jobs.map(jobCard).join('')}
      </div>
    `).join('');

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Emploia Alertes <noreply@emploia.fr>',
          to: [email],
          subject: `🔔 Nouvelles offres : ${firstKeywords}`,
          html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:580px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 6px">Nouvelles offres pour vous, ${firstName} !</h1>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 24px">${today}</p>
      ${bodyHtml}
      <a href="${BASE_URL}/jobs" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none">Voir toutes les offres →</a>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">
    © ${new Date().getFullYear()} Emploia ·
    <a href="${BASE_URL}/alerts" style="color:#94a3b8">Gérer mes alertes</a> ·
    <a href="${BASE_URL}/api/newsletter?unsubscribe=${encodeURIComponent(email)}" style="color:#94a3b8">Se désabonner</a>
  </p>
</div>
</body></html>`,
        }),
      });

      // Mark each alert as sent with appropriate TTL
      await Promise.all(sections.map(({ alert }) => {
        const ttl = alert.frequency === 'weekly' ? 6 * 86400 : 22 * 3600;
        return kvSet(`alertSent:${email}:${alert.id}`, today, ttl);
      }));

      sent++;
    } catch { /* continue to next subscriber */ }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped, processed: batch.length, totalSubscribers: total, nextCursor }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
