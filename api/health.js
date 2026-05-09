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
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };

  const [upstashLive] = await Promise.all([pingUpstash()]);

  const checks = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    stripe: !!process.env.STRIPE_SECRET_KEY,
    jwt: !!process.env.JWT_SECRET,
    upstash: upstashLive,
    jsearch: !!process.env.RAPIDAPI_KEY,
    franceTravail: !!process.env.FRANCE_TRAVAIL_CLIENT_ID,
    adzuna: !!process.env.ADZUNA_APP_ID,
  };

  const allOk = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;

  return new Response(JSON.stringify({
    status: checks.anthropic && checks.jwt ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: checks,
    score: `${allOk}/${total} services configurés`,
    jobApis: {
      live: [
        checks.jsearch && 'JSearch (Indeed+LinkedIn)',
        checks.franceTravail && 'France Travail',
        checks.adzuna && 'Adzuna',
        'Arbeitnow (gratuit)',
        'Remotive (gratuit)',
      ].filter(Boolean),
      demo: !checks.jsearch && !checks.franceTravail && !checks.adzuna,
    }
  }), { status: 200, headers: H });
}
