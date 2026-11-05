export const config = { runtime: 'edge', regions: ['cdg1'] };
import { checkRateLimit } from '../_lib/auth.js';

export default async function handler(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response(null, { status: 302, headers: { Location: '/?error=google_not_configured' } });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'google-oauth', 10, 600);
  if (!rl.allowed) {
    return new Response(null, { status: 302, headers: { Location: '/?error=trop_de_tentatives' } });
  }

  const state = crypto.randomUUID();
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://emploia.eu';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  const headers = new Headers({ Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  headers.append('Set-Cookie', `emp_oauth_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`);
  // Un parrainage capté (?ref=) traverse l'aller-retour Google dans un cookie
  // à part : le callback ne le crédite que si le compte est créé à ce moment-là.
  const ref = (new URL(req.url).searchParams.get('ref') || '').trim().toUpperCase();
  if (/^[A-Z0-9]{8}$/.test(ref)) {
    headers.append('Set-Cookie', `emp_oauth_ref=${ref}; HttpOnly; Path=/api/auth/google; Max-Age=600; SameSite=Lax; Secure`);
  }
  return new Response(null, { status: 302, headers });
}
