export const config = { runtime: 'edge' };

async function pingUpstash() {
  const url = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['PING']),
    });
    const data = await res.json();
    return data?.result === 'PONG';
  } catch {
    return false;
  }
}

export default async function handler(req) {
  const H = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  // Detailed checks require the internal secret — public callers only get status
  const url = new URL(req.url);
  const providedSecret = req.headers.get('x-health-secret') || url.searchParams.get('secret');
  const healthSecret = process.env.HEALTH_SECRET;
  const isInternal = healthSecret && providedSecret === healthSecret;

  const coreOk = !!(process.env.ANTHROPIC_API_KEY && process.env.JWT_SECRET);

  if (!isInternal) {
    // Public response: just status + timestamp, no service enumeration
    return new Response(JSON.stringify({
      status: coreOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
    }), { status: coreOk ? 200 : 503, headers: H });
  }

  // Authenticated detailed check
  const upstashLive = await pingUpstash();
  const checks = {
    anthropic:    !!process.env.ANTHROPIC_API_KEY,
    stripe:       !!process.env.STRIPE_SECRET_KEY,
    jwt:          !!process.env.JWT_SECRET,
    upstash:      upstashLive,
    jsearch:      !!process.env.RAPIDAPI_KEY,
    franceTravail:!!(process.env.FRANCE_TRAVAIL_CLIENT_ID && process.env.FRANCE_TRAVAIL_CLIENT_SECRET),
    adzuna:       !!process.env.ADZUNA_APP_ID,
    resend:       !!process.env.RESEND_API_KEY,
    vapid:        !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    google:       !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const total  = Object.keys(checks).length;

  return new Response(JSON.stringify({
    status: checks.anthropic && checks.jwt && checks.upstash ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: checks,
    score: `${passed}/${total}`,
    jobApis: {
      live: [
        checks.jsearch      && 'JSearch (Indeed+LinkedIn)',
        checks.franceTravail && 'France Travail',
        checks.adzuna        && 'Adzuna',
        'Arbeitnow (gratuit)',
        'Remotive (gratuit)',
      ].filter(Boolean),
    },
  }), { status: 200, headers: H });
}
