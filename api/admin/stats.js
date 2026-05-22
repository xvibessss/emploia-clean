export const config = { runtime: 'nodejs' };

import { kvGet, kvSmembers, kvMget, kvZcard, kvScard } from '../_lib/auth.js';

const PRO_PRICE = 9;
const INTENSIF_PRICE = 19;
const DAY = 86400000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const now = Date.now();

    const allUsers = await kvSmembers('all_users');
    const totalUsers = allUsers.length;

    const [cvGeneratedRaw, usersRegisteredRaw, plansUpgradedRaw] = await Promise.all([
      kvGet('track:cv_generated'),
      kvGet('track:user_registered'),
      kvGet('track:plan_upgraded'),
    ]);

    const cvGenerated = Number(cvGeneratedRaw) || 0;
    const usersRegistered = Number(usersRegisteredRaw) || 0;
    const plansUpgraded = Number(plansUpgradedRaw) || 0;

    const npsEntries = await kvZcard('nps:scores');
    const alertSubscribers = await kvScard('alert_subscribers');
    const newsletterRaw = await kvGet('newsletter_subscribers');
    const newsletterSubscribers = Array.isArray(newsletterRaw) ? newsletterRaw.length : 0;

    const SAMPLE_MAX = 200;
    const sample = allUsers.slice(0, SAMPLE_MAX);
    const isSampled = totalUsers > SAMPLE_MAX;

    let planCounts = { free: 0, pro: 0, intensif: 0 };
    let activeLast7d = 0;
    let activeLast30d = 0;
    let newToday = 0;
    let newThisWeek = 0;
    let resolvedCount = 0;

    if (sample.length > 0) {
      const keys = sample.map((email) => `user:${email}`);
      const userDataRaw = await kvMget(...keys);

      for (const u of userDataRaw) {
        if (!u) continue;
        resolvedCount++;

        const plan = u.plan || 'free';
        if (plan === 'pro') planCounts.pro++;
        else if (plan === 'intensif') planCounts.intensif++;
        else planCounts.free++;

        const createdAt = u.createdAt ? new Date(u.createdAt).getTime() : 0;
        const lastLoginAt = u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0;
        const activityRef = lastLoginAt || createdAt;

        if (activityRef > now - 7 * DAY) activeLast7d++;
        if (activityRef > now - 30 * DAY) activeLast30d++;
        if (createdAt > now - DAY) newToday++;
        if (createdAt > now - 7 * DAY) newThisWeek++;
      }
    }

    const proRevenue = planCounts.pro * PRO_PRICE;
    const intensifRevenue = planCounts.intensif * INTENSIF_PRICE;
    const mrr = proRevenue + intensifRevenue;
    const arr = mrr * 12;
    const paidCount = planCounts.pro + planCounts.intensif;
    const conversionRate = resolvedCount > 0
      ? ((paidCount / resolvedCount) * 100).toFixed(1) + '%'
      : '0.0%';

    const response = {
      generatedAt: new Date().toISOString(),
      users: { total: totalUsers, byPlan: planCounts, activeLast7d, activeLast30d, newToday, newThisWeek, conversionRate },
      revenue: { mrr, arr, proRevenue, intensifRevenue },
      events: { cvGenerated, usersRegistered, plansUpgraded },
      other: {
        alertSubscribers: Number(alertSubscribers) || 0,
        newsletterSubscribers: Number(newsletterSubscribers) || 0,
        npsEntries: Number(npsEntries) || 0,
      },
    };

    if (isSampled) {
      response.users.sampleSize = resolvedCount;
      response.users.sampleOf = totalUsers;
      response._note = `User metrics computed on a sample of ${SAMPLE_MAX}/${totalUsers} users.`;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error('[admin/stats] Error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
