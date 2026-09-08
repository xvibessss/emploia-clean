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

    // Lifetime event counters (funnel stages + engagement).
    const EVENTS = [
      'user_registered', 'cv_generated', 'letter_generated', 'ats_checked',
      'interview_started', 'paywall_viewed', 'checkout_started', 'plan_upgraded',
      'referral_code_created', 'referral_signup',
      'email_sent', 'email_delivered', 'email_opened', 'email_clicked', 'email_bounced', 'email_complained',
    ];
    const counterVals = await kvMget(...EVENTS.map((e) => `track:${e}`));
    const counts = {};
    EVENTS.forEach((e, i) => { counts[e] = Number(counterVals[i]) || 0; });

    const cvGenerated = counts.cv_generated;
    const usersRegistered = counts.user_registered;
    const plansUpgraded = counts.plan_upgraded;

    // Conversion funnel (event volumes). pct = stage / previous stage.
    const pct = (a, b) => (b > 0 ? +((a / b) * 100).toFixed(1) : null);
    const funnel = [
      { stage: 'registered', label: 'Inscriptions', count: counts.user_registered },
      { stage: 'cv_generated', label: 'CV généré', count: counts.cv_generated, conversionFromPrev: pct(counts.cv_generated, counts.user_registered) },
      { stage: 'paywall_viewed', label: 'Paywall vu', count: counts.paywall_viewed, conversionFromPrev: pct(counts.paywall_viewed, counts.cv_generated) },
      { stage: 'checkout_started', label: 'Checkout lancé', count: counts.checkout_started, conversionFromPrev: pct(counts.checkout_started, counts.paywall_viewed) },
      { stage: 'plan_upgraded', label: 'Abonnement', count: counts.plan_upgraded, conversionFromPrev: pct(counts.plan_upgraded, counts.checkout_started) },
    ];

    // Daily time-series (last 14 days) for the key funnel events.
    const DAILY_EVENTS = ['user_registered', 'cv_generated', 'checkout_started', 'plan_upgraded'];
    const DAYS = 14;
    const days = Array.from({ length: DAYS }, (_, i) => new Date(now - (DAYS - 1 - i) * DAY).toISOString().slice(0, 10));
    const dailyKeys = [];
    for (const ev of DAILY_EVENTS) for (const d of days) dailyKeys.push(`track:${ev}:${d}`);
    const dailyVals = await kvMget(...dailyKeys);
    const daily = { days };
    DAILY_EVENTS.forEach((ev, ei) => {
      daily[ev] = days.map((_, di) => Number(dailyVals[ei * DAYS + di]) || 0);
    });

    // Referral (Part 1) and email deliverability (Part 2) aggregates.
    const referral = {
      codesCreated: counts.referral_code_created,
      signups: counts.referral_signup,
      conversion: pct(counts.referral_signup, counts.referral_code_created),
    };
    const email = {
      sent: counts.email_sent,
      delivered: counts.email_delivered,
      opened: counts.email_opened,
      clicked: counts.email_clicked,
      bounced: counts.email_bounced,
      complained: counts.email_complained,
      openRate: pct(counts.email_opened, counts.email_delivered),
      clickRate: pct(counts.email_clicked, counts.email_delivered),
      configured: (counts.email_sent + counts.email_delivered + counts.email_opened) > 0,
    };

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
      events: {
        cvGenerated, usersRegistered, plansUpgraded,
        letterGenerated: counts.letter_generated,
        atsChecked: counts.ats_checked,
        interviewStarted: counts.interview_started,
        paywallViewed: counts.paywall_viewed,
        checkoutStarted: counts.checkout_started,
      },
      funnel,
      daily,
      referral,
      email,
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
