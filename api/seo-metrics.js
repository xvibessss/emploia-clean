export const config = { runtime: 'edge' };

// Google Search Console — real SEO metrics for the admin console.
// Auth: a Google service account granted access to the property in GSC.
// Env:
//   GSC_CLIENT_EMAIL   service account email
//   GSC_PRIVATE_KEY    service account private key (PEM, \n-escaped ok)
//   GSC_SITE_URL       e.g. "https://emploia.fr/" or "sc-domain:emploia.fr"
// Gated by ADMIN_SECRET (same header as /api/admin/stats).
// If unconfigured, returns { configured:false } so the UI shows guidance.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function b64url(input) {
  let bin;
  if (typeof input === 'string') bin = btoa(unescape(encodeURIComponent(input)));
  else bin = btoa(String.fromCharCode(...new Uint8Array(input)));
  return bin.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToBytes(pem) {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(clientEmail, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToBytes(privateKeyPem.replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('token ' + r.status);
  return (await r.json()).access_token;
}

async function query(site, token, dimensions, start, end, rowLimit) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: start, endDate: end, dimensions, rowLimit: rowLimit || 1 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('gsc ' + r.status);
  return (await r.json()).rows || [];
}

export default async function handler(req) {
  const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers.get('x-admin-secret') !== adminSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: H });
  }

  const clientEmail = process.env.GSC_CLIENT_EMAIL;
  const privateKey = process.env.GSC_PRIVATE_KEY;
  const site = process.env.GSC_SITE_URL;
  if (!clientEmail || !privateKey || !site) {
    return new Response(JSON.stringify({ configured: false }), { status: 200, headers: H });
  }

  try {
    const end = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10); // GSC lags ~2 days
    const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const token = await getAccessToken(clientEmail, privateKey);
    const [totalsRows, queryRows, pageRows] = await Promise.all([
      query(site, token, [], start, end, 1),
      query(site, token, ['query'], start, end, 10),
      query(site, token, ['page'], start, end, 10),
    ]);
    const t = totalsRows[0] || {};
    const map = (rows) => rows.map((r) => ({
      key: r.keys?.[0] || '', clicks: r.clicks || 0, impressions: r.impressions || 0,
      ctr: +((r.ctr || 0) * 100).toFixed(1), position: +(r.position || 0).toFixed(1),
    }));
    return new Response(JSON.stringify({
      configured: true,
      range: { start, end },
      totals: {
        clicks: t.clicks || 0, impressions: t.impressions || 0,
        ctr: +((t.ctr || 0) * 100).toFixed(1), position: +(t.position || 0).toFixed(1),
      },
      topQueries: map(queryRows),
      topPages: map(pageRows),
    }), { status: 200, headers: H });
  } catch (err) {
    return new Response(JSON.stringify({ configured: true, error: 'Requête Search Console échouée', detail: String(err.message || err) }), { status: 502, headers: H });
  }
}
