export const config = { runtime: 'edge' };
import { kvGet, kvSmembers, checkRateLimit } from './_lib/auth.js';

// Admin-only stats endpoint — requires ADMIN_SECRET header.
// Never exposed to regular users; returns aggregate metrics.

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

  // Rate limit: 10 req/hour per IP to prevent brute-force of ADMIN_SECRET
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'admin', 10, 3600);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Trop de requêtes' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' },
    });
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers.get('x-admin-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const url = new URL(req.url);
  const detail = url.searchParams.get('detail') === '1';

  // Parallel reads
  const [allUsers, alertSubs, newsletterSubs, employerJobs] = await Promise.allSettled([
    kvSmembers('all_users'),
    kvSmembers('alert_subscribers'),
    kvGet('newsletter_subscribers'),
    kvGet('employer_jobs'),
  ]);

  const users = allUsers.status === 'fulfilled' ? allUsers.value : [];
  const alerts = alertSubs.status === 'fulfilled' ? alertSubs.value : [];
  const newsletter = newsletterSubs.status === 'fulfilled' ? (newsletterSubs.value || []) : [];
  const jobs = employerJobs.status === 'fulfilled' ? (employerJobs.value || []) : [];

  const stats = {
    users: {
      total: users.length,
    },
    alerts: {
      subscribers: alerts.length,
    },
    newsletter: {
      subscribers: newsletter.length,
    },
    employerJobs: {
      total: Array.isArray(jobs) ? jobs.length : 0,
      active: Array.isArray(jobs) ? jobs.filter(j => j.status === 'active').length : 0,
    },
    generatedAt: new Date().toISOString(),
  };

  // Detailed mode: sample recent users for plan breakdown (max 200)
  if (detail && users.length > 0) {
    const sample = users.slice(0, 200);
    const userData = await Promise.allSettled(sample.map(email => kvGet(`user:${email}`)));
    const resolved = userData.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);

    const planCounts = { free: 0, pro: 0, intensif: 0, other: 0 };
    const now = Date.now();
    const last7d = now - 7 * 86400000;
    const last30d = now - 30 * 86400000;
    let recentSignups7d = 0;
    let recentSignups30d = 0;

    for (const u of resolved) {
      const plan = u.plan || 'free';
      planCounts[plan] = (planCounts[plan] || 0) + 1;
      const created = u.createdAt ? new Date(u.createdAt).getTime() : 0;
      if (created > last7d) recentSignups7d++;
      if (created > last30d) recentSignups30d++;
    }

    stats.users.planBreakdown = planCounts;
    stats.users.recentSignups7d = recentSignups7d;
    stats.users.recentSignups30d = recentSignups30d;
    stats.users.sampleSize = resolved.length;
  }

  return new Response(JSON.stringify(stats, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
