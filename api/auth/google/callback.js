export const config = { runtime: 'edge' };
import { kvGet, kvSet, signToken, setCookieHeader } from '../../_lib/auth.js';

export default async function handler(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return new Response(null, { status: 302, headers: { Location: '/?error=google_denied' } });
  }

  // Validate CSRF state
  const cookies = req.headers.get('cookie') || '';
  const cookieState = cookies.match(/emp_oauth_state=([^;]+)/)?.[1];

  if (!code || !state || state !== cookieState) {
    return new Response(null, { status: 302, headers: { Location: '/?error=oauth_invalid' } });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return new Response(null, { status: 302, headers: { Location: '/?error=google_not_configured' } });
  }

  try {
    const baseUrl = `${url.protocol}//${url.host}`;

    // Exchange code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${baseUrl}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) throw new Error('Token exchange failed');
    const tokens = await tokenRes.json();

    // Get user info from Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) throw new Error('Failed to get user info');
    const googleUser = await userRes.json();

    const email = googleUser.email?.toLowerCase();
    if (!email) throw new Error('No email returned by Google');

    // Find or create user
    let user = await kvGet(`user:${email}`);
    if (!user) {
      const id = `u_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      user = {
        id,
        name: googleUser.name || email.split('@')[0],
        email,
        passwordHash: null,
        passwordSalt: null,
        provider: 'google',
        googleId: googleUser.id,
        avatar: googleUser.picture || null,
        generationsUsed: 0,
        plan: 'free',
        createdAt: new Date().toISOString(),
      };
      await kvSet(`user:${email}`, user);
      await kvSet(`userid:${id}`, email);
    } else if (!user.googleId) {
      user.googleId = googleUser.id;
      user.avatar = googleUser.picture || user.avatar;
      await kvSet(`user:${email}`, user);
    }

    const token = await signToken(user.id);
    const headers = new Headers({ Location: '/dashboard' });
    headers.append('Set-Cookie', setCookieHeader(token));
    headers.append('Set-Cookie', 'emp_oauth_state=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure');
    return new Response(null, { status: 302, headers });

  } catch (err) {
    console.error('Google OAuth error:', err);
    return new Response(null, { status: 302, headers: { Location: '/?error=oauth_failed' } });
  }
}
