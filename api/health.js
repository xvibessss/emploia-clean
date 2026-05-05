export const config = { runtime: 'edge' };

export default async function handler(req) {
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };

  const checks = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    stripe: !!process.env.STRIPE_SECRET_KEY,
    jwt: !!process.env.JWT_SECRET,
    upstash: !!(process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL),
    jsearch: !!process.env.JSEARCH_API_KEY,
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
