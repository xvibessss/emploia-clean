export const config = { runtime: 'edge' };
import { getCurrentUser, kvGet, kvSet, getAllowedOrigin, checkRateLimit, validateEmail } from './_lib/auth.js';

// Referral system:
// KV keys:
//   ref:{code}        → { userId, email, signups: [email,...], monthsEarned: 0, createdAt }
//   refcode:{userId}  → code  (lookup by user)

function genCode(userId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seed = userId.slice(-8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    const idx = (seed.charCodeAt(i % seed.length) + i * 7) % chars.length;
    code += chars[idx];
  }
  return code;
}

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
  });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'referral', 30, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  // GET /api/referral — get or create referral code for logged-in user
  if (req.method === 'GET') {
    const user = await getCurrentUser(req);
    if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

    let code = await kvGet(`refcode:${user.id}`);
    if (!code) {
      code = genCode(user.id);
      const refData = { userId: user.id, email: user.email, signups: [], monthsEarned: 0, createdAt: new Date().toISOString() };
      await kvSet(`ref:${code}`, refData);
      await kvSet(`refcode:${user.id}`, code);
    }

    const refData = await kvGet(`ref:${code}`) || {};
    return new Response(JSON.stringify({
      code,
      link: `https://emploia.fr/?ref=${code}`,
      signups: (refData.signups || []).length,
      monthsEarned: refData.monthsEarned || 0,
    }), { status: 200, headers: H });
  }

  // POST /api/referral — track a referral signup (called during register if ?ref= in URL)
  if (req.method === 'POST') {
    const bodyText = await req.text();
    if (bodyText.length > 500) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
    let body;
    try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

    const { code, newUserEmail } = body;
    if (!code || !newUserEmail) return new Response(JSON.stringify({ error: 'code et newUserEmail requis' }), { status: 400, headers: H });

    // Validate code format
    if (!/^[A-Z0-9]{8}$/.test(code)) return new Response(JSON.stringify({ error: 'Code invalide' }), { status: 400, headers: H });

    // Validate email to prevent garbage data in signups list
    if (!validateEmail(String(newUserEmail).toLowerCase().trim())) {
      return new Response(JSON.stringify({ error: 'Email invalide' }), { status: 400, headers: H });
    }
    const normalizedNewEmail = String(newUserEmail).toLowerCase().trim();

    const [refData, newUser] = await Promise.all([
      kvGet(`ref:${code}`),
      kvGet(`user:${normalizedNewEmail}`),
    ]);
    if (!refData) return new Response(JSON.stringify({ error: 'Code introuvable' }), { status: 404, headers: H });
    // Don't reveal whether the email exists in the system
    if (!newUser) return new Response(JSON.stringify({ ok: false }), { status: 200, headers: H });

    // Don't let the owner refer themselves
    if (refData.email === normalizedNewEmail) return new Response(JSON.stringify({ ok: false, reason: 'self' }), { status: 200, headers: H });

    // Don't double-count
    if ((refData.signups || []).includes(normalizedNewEmail)) {
      return new Response(JSON.stringify({ ok: false, reason: 'already_counted' }), { status: 200, headers: H });
    }

    const signups = [...(refData.signups || []), normalizedNewEmail];
    const monthsEarned = Math.min(6, Math.floor(signups.length)); // max 6 months
    await kvSet(`ref:${code}`, { ...refData, signups, monthsEarned });

    // Update referrer's plan if they've earned a free month (simplified — real impl needs Stripe)
    const referrerUser = await kvGet(`user:${refData.email}`);
    if (referrerUser) {
      await kvSet(`user:${refData.email}`, {
        ...referrerUser,
        referralMonths: monthsEarned,
        referralSignups: signups.length,
      });
    }

    return new Response(JSON.stringify({ ok: true, signups: signups.length, monthsEarned }), { status: 200, headers: H });
  }

  return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });
}
